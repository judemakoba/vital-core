#!/bin/sh
# ─── Vital Core HMS — container entrypoint ────────────────────────────────
# Runs once when the app container starts. Three jobs:
#   1. Wait for Postgres to be reachable (up to 60s)
#   2. Apply the Prisma schema (idempotent — `db push` is a no-op if up to date)
#   3. Start the Next.js standalone server (exec replaces the shell so
#      the app becomes PID 1 and receives signals properly)
#
# Why the wait: the `postgres` container may report "ready" via healthcheck
# before the daemon inside has finished initializing the data directory on
# a fresh volume. TCP-accepting != accepting auth'd connections. We poll.
#
# Why `prisma db push` here and not as a separate service: this app uses
# `db push` (not `migrate deploy`) in dev. Mirroring that in prod keeps
# the workflow identical. Safe to run on every boot — Prisma no-ops if
# the DB schema already matches.

set -e

echo "============================================================"
echo "  Vital Core HMS — container starting"
echo "  $(date -u +'%Y-%m-%d %H:%M:%S UTC')"
echo "============================================================"

# ---------------------------------------------------------------------------
# 1. Wait for Postgres
# ---------------------------------------------------------------------------
DB_HOST="${DATABASE_HOST:-postgres}"
DB_PORT="${DATABASE_PORT:-5432}"
WAIT_TIMEOUT="${DB_WAIT_TIMEOUT:-60}"

echo "[entrypoint] Waiting for Postgres at ${DB_HOST}:${DB_PORT} (timeout ${WAIT_TIMEOUT}s)..."

DB_HOST="$DB_HOST" DB_PORT="$DB_PORT" WAIT_TIMEOUT="$WAIT_TIMEOUT" node -e "
const net = require('net');
const host = process.env.DB_HOST;
const port = parseInt(process.env.DB_PORT, 10);
const timeoutMs = parseInt(process.env.WAIT_TIMEOUT, 10) * 1000;
const start = Date.now();

function attempt() {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setTimeout(2000);
    socket.once('connect', () => { socket.destroy(); resolve(); });
    socket.once('timeout', () => { socket.destroy(); reject(new Error('timeout')); });
    socket.once('error', (err) => { socket.destroy(); reject(err); });
    socket.connect(port, host);
  });
}

async function wait() {
  let dots = 0;
  while (Date.now() - start < timeoutMs) {
    try {
      await attempt();
      console.log('\\n[entrypoint] Postgres is accepting connections');
      return;
    } catch (err) {
      process.stdout.write('.');
      if (++dots % 30 === 0) process.stdout.write('\\n');
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  console.error('\\n[entrypoint] ERROR: Postgres did not become ready in time');
  process.exit(1);
}

wait();
" DB_HOST="$DB_HOST" DB_PORT="$DB_PORT" WAIT_TIMEOUT="$WAIT_TIMEOUT"

# ---------------------------------------------------------------------------
# 2. Apply Prisma schema
# ---------------------------------------------------------------------------
echo ""
echo "[entrypoint] Applying Prisma schema (db push, idempotent)..."

# We already ran `prisma generate` at build time on Linux, so:
#   --skip-generate avoids a redundant re-generation (saves ~5s on every boot)
#   --accept-data-loss matches the dev workflow this project uses
node node_modules/.bin/prisma db push \
    --schema=lib/generated-prisma/schema.prisma \
    --accept-data-loss \
    --skip-generate \
    2>&1 | sed 's/^/[prisma] /'

# ---------------------------------------------------------------------------
# 3. Start Next.js
# ---------------------------------------------------------------------------
echo ""
echo "[entrypoint] Starting Next.js standalone server on port ${PORT}..."
echo "============================================================"

# `exec` so the Node process becomes PID 1 and gets SIGTERM directly when
# `docker stop` is called. Without exec, shutdown would be delayed by the
# shell wrapper.
exec node server.js
