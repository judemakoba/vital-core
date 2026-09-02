# Vital Core HMS — Agent Working Notes

> Persistent project context for any future agent session that picks up
> this repo. Project-specific (only true for vital-core). For cross-project
> lessons (Tailscale diagnostics, Proxmox LXC patterns, etc.) see the
> `mavis` agent's memory at `C:\Users\Jude M\.minimax\agents\mavis\memory\MEMORY.md`.

## Network infrastructure (vitalcore + pve + tailnet)

Three machines:

| Machine | Address | Tailscale | Role |
|---|---|---|---|
| `pve` (Proxmox host) | `192.168.1.68` (LAN) | n/a | Hypervisor. Runs LXC 200 + the LXC's docker containers. Has a real LAN connection (gateway `192.168.1.1`, the live ISP router). |
| `pve-mgmt` (jumphost) | `100.93.195.102` / `pve-mgmt.tailfd1512.ts.net` | yes | Ubuntu VM in the tailnet. The ONLY way to reach `pve` from the dev machine. |
| `vitalcore` (LXC 200 on pve) | `192.168.1.200` (LAN) / `100.68.103.62` (tailnet) | yes | The actual Vital Core HMS app. Tailscale runs in a separate container (`vitalcore-tailscale`). |

### LXC 200 default gateway — `192.168.1.1` (NOT `.254`)

The LXC was originally set up with `gw=192.168.1.254` (a stale AP/router on the LAN that has since gone offline). When `.254` died, the LXC lost all outbound internet (no ARP, no DNS, no DERP), the Tailscale container logged out, and `vitalcore.tailfd1512.ts.net` disappeared from the tailnet.

Fix: `pct set 200 -net0 "name=eth0,bridge=vmbr0,ip=192.168.1.200/24,gw=192.168.1.1"` (now in `/etc/pve/lxc/200.conf` permanently).

⚠️ **Proxmox regenerates the LXC's MAC when you rewrite the net config** — if you have firewall rules pinned to the old MAC (`BC:24:11:99:9D:92`), update them to the new one (`BC:24:11:66:35:80` after the 2026-09-02 fix).

### Off-LAN SSH chain (the ONLY way to reach pve from the dev machine)

The dev machine is on Tailscale but has no direct route to `192.168.1.x`. Direct `ssh root@pve` hangs at the SSH banner-exchange step. Always chain through `pve-mgmt`:

```bash
# Dev machine → pve-mgmt (Tailscale) → pve (LAN)
ssh root@pve-mgmt "ssh root@192.168.1.68 '<command>'"
```

Or, for anything non-trivial, push a script to pve-mgmt first then exec via pve:
```bash
# 1. scp script to pve-mgmt
scp <local-file> root@pve-mgmt:/tmp/<file>
# 2. from pve-mgmt, push to pve and run
ssh root@pve-mgmt "scp /tmp/<file> root@192.168.1.68:/tmp/<file> && \
                   ssh root@192.168.1.68 'pct push 200 /tmp/<file> /tmp/<file> && \
                                            chmod +x /tmp/<file>'"
# 3. exec into the LXC
ssh root@pve-mgmt "ssh root@192.168.1.68 'pct exec 200 -- bash /tmp/<file>'"
```

`~/.ssh/config` already has `Host pve` with `ProxyJump pve-mgmt.tailfd1512.ts.net`, but using it from the dev machine directly still hits the same banner-exchange hang. The pve-mgmt → pve hop works because pve-mgmt IS on the LAN and the SSH host key is already trusted.

## LXC 200 layout

- `/opt/vital-core` — the vital-core checkout (git pull to update before deploys)
- Docker compose: `docker compose --env-file .env.production -f docker-compose.yml ...` (from `/opt/vital-core`)
- Containers: `vitalcore-app` (Next.js), `vitalcore-postgres`, `vitalcore-caddy`, `vitalcore-tailscale`
- Logs: `docker logs --tail N <container>` (no systemd journal for these — `docker logs` is the only place)
- Caddy serves `https://vitalcore.tailfd1512.ts.net` and reverse-proxies to `vitalcore-app:3000`
- NEXTAUTH_URL must be `https://vitalcore.tailfd1512.ts.net` (NOT the bare hostname)

## Standard deploy pattern

```bash
cd /opt/vital-core
git pull origin main
docker compose --env-file .env.production -f docker-compose.yml stop app
docker compose --env-file .env.production -f docker-compose.yml rm -f app
docker rmi -f vitalcore-app:latest || true
docker compose --env-file .env.production -f docker-compose.yml build --no-cache app
docker compose --env-file .env.production -f docker-compose.yml up -d --force-recreate --no-deps app
```

**Both** `docker rmi -f vitalcore-app:latest` AND `build --no-cache` are required — only one of them doesn't reliably invalidate the build cache. CSS/JSX/template changes all need a full rebuild, not just a container recreate.

If build fails with `ENOSPC: no space left on device`, run `docker builder prune -af` (clear BuildKit's persistent cache — was 45 GB once, normally 1-2 GB).

## Default admin credentials

`admin@vitalcore.com / password123` — role: ADMIN. Sufficient for every API endpoint the admin pages use. If a route returns 403 even after login, the user role on the API may be more restrictive (e.g. `SUPER_ADMIN` for the audit log page) — check the page's `if (!['SUPER_ADMIN', ...].includes(user?.role))` guard.

## Lab report templates

26 tests in the catalog, all backed by `lib/lab-templates-utils.ts` and the comprehensive `lib/lab-standards.ts` (added 2026-09-02). The latter is the source of truth for analyte lists, units, reference ranges, critical values, and report layout. Re-seed (overwrite all 26) via:

```bash
POST /api/lab/templates/seed-defaults
{ "overwrite": true, "useStandardized": true }
```

The route returns `{ total, created, updated, skipped, failed, failures }`. Always 0 failures if the lab-standards definitions are correct.

## Finance reports

- Income statement: `/api/finance/reports/income-statement/export/xlsx?from=&to=`
- Balance sheet: `/api/finance/reports/balance-sheet/export/xlsx?asOf=`
- Trial balance: `/api/finance/reports/trial-balance/export/xlsx?asOf=`
- Legacy KPIs: `/api/finance/reports/financial?from=&to=&preset=`

The `.xlsx` exports go through `lib/finance/excel-export.ts` which has a JSZip-based post-processor to:
1. Set `wb.calcProperties.fullCalcOnLoad = true` (suppresses the "We found a problem" Excel recovery dialog)
2. Strip SUMIF range-union syntax → single contiguous range (`'Sheet'!H:H` not `'Sheet'!H:'Sheet'!H`)
3. Post-write JSZip pass to strip `<extLst>` from `xl/styles.xml` and add `pivotButton="0" quotePrefix="0"` to every `<xf>`

**Critical**: `jszip` MUST be a static `import` (not `createRequire('jszip')`) in `lib/finance/excel-export.ts` — the standalone build's webpack tree-shaker doesn't trace dynamic requires, so JSZip won't be in the runtime `/app/node_modules/`. Use `import JSZip from 'jszip';` and let webpack route it through exceljs's already-bundled JSZip.
