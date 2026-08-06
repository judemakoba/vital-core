#!/bin/sh
# ─── Vital Core HMS — Postgres backup ─────────────────────────────────────
# Usage (on the LXC, NOT in a container):
#   ./scripts/backup.sh                  # backup to ./backups/
#   ./scripts/backup.sh /var/backups     # backup to /var/backups/
#   BACKUP_KEEP=14 ./scripts/backup.sh   # keep 14 days of backups
#
# Uses docker exec to run pg_dump INSIDE the running postgres container.
# Output is a custom-format dump (-Fc) — compressed by default, supports
# selective restore with `pg_restore --table=...`.
#
# Schedule with cron (run as root):
#   0 2 * * * /opt/vitalcore/scripts/backup.sh /var/backups/vitalcore >> /var/log/vitalcore-backup.log 2>&1

set -e

CONTAINER="${POSTGRES_CONTAINER:-vitalcore-postgres}"
DB_USER="${POSTGRES_USER:-vitalcore}"
DB_NAME="${POSTGRES_DB:-vitalcore}"
OUT_DIR="${1:-./backups}"
KEEP_DAYS="${BACKUP_KEEP:-7}"

# ── Sanity checks ─────────────────────────────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
    echo "ERROR: docker is not installed or not in PATH" >&2
    exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
    echo "ERROR: container '${CONTAINER}' is not running" >&2
    echo "  Start it with: docker compose --env-file .env.production up -d postgres" >&2
    exit 1
fi

mkdir -p "${OUT_DIR}"

# ── Filename with timestamp ───────────────────────────────────────────────
# 2026-08-06T14-30-00Z  →  sorts lexicographically
TIMESTAMP="$(date -u +'%Y-%m-%dT%H-%M-%SZ')"
FILENAME="vitalcore-${DB_NAME}-${TIMESTAMP}.dump.gz"
OUT_PATH="${OUT_DIR}/${FILENAME}"

echo "[backup] Dumping ${DB_NAME} from ${CONTAINER} → ${OUT_PATH}"

# pg_dump -Fc → custom format (compressed). pipe through gzip for extra compression.
# --no-owner --no-privileges → strip role ownership, so the restore doesn't
# need the original role to exist. Useful when restoring on a fresh DB.
docker exec -e PGPASSWORD="${POSTGRES_PASSWORD}" "${CONTAINER}" \
    pg_dump -U "${DB_USER}" -d "${DB_NAME}" -Fc --no-owner --no-privileges \
    | gzip -9 > "${OUT_PATH}"

# ── Verify the dump is non-empty and gzip-decompresses cleanly ───────────
SIZE=$(stat -c%s "${OUT_PATH}" 2>/dev/null || stat -f%z "${OUT_PATH}")
if [ "${SIZE}" -lt 1024 ]; then
    echo "ERROR: backup is suspiciously small (${SIZE} bytes)" >&2
    exit 1
fi

# Test gzip integrity
if ! gzip -t "${OUT_PATH}" 2>/dev/null; then
    echo "ERROR: backup file failed gzip integrity check" >&2
    exit 1
fi

echo "[backup] OK: ${FILENAME} (${SIZE} bytes)"

# ── Prune old backups ─────────────────────────────────────────────────────
PRUNED=$(find "${OUT_DIR}" -name "vitalcore-${DB_NAME}-*.dump.gz" -mtime +"${KEEP_DAYS}" -print -delete | wc -l)
if [ "${PRUNED}" -gt 0 ]; then
    echo "[backup] Pruned ${PRUNED} backup(s) older than ${KEEP_DAYS} days"
fi

# ── List current backups ──────────────────────────────────────────────────
echo ""
echo "[backup] Current backup set:"
ls -lh "${OUT_DIR}"/vitalcore-"${DB_NAME}"-*.dump.gz 2>/dev/null | awk '{printf "  %s  %s\n", $5, $9}' || true

echo ""
echo "[backup] To restore:"
echo "  ./scripts/restore.sh ${OUT_PATH}"
