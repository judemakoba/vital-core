#!/bin/bash
# ─── Vital Core HMS — deploy-from-main ────────────────────────────────────
# Pulls origin/main, rebuilds the app image, and restarts just the app
# service (postgres, caddy, tailscale stay up). Run from /opt/vital-core.
#
# Usage:  ./scripts/deploy-from-main.sh
#
# Pre-conditions:
#   - We're on a branch that tracks origin/main (default `main`)
#   - .env.production exists at the repo root
#   - The 4 services are running (this script only touches the app)

set -e

cd "$(dirname "$0")/.."

echo "============================================================"
echo "  Vital Core HMS — deploy from origin/main"
echo "  $(date -u +'%Y-%m-%d %H:%M:%S UTC')"
echo "============================================================"

# 1. Sanity check: clean working tree (don't blow away uncommitted work)
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "ERROR: working tree has uncommitted changes."
  echo "Commit or stash them first, then re-run."
  git status --short
  exit 1
fi

# 2. Pull origin/main
echo ""
echo "[1/4] Pulling origin/main..."
git pull --ff-only origin main
HEAD=$(git rev-parse --short HEAD)
echo "      HEAD now at $HEAD"

# 3. Build new app image
echo ""
echo "[2/4] Building app image (this may take a few minutes)..."
docker compose --env-file .env.production build app 2>&1 | tail -3

# 4. Restart just the app
echo ""
echo "[3/4] Restarting app..."
docker compose --env-file .env.production stop app
docker compose --env-file .env.production rm -f app
docker compose --env-file .env.production up -d --no-deps app

# 5. Wait for Ready in logs
echo ""
echo "[4/4] Waiting for 'Ready in'..."
for i in {1..30}; do
  if docker compose --env-file .env.production logs --tail=20 app 2>&1 | grep -q "Ready in"; then
    echo ""
    echo "============================================================"
    echo "  ✓ Deploy complete (HEAD $HEAD)"
    echo "============================================================"
    exit 0
  fi
  sleep 2
done

echo ""
echo "============================================================"
echo "  ✗ App did not reach 'Ready in' within 60s"
echo "  Tail the logs: docker compose --env-file .env.production logs -f --tail=50 app"
echo "============================================================"
exit 1
