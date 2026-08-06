#!/bin/sh
# ─── Vital Core HMS — Postgres restore ────────────────────────────────────
# Usage (on the LXC, NOT in a container):
#   ./scripts/restore.sh backups/vitalcore-vitalcore-2026-08-06T14-30-00Z.dump.gz
#
# Drops the existing database and recreates it from the backup. The app
# container MUST be stopped first (Postgres refuses to drop a DB with
# active connections). This script will stop the app for you and ask
# before restarting it.
#
# WARNING: this is destructive. The current database is REPLACED, not
# merged. Take a fresh backup first if you're unsure.
#   ./scripts/backup.sh ./backups/before-restore

set -e

CONTAINER="${POSTGRES_CONTAINER:-vitalcore-postgres}"
APP_CONTAINER="${APP_CONTAINER:-vitalcore-app}"
DB_USER="${POSTGRES_USER:-vitalcore}"
DB_NAME="${POSTGRES_DB:-vitalcore}"
BACKUP_FILE="$1"

# ── Sanity checks ─────────────────────────────────────────────────────────
if [ -z "${BACKUP_FILE}" ]; then
    echo "Usage: $0 <path-to-backup.dump.gz>" >&2
    echo "" >&2
    echo "Available backups:" >&2
    ls -1 ./backups/vitalcore-*.dump.gz 2>/dev/null | sed 's/^/  /' >&2
    exit 1
fi

if [ ! -f "${BACKUP_FILE}" ]; then
    echo "ERROR: backup file not found: ${BACKUP_FILE}" >&2
    exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
    echo "ERROR: docker is not installed or not in PATH" >&2
    exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
    echo "ERROR: container '${CONTAINER}' is not running" >&2
    exit 1
fi

# ── Pre-flight ────────────────────────────────────────────────────────────
BACKUP_SIZE=$(stat -c%s "${BACKUP_FILE}" 2>/dev/null || stat -f%z "${BACKUP_FILE}")
echo "[restore] Backup:   ${BACKUP_FILE}"
echo "[restore] Size:     ${BACKUP_SIZE} bytes"
echo "[restore] Database: ${DB_NAME} on ${CONTAINER}"
echo ""
echo "  WARNING: this will REPLACE the current '${DB_NAME}' database."
echo ""
printf "  Type 'yes' to continue, anything else to abort: "
read -r CONFIRM

if [ "${CONFIRM}" != "yes" ]; then
    echo "[restore] Aborted"
    exit 1
fi

# ── Stop the app so Postgres can drop active connections ──────────────────
APP_WAS_RUNNING=false
if docker ps --format '{{.Names}}' | grep -q "^${APP_CONTAINER}$"; then
    APP_WAS_RUNNING=true
    echo ""
    echo "[restore] Stopping ${APP_CONTAINER}..."
    docker stop "${APP_CONTAINER}" >/dev/null
fi

# ── Force-disconnect any remaining sessions, then drop + recreate ─────────
echo "[restore] Terminating active connections..."
docker exec "${CONTAINER}" \
    psql -U "${DB_USER}" -d postgres -c "
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();" \
    >/dev/null

echo "[restore] Dropping and recreating database..."
docker exec "${CONTAINER}" \
    psql -U "${DB_USER}" -d postgres -c "
        DROP DATABASE IF EXISTS ${DB_NAME};
        CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};" \
    >/dev/null

# ── Restore from dump ─────────────────────────────────────────────────────
echo "[restore] Importing data..."
gunzip -c "${BACKUP_FILE}" | docker exec -i "${CONTAINER}" \
    pg_restore -U "${DB_USER}" -d "${DB_NAME}" --no-owner --no-privileges \
    --single-transaction --exit-on-error \
    2>&1 | sed 's/^/[pg_restore] /' || {
        echo "" >&2
        echo "ERROR: restore failed. The database is now EMPTY." >&2
        echo "  Re-importing: gunzip -c ${BACKUP_FILE} | docker exec -i ${CONTAINER} pg_restore -U ${DB_USER} -d ${DB_NAME}" >&2
        exit 1
    }

echo ""
echo "[restore] OK: database restored from ${BACKUP_FILE}"

# ── Restart the app if it was running before ──────────────────────────────
if [ "${APP_WAS_RUNNING}" = true ]; then
    echo "[restore] Restarting ${APP_CONTAINER}..."
    docker start "${APP_CONTAINER}" >/dev/null
fi
