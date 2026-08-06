# Vital Core HMS — Operations

Day-to-day ops for the production deployment. For first-time setup, see
[`DEPLOY.md`](./DEPLOY.md).

---

## TL;DR — common commands

```bash
# Start / stop
docker compose --env-file .env.production up -d
docker compose --env-file .env.production stop
docker compose --env-file .env.production down        # stops + removes containers (volumes survive)

# Logs
docker compose --env-file .env.production logs -f             # all services
docker compose --env-file .env.production logs -f app         # just the Next.js app
docker compose --env-file .env.production logs --tail 200 caddy

# Rebuild after a code change
git pull
docker compose --env-file .env.production build app
docker compose --env-file .env.production up -d app

# Status
docker compose --env-file .env.production ps
docker stats                                       # live resource usage
```

---

## Access model

| From | URL | Cert |
|------|-----|------|
| Tailscale device (laptop, phone) | `https://vitalcore` | Tailscale-issued (auto-trusted) |
| LAN device without Tailscale | `https://<lxc-lan-ip>` | Caddy self-signed (warns once, install Caddy CA to silence) |
| LAN device with Caddy CA installed | `https://<lxc-lan-ip>` | Caddy self-signed (trusted) |

The `vitalcore` name is the **Tailscale MagicDNS hostname** —
Tailscale's DNS server (which runs on every Tailscale client) auto-
resolves it to the LXC's 100.x.x.x IP. No DNS configuration needed.

---

## Tailscale cert lifecycle

The Tailscale sidecar generates the cert on first boot and writes it
to `/var/lib/tailscale/cert.pem` (and matching `key.pem`) inside the
`tailscale_state` Docker volume. Caddy reads it from the same volume.

- **Validity:** 90 days
- **Auto-renewal:** the sidecar runs `tailscale cert <hostname>` every
  30 days. If the cert can't be renewed (e.g. Tailscale daemon down),
  Caddy will keep serving the old cert until expiry.
- **Check cert expiry:** `docker exec vitalcore-tailscale openssl x509 -enddate -noout -in /var/lib/tailscale/cert.pem`
- **Force renewal:** `docker exec vitalcore-tailscale tailscale cert vitalcore`

If the cert expires and isn't renewed, browsers will show a warning.
Re-running `docker compose up -d tailscale` restarts the sidecar and
triggers a fresh cert generation.

---

## LAN cert (Caddy's internal CA)

For LAN devices that don't have Tailscale, Caddy serves a self-signed
cert using its built-in internal CA. The CA is stored in the
`caddy_data` volume at `/data/caddy/pki/authorities/local/root.crt`.

To export and install it on a LAN device:

```bash
# Export the CA
docker exec vitalcore-caddy cat /data/caddy/pki/authorities/local/root.crt > caddy-root-ca.crt

# Install on a Linux/Mac/Windows device (see DEPLOY.md step 8 for details)
sudo cp caddy-root-ca.crt /usr/local/share/ca-certificates/ && sudo update-ca-certificates
```

After installing the CA, the LAN device trusts Caddy's cert for any
hostname the LXC is reached at (e.g. `https://192.168.1.50`).

---

## Updating to a new version

```bash
cd /opt/vital-core
git pull

# Optional: take a backup first
./scripts/backup.sh ./backups

# Rebuild and restart
docker compose --env-file .env.production build app
docker compose --env-file .env.production up -d
```

The `postgres` and `tailscale` containers don't need to be rebuilt
unless their images change. The `db push` in the entrypoint applies
schema changes automatically.

If a schema change is **destructive** (e.g. drops a column), the
entrypoint will need `--accept-data-loss`. The Dockerfile already
passes that flag. Backups remain the safety net.

---

## Connecting to the database

```bash
# Interactive psql session
docker compose --env-file .env.production exec postgres \
    psql -U vitalcore -d vitalcore

# Single query
docker compose --env-file .env.production exec postgres \
    psql -U vitalcore -d vitalcore -c "SELECT COUNT(*) FROM \"Patient\";"
```

---

## Restoring from backup

```bash
# List available backups
ls -lh /var/backups/vitalcore/

# Restore (interactive — confirms before doing anything destructive)
./scripts/restore.sh /var/backups/vitalcore/vitalcore-vitalcore-2026-08-06T02-00-00Z.dump.gz
```

The script:
1. Asks for confirmation ("type 'yes'")
2. Stops the app container
3. Drops and recreates the database
4. Imports the dump
5. Restarts the app

> ⚠️ The restore REPLACES the current database. Take a fresh backup
> first if you're not 100% sure.

---

## Disk usage

Three things that grow over time:
1. **Postgres data** (`vitalcore_postgres_data` volume)
2. **App uploads** (`vitalcore_app_uploads` volume)
3. **Tailscale state** (`vitalcore_tailscale_state` volume) — small
   (a few MB), but contains the Tailscale node identity

```bash
docker system df -v
```

---

## Network

| Service | Network | Listens on | Reachable by |
|---------|---------|------------|--------------|
| `postgres` | vitalcore_net (bridge) | `0.0.0.0:5432` (internal) | only the app |
| `app` | vitalcore_net (bridge) | `0.0.0.0:3000` (internal) + `127.0.0.1:3000` (host) | only Caddy |
| `tailscale` | host | Tailscale TUN device | Tailscale daemon on the LXC |
| `caddy` | host | `0.0.0.0:80, 0.0.0.0:443` | the world (via Tailscale IP, LAN IP, or both) |

Nothing is exposed to the host by default — Postgres is only reachable
from inside the Docker network. The app's port 3000 is published on
loopback only (Caddy on the host network reaches it via
`127.0.0.1:3000`).

---

## Logs

```bash
docker compose --env-file .env.production logs -f              # all services
docker compose --env-file .env.production logs -f app          # just the app
docker compose --env-file .env.production logs -f tailscale    # Tailscale sidecar
docker compose --env-file .env.production exec caddy cat /data/access.log | tail -500
```

Logs are NOT persisted beyond container lifetime. For long-term log
storage, add a log driver or pipe to a syslog server (out of scope).

---

## Tearing down

```bash
# Stop and remove containers (VOLUMES SURVIVE — your data is safe)
docker compose --env-file .env.production down

# Nuclear option: also delete the volumes (DESTROYS all data)
docker compose --env-file .env.production down -v
```

If you want a fresh start: `down -v` + `up -d`. The Prisma db push
will recreate the schema from scratch, but you'll need to re-run the
seed scripts.

---

## Common gotchas

**`https://vitalcore` doesn't load on a new device** — that device
doesn't have Tailscale installed or isn't signed in. Install Tailscale
on the device first, then sign in with the same account.

**Tailscale sidecar keeps restarting with "TS_AUTHKEY auth failed"** —
the key is wrong or expired. Generate a new one in the Tailscale
admin panel, update `.env.production`, `docker compose up -d tailscale`.

**Cert warning on `https://vitalcore`** — Tailscale cert expired
without being renewed. Check `docker logs vitalcore-tailscale` for
renewal errors.

**Login doesn't work, browser says "Invalid URL"** — `NEXTAUTH_URL`
in `.env.production` doesn't match the URL you're hitting. The URL
must be exactly `https://vitalcore` (no trailing slash, no port).

**`docker compose up` says "bind: address already in use"** — port
80 or 443 is already taken on the LXC host. Check
`ss -tlnp | grep -E ':80|:443'` and stop the conflicting process.

---

## Architecture diagram

```
                           Tailscale clients (laptop, phone)
                                    │
                          Tailscale tunnel (100.x.x.x)
                                    │
                                    ▼
                            ┌──────────────┐
                            │   Tailscale  │ (network_mode: host)
                            │   sidecar    │  - Joins tailnet
                            │              │  - Generates cert
                            │              │  - Shares via volume
                            └──────┬───────┘
                                   │ cert.pem
                                   ▼
┌──────────────────┐    ┌────────────────────┐    ┌──────────────┐
│ LAN client       │───▶│  Caddy             │───▶│   Next.js    │
│ (no Tailscale)   │    │  network_mode:host │    │   app        │
│ https://         │    │  :80, :443         │    │   127.0.0.1  │
│  <lxc-lan-ip>    │    │                    │    │   :3000      │
│  (self-signed)   │    │  Caddyfile.intranet│    └──────┬───────┘
└──────────────────┘    └────────────────────┘           │
                                                         │ postgres:5432
                                                         ▼
                                                  ┌──────────────┐
                                                  │  Postgres    │
                                                  │  bridge net  │
                                                  │  (internal)  │
                                                  └──────────────┘
```
