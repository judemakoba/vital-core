# Vital Core HMS — Deployment Guide

End-to-end walkthrough for getting Vital Core running on a Proxmox LXC,
behind **Tailscale** for secure remote access. Designed for a small
single-hospital deployment on modest hardware.

**Access model after setup:**
- Primary: `https://vitalcore` from any device with Tailscale installed
- LAN fallback: `https://<lxc-lan-ip>` (cert warning, see step 8)

**Time estimate:** 45–60 minutes for a clean LXC, mostly waiting for
`docker build` and `apt`.

---

## 0. Prerequisites

- A Proxmox host (any version that supports the community-scripts helper).
- Outbound internet from the LXC (for `apt`, `docker pull`, Tailscale).
- A free Tailscale account (sign up at https://login.tailscale.com/start
  — takes 30 seconds with a Google/Microsoft/GitHub account).
- Tailscale installed on every device you want to use the app from
  (laptop, phone, tablet). Free tier covers up to 100 devices.
- This repository's source code (clone via `git clone` or `scp`).

**Recommended LXC resources:** 4 GB RAM, 4 cores, 32 GB disk. Postgres,
Next.js, Caddy, and Tailscale will share it.

---

## 1. Proxmox host — create the LXC with the community-scripts helper

On the **Proxmox host** (not inside the LXC yet), use the community
Docker helper. It creates a Debian 12 LXC, sets the right features
(`nesting=1`, `fuse=1`, `keyctl=1`) for Docker, and installs Docker +
Compose automatically.

```bash
# Run the helper — it'll prompt for CTID, hostname, password, etc.
bash -c "$(curl -fsSL https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main/ct/docker.sh)"
```

Recommended answers to the prompts:
- **CTID**: pick something memorable, e.g. `200`
- **Hostname**: `vitalcore` (or whatever you like)
- **Disk size**: `32` GB
- **CPU cores**: `4`
- **RAM**: `4096` MB
- **Swap**: `1024` MB
- **Bridge**: `vmbr0` (or your default)
- **IPv4**: DHCP (or static if you prefer)
- **Enable FUSE**: yes (helper sets it automatically)

The script installs Docker + Compose plugin. After it finishes, you
should be able to `pct enter 200` and run `docker --version`.

> **What the helper does for you:** sets the LXC features
> (`nesting=1,fuse=1,keyctl=1`) so Docker works inside the LXC. You
> don't need to `pct set` anything yourself.

---

## 2. Inside the LXC — get the source code

```bash
pct enter 200        # or SSH in
cd /opt
git clone <your-git-url> vital-core
cd vital-core
chmod +x scripts/*.sh
```

(If you don't have a git remote yet, `scp` the source up from your
laptop instead.)

---

## 3. Tailscale — get an auth key

The Tailscale sidecar in the stack needs an auth key to join your
tailnet. This is a one-time setup.

1. Go to https://login.tailscale.com/admin/settings/keys
2. Click **Generate auth key** with these settings:
   - **Description:** `Vital Core LXC`
   - **Reusable:** ✅ ON (so container restarts don't fail)
   - **Ephemeral:** ❌ OFF (you want the node to persist)
   - **Tags:** leave blank (or use `tag:container` if you set up ACLs)
   - **Expiry:** 90 days
3. Copy the generated key (it looks like `tskey-auth-k1234567890abcdef...`)

> Keep this key secret. It grants access to your tailnet. Rotate it
> every 90 days (or set up ACLs to scope it).

---

## 4. Configure the production environment

```bash
cd /opt/vital-core
cp deploy/env.production.example .env.production
chmod 600 .env.production
nano .env.production
```

Fill in at minimum:

| Variable | What to put | How to generate |
|----------|-------------|-----------------|
| `POSTGRES_USER` | `vitalcore` | (just type it) |
| `POSTGRES_PASSWORD` | random 32 chars | `openssl rand -base64 32` |
| `NEXTAUTH_SECRET` | random 32 chars | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | `https://vitalcore` | (just type it) |
| `TS_AUTHKEY` | your Tailscale key | from step 3 |
| `TS_HOSTNAME` | `vitalcore` | (just type it, or change if you want a different name) |

Everything else can stay at defaults.

Save with Ctrl-X, Y, Enter. The `chmod 600` makes it readable only by root.

---

## 5. Build and start the stack

```bash
docker compose --env-file .env.production up -d --build
```

This:
1. Builds the Next.js image (5–10 min the first time — installs deps,
   regenerates Prisma client for Linux, runs `next build`)
2. Pulls `postgres:16-alpine`, `caddy:2-alpine`, `tailscale/tailscale:latest`
3. Starts all four services in the right order (postgres waits for
   healthcheck, app waits for postgres, tailscale authenticates + joins
   tailnet + generates cert, caddy waits for both)

Tail the logs to watch the boot:

```bash
docker compose --env-file .env.production logs -f
```

You should see:
```
vitalcore-postgres    | database system is ready to accept connections
vitalcore-app         | [entrypoint] Postgres is accepting connections
vitalcore-app         | [entrypoint] Applying Prisma schema
vitalcore-app         | [entrypoint] Starting Next.js standalone server on port 3000
vitalcore-tailscale   | [tailscale] Authenticating with TS_AUTHKEY...
vitalcore-tailscale   | [tailscale] Joined tailnet as vitalcore
vitalcore-tailscale   | [tailscale] Cert ready at /var/lib/tailscale/cert.pem
vitalcore-caddy       | ...serving HTTPS on :443
```

Ctrl-C to exit; services keep running.

---

## 6. Verify it's alive

**From a Tailscale device (laptop/phone with Tailscale installed):**

Open `https://vitalcore` in your browser. You should:
- See the login page
- Get a valid HTTPS cert (green padlock) — auto-trusted by Tailscale
- Be able to log in with the seeded admin: `admin@vitalcore.com` / `password123`

**From the LXC itself (via the LXC's local IP):**

```bash
# From inside the LXC
curl -I https://vitalcore
# or
curl -I -k https://<lxc-lan-ip>
```

The `https://vitalcore` request will succeed with the Tailscale cert.
The `https://<lxc-lan-ip>` request will succeed but show a self-signed
cert warning in a browser — that's the LAN fallback.

> ⚠️ **Change the admin password immediately** under
> Settings → Users → admin@vitalcore.com.

---

## 7. Install Tailscale on your other devices

To access the app from a new device:

1. Install Tailscale: https://tailscale.com/download
2. Sign in with the same account you used for the auth key
3. Visit `https://vitalcore` in any browser

Tailscale's MagicDNS automatically resolves `vitalcore` to the LXC's
Tailscale IP (100.x.x.x). The cert is auto-trusted because Tailscale
generated it.

---

## 8. LAN fallback — silencing the cert warning

If you have LAN clients (e.g. a workstation on the same WiFi) that
don't have Tailscale installed, they'll get a cert warning when
accessing `https://<lxc-lan-ip>`. Two options to silence it:

**Option A: Install Tailscale on the LAN device** (recommended).
Free, takes 2 minutes, and you also get encrypted access from
anywhere on the internet.

**Option B: Install Caddy's root CA on the LAN device**:

```bash
# On the LXC
docker exec vitalcore-caddy cat /data/caddy/pki/authorities/local/root.crt > caddy-root-ca.crt
scp caddy-root-ca.crt <user>@<lan-device>:/tmp/
```

Then on the LAN device:
- **Windows:** double-click the .crt file → Install Certificate →
  Local Machine → Place in "Trusted Root Certification Authorities"
- **macOS:** Keychain Access → System → drag the .crt file in →
  set to "Always Trust"
- **Linux (Debian/Ubuntu):** `sudo cp caddy-root-ca.crt /usr/local/share/ca-certificates/ && sudo update-ca-certificates`
- **iOS:** AirDrop the .crt file → Settings → General → VPN & Device
  Management → install the profile → Settings → General → About →
  Certificate Trust Settings → enable
- **Android:** Settings → Security → Encryption & credentials →
  Install a certificate → CA certificate

After installing the CA, the LAN device trusts Caddy's self-signed
cert for `https://<lxc-lan-ip>`.

---

## 9. Initial data seed

The database starts empty. Run the seeds to populate reference data
(drugs, lab tests, etc.). Note: the insurance module was removed in
2026-08 — the clinic is cash-only, no insurance seed needed.

```bash
docker compose --env-file .env.production exec app \
    npx prisma db seed
```

If the seed reports errors, they're usually non-fatal (the seed is
idempotent — re-running is safe).

---

## 10. Set up automated backups

Cron the backup script to run nightly:

```bash
mkdir -p /var/backups/vitalcore
chmod 700 /var/backups/vitalcore

cat > /etc/cron.d/vitalcore-backup <<'EOF'
0 2 * * * root /opt/vital-core/scripts/backup.sh /var/backups/vitalcore >> /var/log/vitalcore-backup.log 2>&0
EOF
chmod 644 /etc/cron.d/vitalcore-backup
systemctl restart cron
```

To restore from a backup, see `README.md` → "Restoring from backup".

---

## 11. (Optional) Use a real domain instead of Tailscale

If you outgrow the `https://vitalcore` URL and want a polished one
like `https://hms.geminimedical.ug`:

1. Buy the domain, point its A record at your Proxmox host's public IP
2. Open ports 80 + 443 on the firewall
3. Stop the Tailscale sidecar: `docker compose stop tailscale`
4. Edit `docker-compose.yml`:
   - Remove the `tailscale` service
   - Remove the `tailscale_state` volume
   - Change Caddy's volume mount from `./caddy/Caddyfile.intranet` to `./caddy/Caddyfile`
   - Move Caddy off `network_mode: host` (use the bridge network + `ports: "80:80,443:443"`)
   - Move the app's port back to internal (remove the `ports:` section)
5. Set `NEXTAUTH_URL=https://hms.geminimedical.ug` and `VITALCORE_DOMAIN=hms.geminimedical.ug` in `.env.production`
6. `docker compose up -d`

Caddy will auto-request a Let's Encrypt cert.

---

## 12. Firewall notes

The LXC doesn't need any public ports open if you're using Tailscale
exclusively — Tailscale reaches the LXC via its own 100.x.x.x IP.

If you also want LAN access (step 8), no firewall changes needed —
LAN traffic stays on the local network.

If you switched to a real domain (step 11), open TCP 80 + 443 on
the Proxmox host's firewall pointing to the LXC.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Tailscale sidecar keeps restarting | Invalid or expired `TS_AUTHKEY` | Generate a new key, update `.env.production`, `docker compose up -d tailscale` |
| `https://vitalcore` doesn't load | Tailscale MagicDNS not enabled | Tailscale admin → DNS → "Use Tailscale DNS as nameserver" |
| Cert warning on `https://vitalcore` | Tailscale cert expired (>90 days) | The cert auto-renews every 30d inside the sidecar; check `docker logs vitalcore-tailscale` for errors |
| `docker compose logs` shows "permission denied" on `/dev/net/tun` | LXC missing `tun` device | Run on the Proxmox host: `pct stop 200 && pct set 200 -features nesting=1,fuse=1,keyctl=1 && pct start 200`. If that doesn't help, also add `-features net_admin=1` |
| App fails to start: "Can't reach database" | Postgres not ready | Wait — the entrypoint waits up to 60s. If persistent, check `docker compose logs postgres` |
| Login fails with "Invalid URL" | `NEXTAUTH_URL` doesn't match the browser URL | `NEXTAUTH_URL=https://vitalcore` in `.env.production`, then `docker compose up -d app` |
| `docker compose up` fails: "bind: address already in use" | Port 80 or 443 already taken on the host | Check `ss -tlnp | grep -E ':80|:443'` and stop whatever is using them |
| Out of disk | Uploads + Postgres growing | See `README.md` → "Disk usage" |
