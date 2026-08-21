# Vital Core HMS — LAN Fallback & Offline Operation

How to give Vital Core a **LAN-only URL that works with the internet down**.
The Tailscale URL (the default in `deploy/DEPLOY.md`) requires Tailscale's
control plane for MagicDNS resolution — so when the hospital loses
internet, every Tailscale URL goes dark. For a hospital HMS, that is
**not acceptable** — clinical workflows must not depend on an external
service.

The pattern here: serve the LAN IP (or a local DNS name) over HTTPS
with a self-signed cert generated locally. The cert covers the
hostname and the IP via SANs, so any of `https://192.168.1.200`,
`https://vitalcore`, or `https://vitalcore.tailfd1512.ts.net` work
from a LAN device — and the LAN IP works **with the internet off**.

---

## Why this exists

| URL | Internet up | Internet down | Cert behavior |
|---|---|---|---|
| `https://vitalcore.tailfd1512.ts.net` | ✓ | ✗ (Tailscale control plane unreachable) | Let's Encrypt via Tailscale, no warning |
| `https://192.168.1.200` (LAN IP) | ✓ | ✓ | Self-signed, one-time cert warning |
| `https://vitalcore` (after pfSense DNS entry) | ✓ | ✓ | Same as LAN IP |

The Tailscale URL is the polished daily-driver. The LAN IP is the
**offline lifeline** — must work with no internet, no DNS, no
Tailscale, no external service.

---

## How the cert + Caddy wiring works

1. A self-signed cert is generated locally with `openssl req -x509`,
   with SANs covering both the LXC's hostname (`vitalcore`) and its
   LAN IP (`192.168.1.200`). The cert is 10-year, so it's a
   one-time setup per LXC.
2. The cert + key live in `/etc/caddy/lan-certs/` on the LXC host.
3. The caddy service's `docker-compose.yml` has a bind mount for
   that path into the container at `/etc/caddy/lan-certs:ro`.
4. The `caddy/Caddyfile.intranet` has a **catch-all site block** for
   LAN clients. That block uses `tls /etc/caddy/lan-certs/cert.pem
   /etc/caddy/lan-certs/key.pem` — NOT `tls internal`. The catch-all
   site is the catch-all for SNI that doesn't match the Tailscale
   hostname, so LAN clients hitting the IP or a local DNS name
   land here and get a real cert.

The Caddyfile's first site block is still the Tailscale site (with
the Let's Encrypt cert from Tailscale's DNS-01 challenge) — that one
handles all Tailscale-equipped clients. The catch-all is the LAN
fallback.

---

## One-time setup

### 1. Generate the self-signed cert

```bash
# Inside pct 200, as root
mkdir -p /etc/caddy/lan-certs

# Generate a 10-year cert covering both the hostname and the LAN IP.
# Substitute the actual LAN IP and hostname for your deployment.
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout /etc/caddy/lan-certs/key.pem \
  -out /etc/caddy/lan-certs/cert.pem \
  -days 3650 \
  -subj "/CN=vitalcore" \
  -addext "subjectAltName=DNS:vitalcore,DNS:vitalcore.tailfd1512.ts.net,IP:192.168.1.200" \
  2>&1 | tail -3

# World-readable so the caddy user inside the container can read them.
# (caddy user only exists inside the caddy container, not on the LXC host.)
chmod 644 /etc/caddy/lan-certs/cert.pem /etc/caddy/lan-certs/key.pem
```

### 2. Mount the certs into the caddy container

In `docker-compose.yml`, under the `caddy:` service, add a bind mount
right after the existing Caddyfile mount:

```yaml
    volumes:
      # Caddyfile for the Tailscale / LAN setup.
      - ./caddy/Caddyfile.intranet:/etc/caddy/Caddyfile:ro
      - /etc/caddy/lan-certs:/etc/caddy/lan-certs:ro   # <-- add this
      - tailscale_state:/var/lib/tailscale:ro
      - caddy_data:/data
      - caddy_config:/config
```

Or with sed:

```bash
sed -i '/\.\/caddy\/Caddyfile\.intranet:\/etc\/caddy\/Caddyfile:ro/a\      - /etc/caddy/lan-certs:/etc/caddy/lan-certs:ro' /opt/vital-core/docker-compose.yml
```

### 3. Update the Caddyfile

The intranet Caddyfile has a catch-all `:443` block that originally
used `tls internal` (Caddy's internal CA, self-signed on-the-fly).
Replace that with the explicit cert path. The Caddyfile content
should look like:

```caddyfile
vitalcore.tailfd1512.ts.net {
    tls /var/lib/tailscale/cert.pem /var/lib/tailscale/key.pem
    # ... rest of the Tailscale site block (reverse_proxy, headers, log, etc.)
}

# LAN catch-all — uses the local self-signed cert, NOT tls internal
vitalcore, :443 {
    tls /etc/caddy/lan-certs/cert.pem /etc/caddy/lan-certs/key.pem
    reverse_proxy 127.0.0.1:3000 {
        # ... rest of the catch-all block
    }
}

:80 {
    redir https://{host}{uri} permanent
}
```

To edit the existing file (the indentation in `Caddyfile.intranet`
is **8 spaces** — match exactly):

```bash
# Whitespace-tolerant replacement using python
python3 - <<'PYEOF'
import re
p = "/opt/vital-core/caddy/Caddyfile.intranet"
with open(p) as f: text = f.read()
new_text, n = re.subn(
    r"^\s*tls internal\s*$",
    "        tls /etc/caddy/lan-certs/cert.pem /etc/caddy/lan-certs/key.pem",
    text, count=1, flags=re.MULTILINE,
)
if n:
    with open(p, "w") as f: f.write(new_text)
    print(f"✓ Replaced {n} occurrence(s)")
else:
    print("! No replacement made — pattern not found")
PYEOF
```

### 4. Recreate caddy

```bash
cd /opt/vital-core
docker compose --env-file .env.production up -d --force-recreate --no-deps caddy
sleep 5
docker logs vitalcore-caddy --tail=5
# expect: "serving initial configuration" — no ACME retries
```

### 5. Verify the LAN IP is serving the cert

```bash
# From inside pct 200
echo | openssl s_client -connect 192.168.1.200:443 2>&1 | head -40
# expect:
#   subject=CN=vitalcore
#   issuer=CN=vitalcore
#   ---Certificate chain---
#   0 s:CN=vitalcore
#     v:NotBefore: ...  NotAfter: ...

# From a dev machine on the same LAN
curl -kI https://192.168.1.200
# expect: HTTP/1.1 30x, Via: 1.1 Caddy
#         (cert warning normal with -k; in a real browser, accept once)
```

---

## Smoothing the cert warning on LAN devices (optional)

The self-signed cert triggers a one-time browser warning. To silence
it permanently on each LAN device, install the cert in the **Trusted
Root Certification Authorities** store, not "Personal":

```powershell
# Windows — distribute the cert
openssl x509 -in /etc/caddy/lan-certs/cert.pem -outform DER -out /tmp/vitalcore-lan.cer
# Then on each Windows machine:
#   double-click vitalcore-lan.cer → Install Certificate →
#   Local Machine → Trusted Root Certification Authorities → Finish
```

```bash
# Linux
sudo cp /etc/caddy/lan-certs/cert.pem /usr/local/share/ca-certificates/vitalcore-lan.crt
sudo update-ca-certificates
```

```bash
# macOS
sudo security add-trusted-cert -d -r trustRoot \
  -k /Library/Keychains/System.keychain /etc/caddy/lan-certs/cert.pem
```

After installing as a trusted root, every browser on that machine
trusts the cert, and `https://192.168.1.200` opens with **no
warning** — even with the internet off.

---

## Local DNS (optional, but recommended for clean URLs)

Add a DNS entry on pfSense (or your LAN DNS) so LAN clients can use
`https://vitalcore` instead of the IP:

- **Host**: `vitalcore`
- **Domain**: `hospital.local` (or whatever you use)
- **IP**: `192.168.1.200`

Then on the LXC, set a static IP (so the DNS entry doesn't point to
the wrong place after a DHCP renewal):

```bash
# On the PVE host
pct set 200 --net0 name=eth0,bridge=vmbr0,ip=192.168.1.200/24,gw=192.168.1.1
pct restart 200
```

The cert already covers `vitalcore` via the SAN, so the URL works
without changes.

---

## Gotchas (do not forget)

1. **`tls internal` does NOT work for the LAN catch-all** — the
   bare `:443` site block with `tls internal` causes
   `ERR_SSL_PROTOCOL_ERROR` / `SEC_E_INTERNAL_ERROR` on Windows
   clients. Always use an explicit `tls /path/to/cert.pem` for the
   LAN catch-all.
2. **The caddy user doesn't exist on the LXC host** — only inside
   the container. So `chown caddy:caddy` fails on the LXC host.
   Use `chmod 644` instead, and bind-mount the cert dir into the
   caddy container.
3. **Indentation in the Caddyfile is 8 spaces** (not tabs).
   A `sed` pattern with literal spaces will silently fail to match
   the line. Use `python3` with `re.subn(r"^\s*", ...)` to be
   whitespace-tolerant, or use `cat -A` to verify before sed-ing.
4. **The cert must cover BOTH the hostname and the IP** via SANs.
   A cert with just `CN=vitalcore` won't validate when the URL is
   `https://192.168.1.200` — the IP doesn't match the CN. The
   `-addext "subjectAltName=DNS:vitalcore,IP:..."` flag is
   non-negotiable.
5. **`docker compose up -d` (no `--force-recreate`) won't always
   pick up mount changes** if Docker thinks the config is
   unchanged. Use `--force-recreate --no-deps caddy` after
   editing compose or the Caddyfile.
6. **Tailscale URL still depends on Tailscale's control plane** —
   it works as long as MagicDNS can resolve, which requires
   internet to Tailscale's API. If you need offline-only
   operation, the LAN IP is the only option.

---

## Verifying the offline scenario (full smoke test)

1. **With internet up**: All three URLs work
   (`https://vitalcore.tailfd1512.ts.net`, `https://192.168.1.200`,
   `https://vitalcore` if DNS is set up).
2. **Pull the plug on the WAN** (or `pct exec 200 -- iptables -A
   OUTPUT -d 0.0.0.0/0 -j DROP` to simulate).
3. **From a LAN device**: `https://192.168.1.200` still works
   (the cert is local, the app is local, Caddy is local — nothing
   on the path needs internet).
4. **`https://vitalcore.tailfd1512.ts.net` will fail** (Tailscale
   can't reach its control plane) — this is expected, the LAN IP
   is the failover.

The hospital can keep admitting patients, charting vitals, and
running reports even when the WAN is down.
