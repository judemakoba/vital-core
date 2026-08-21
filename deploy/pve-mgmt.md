# PVE Management LXC (pct 201)

A small Debian 13 LXC that serves as the single Tailscale-fronted
ingress for managing the Proxmox host: web UI on port 8006 reverse-
proxied with a real Tailscale-issued cert, and SSH access to the
PVE host via a ProxyJump through the LXC. No port forwarding, no
public exposure of either service, no Tailscale on the PVE host
itself.

**On the tailnet:** `pve-mgmt.tailfd1512.ts.net` → 100.93.195.102
**Web UI proxies to:** `https://192.168.1.68:8006` (the PVE host)
**SSH ingress:** `ssh pve` (with `~/.ssh/config` ProxyJump) lands on
the PVE host, hopping through `pve-mgmt`.

> The `tailfd1512.ts.net` suffix and `192.168.1.68` PVE host IP are
> this tailnet's values. If you recreate the LXC on a different
> tailnet, substitute the new suffix in the Caddyfile, the renewal
> service, and the dev-machine `~/.ssh/config`.

## Why this exists

PVE's web UI runs on `:8006` with a self-signed cert, and its SSH
server runs on `:22`. Direct remote access needs either (a) accepting
the cert warning in every browser, (b) exposing 8006/22 to the
internet, or (c) replacing PVE's cert with a trusted one — invasive
on the PVE host.

The cleanest alternative: a small Tailscale-fronted LXC. The web UI
is reverse-proxied through Caddy with a real Tailscale-issued cert;
SSH uses the LXC as a ProxyJump bastion to the PVE host. PVE's
self-signed cert and direct SSH never leave the LAN.

## Stack

- LXC 201 — Debian 13 (Trixie), 2c / 2GB / 8GB
- Tailscale 1.102+ (system service, not Docker) on the tailnet
- Caddy 2.11+ serving HTTPS with the Tailscale cert
- Cert auto-renewal via systemd timer (monthly)
- OpenSSH server on the LXC, used as a ProxyJump bastion to the PVE host

## Recreating from scratch

### 1. PVE host — create the LXC

```bash
# Adjust the template filename to whatever is currently cached in
# /var/lib/vz/template/cache/. As of 2026-08 the Debian 13 template
# was cached, no download needed.
pct create 201 local:vztmpl/debian-13-standard_13.6-1_amd64.tar.zst \
  --hostname pve-mgmt \
  --cores 2 --memory 2048 --swap 512 \
  --rootfs local-lvm:8 \
  --net0 name=eth0,bridge=vmbr0,ip=dhcp \
  --features nesting=1 \
  --onboot 1 --start 1

# Public DNS first, LAN DNS as last-resort fallback. The PVE host's
# 192.168.1.254 (pfSense) resolver is intermittently flaky.
pct set 201 --nameserver "8.8.8.8 1.1.1.1 192.168.1.254"
pct restart 201
pct enter 201
```

### 2. TUN passthrough — REQUIRED before tailscaled will start

LXCs don't get `/dev/net/tun` by default. Without it, tailscaled fails
to start with `CreateTUN failed; /dev/net/tun does not exist`. From
the PVE host:

```bash
cat >> /etc/pve/lxc/201.conf <<'EOF'
lxc.cgroup2.devices.allow: c 10:200 rwm
lxc.mount.entry: /dev/net/tun dev/net/tun none bind,create=file
EOF
pct restart 201
```

Verify from inside the LXC: `ls -la /dev/net/tun` should show
`crw-rw-rw- ... 10, 200 ... /dev/net/tun`.

### 3. Inside the LXC — install Tailscale via the apt repo

**Don't use `curl | sh https://tailscale.com/install.sh`** — that
domain is Vercel-fronted and the path to it is RST'd on this LAN
during TLS handshake. The apt repo (`pkgs.tailscale.com`) is on
Tailscale's own infra and works reliably.

```bash
curl -fsSL https://pkgs.tailscale.com/stable/debian/trixie.noarmor.gpg \
  | gpg --dearmor -o /usr/share/keyrings/tailscale-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/tailscale-archive-keyring.gpg] https://pkgs.tailscale.com/stable/debian trixie main" \
  > /etc/apt/sources.list.d/tailscale.list
apt update
apt install -y tailscale
systemctl enable --now tailscaled
```

### 4. Authenticate

Either via auth key (cleanest for unattended re-deploys):

```bash
export TS_AUTHKEY="tskey-auth-..."   # Reusable=ON, Ephemeral=OFF
tailscale up --authkey="$TS_AUTHKEY" --hostname="pve-mgmt"
```

Or interactively (when no auth key is at hand):

```bash
tailscale up --hostname="pve-mgmt"
# Prints https://login.tailscale.com/a/<code> — open on any
# Tailscale-connected device, click Connect, the LXC's `tailscale up`
# completes.
```

### 5. Generate cert — USE THE FQDN, not the bare name

```bash
FQDN=$(tailscale status --json | jq -r '.Self.DNSName' | sed 's/\.$//')
tailscale cert "$FQDN"
# Writes <FQDN>.crt and <FQDN>.key to the CURRENT directory.
# `tailscale cert` does NOT write to /var/lib/tailscale/.
```

**Gotcha**: `tailscale cert pve-mgmt` (bare name) returns
`500 Internal Server Error: invalid domain` for ~30 seconds after a
new node's auth completes, because the MagicDNS short-name record
hasn't propagated yet. Always use the FQDN
(`pve-mgmt.<your-tailnet>.ts.net`).

### 6. Move certs to a Caddy-readable location

`/var/lib/tailscale/` is mode 0700 root-only. Caddy runs as the
`caddy` user and cannot read certs directly from there. Create a
separate dir:

```bash
mkdir -p /etc/caddy/tailscale-certs
chown caddy:caddy /etc/caddy/tailscale-certs
chmod 750 /etc/caddy/tailscale-certs

FQDN=$(tailscale status --json | jq -r '.Self.DNSName' | sed 's/\.$//')
cp "${FQDN}.crt" /etc/caddy/tailscale-certs/cert.pem
cp "${FQDN}.key" /etc/caddy/tailscale-certs/key.pem
chown caddy:caddy /etc/caddy/tailscale-certs/cert.pem /etc/caddy/tailscale-certs/key.pem
chmod 640 /etc/caddy/tailscale-certs/cert.pem /etc/caddy/tailscale-certs/key.pem
```

### 7. Install Caddy and write the Caddyfile

```bash
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | tee /etc/apt/sources.list.d/caddy-stable.list
apt update
apt install -y caddy

FQDN=$(tailscale status --json | jq -r '.Self.DNSName' | sed 's/\.$//')
PVE_HOST="192.168.1.68"   # ← your PVE host's LAN IP

cat > /etc/caddy/Caddyfile <<EOF
${FQDN} {
    tls /etc/caddy/tailscale-certs/cert.pem /etc/caddy/tailscale-certs/key.pem
    reverse_proxy https://${PVE_HOST}:8006 {
        transport http {
            tls_insecure_skip_verify
        }
    }
}
EOF

caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
```

### 8. Auto-renewal timer (cert valid 90d, renew monthly)

```bash
cat > /etc/systemd/system/tailscale-cert-renew.service <<'UNIT'
[Unit]
Description=Renew Tailscale cert into Caddy's dir and reload
After=tailscaled.service
[Service]
Type=oneshot
WorkingDirectory=/etc/caddy/tailscale-certs
ExecStart=/bin/sh -c '/usr/bin/tailscale cert pve-mgmt.tailfd1512.ts.net && /bin/mv -f pve-mgmt.tailfd1512.ts.net.crt cert.pem && /bin/mv -f pve-mgmt.tailfd1512.ts.net.key key.pem && /bin/chown caddy:caddy cert.pem key.pem && /bin/chmod 640 cert.pem key.pem && /usr/bin/systemctl reload caddy'
UNIT

cat > /etc/systemd/system/tailscale-cert-renew.timer <<'UNIT'
[Unit]
Description=Monthly Tailscale cert renewal
[Timer]
OnCalendar=monthly
Persistent=true
[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable --now tailscale-cert-renew.timer
```

**Note**: the cert FQDN in the ExecStart is hardcoded to
`pve-mgmt.tailfd1512.ts.net` for the current tailnet. If you ever
move this LXC to a different tailnet, edit the FQDN in both
`/etc/caddy/Caddyfile` and `tailscale-cert-renew.service`.

### 9. SSH bastion (optional but recommended)

By default the LXC is only a web-UI proxy. To also use it as the
single SSH ingress to the PVE host (so `ssh pve` from any Tailscale
device lands on the PVE host shell with no Tailscale on the PVE
host itself), install SSH on the LXC and configure a ProxyJump on
the dev machine.

#### 9a. Install and start SSH on the LXC

```bash
apt install -y openssh-server
systemctl enable --now ssh
ss -tlnp | grep :22
# expect: LISTEN on *:22
```

Tailscale already provides the network layer, so SSH on the LXC is
reachable as `pve-mgmt.tailfd1512.ts.net` from any Tailscale device
without any port forwarding or firewall changes.

#### 9b. Authorize the dev machine's public key on the LXC

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
# Paste your dev machine's ~/.ssh/id_ed25519.pub as the last line:
echo "ssh-ed25519 AAAA...PASTE_HERE... root@<your-machine>" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

#### 9c. Authorize the same key on the PVE host

The ProxyJump's second hop is from the LXC to the PVE host on the
LAN. That hop also needs the key authorized on the PVE host.

Easiest from inside the LXC (pushes the LXC's `authorized_keys` to
the PVE host — uses PVE host's password one time):

```bash
cat ~/.ssh/authorized_keys | ssh root@192.168.1.68 \
  "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
# enter PVE host root password once
```

#### 9d. SSH config on the dev machine

On Windows: `C:\Users\<you>\.ssh\config`. On Linux/macOS:
`~/.ssh/config`.

```
Host pve
    HostName 192.168.1.68
    User root
    IdentityFile ~/.ssh/id_ed25519
    ProxyJump pve-mgmt.tailfd1512.ts.net

Host pve-mgmt
    HostName pve-mgmt.tailfd1512.ts.net
    User root
    IdentityFile ~/.ssh/id_ed25519
```

The `IdentityFile` line makes SSH explicit about which key to use,
so it can't pick up a stale key from another application
(GitHub Desktop, 1Password, etc.).

#### 9e. Verify the end-to-end

From the dev machine:

```powershell
ssh pve-mgmt
# expect: lands on the LXC shell, no password

ssh pve
# expect: 
#   - "authenticity of host '192.168.1.68'..." prompt on first run → type yes
#   - hops through pve-mgmt, lands on the PVE host shell, no password
```

The first `ssh pve` will prompt for the PVE host's host-key
verification (its key is different from the LXC's). Accept once, it
caches in `~/.ssh/known_hosts`.

## Verifying

From any Tailscale-connected device:

```bash
# Web UI: HEAD returns 501 from PVE's API daemon — that proves the
# proxy is wired correctly (Caddy → PVE:8006, TLS terminating on Caddy).
curl -I https://pve-mgmt.tailfd1512.ts.net
# expect: "Via: 1.1 Caddy" + "Server: pve-api-daemon/3.0"

# Web UI: real GET returns the PVE login HTML.
curl https://pve-mgmt.tailfd1512.ts.net
# expect: ~few KB of HTML

# SSH (after step 9 is done):
ssh pve
# expect: lands on the PVE host shell
```

Then open `https://pve-mgmt.tailfd1512.ts.net` in a browser — PVE's
login page, no cert warnings.

## Gotchas (do not forget)

1. **TUN passthrough in `/etc/pve/lxc/201.conf` is required.** Remove
   it on container recreate and tailscaled fails to start with
   `CreateTUN failed; /dev/net/tun does not exist`.
2. **`tailscale cert` writes to CWD with the FQDN as filename**, not
   to `/var/lib/tailscale/`. The renewal service in step 8 handles
   the `mv` into the Caddy-readable dir.
3. **Bare-name `tailscale cert pve-mgmt` fails with "500 invalid
   domain"** for ~30s after the node's first auth. Use the FQDN.
4. **Don't use `tailscale.com/install.sh` on this LAN** —
   Vercel-fronted, RST'd on the path. Use the apt repo
   (`pkgs.tailscale.com`).
5. **`/var/lib/tailscale/` is root-only.** Apps that need to read
   the Tailscale cert must get them from elsewhere
   (we use `/etc/caddy/tailscale-certs/`).
6. **PVE host's self-signed cert is intentionally
   `tls_insecure_skip_verify`'d.** The browser sees the Tailscale
   cert, not PVE's, so this is safe.
7. **`ssh pve` falls back to password** if the public key is not
   authorized on the PVE host (the second hop in the ProxyJump).
   Step 9c pushes the key over from the LXC.
8. **Windows username in the SSH password prompt** (e.g.
   `jude m@...` instead of `root@...`) means the
   `~/.ssh/config` on the dev machine is missing or has the wrong
   path. The `User root` directive isn't being applied. Verify with
   `Get-Content $env:USERPROFILE\.ssh\config` on Windows or
   `cat ~/.ssh/config` on Linux/macOS.
9. **`pve.tailfd1512.ts.net` does not exist** on the tailnet — we
   never installed Tailscale on the PVE host. The single ingress is
   `pve-mgmt.tailfd1512.ts.net`, and `ssh pve` reaches the PVE
   host by ProxyJump through it. If you want `pve.tailfd1512.ts.net`
   to resolve directly, install Tailscale on the PVE host (skip the
   LXC hop for SSH).

## Files on disk

- `/etc/caddy/Caddyfile` — reverse proxy config
- `/etc/caddy/tailscale-certs/{cert,key}.pem` — Tailscale-issued cert
- `/etc/systemd/system/tailscale-cert-renew.{service,timer}` — monthly renew
- `/etc/pve/lxc/201.conf` — TUN passthrough (LXC-level, on PVE host)
- `/etc/ssh/sshd_config` — OpenSSH server (step 9), defaults are fine
- DNS — set via `pct set --nameserver` (persistent across reboots)
- Dev machine: `~/.ssh/config` (Windows: `C:\Users\<you>\.ssh\config`)
  with the `Host pve` and `Host pve-mgmt` blocks

## Why the LXC and not the PVE host itself

The PVE host's web UI is already on `:8006` and SSH is on `:22`;
this LXC is just a Tailscale-fronted reverse proxy + SSH bastion
for both. Could have been installed directly on the PVE host, but
a separate container means the reverse-proxy stack (Tailscale +
Caddy + OpenSSH) can be torn down, rebuilt, or moved without
touching the PVE host. Treat it as disposable infra — `pct destroy
201` and recreate is the recovery path.

If you later want defense-in-depth, you can install Tailscale on
the PVE host as a "break glass" admin path, and firewall `22` and
`8006` on the PVE host to only accept connections from the LXC's
LAN IP. The LXC then becomes the only Tailnet ingress.
