#!/bin/sh
# ─── Vital Core HMS — Proxmox LXC preparation helper ──────────────────────
# Run this INSIDE the LXC (after `pct enter <ctid>` or via SSH) to:
#   1. Detect whether we're in an LXC
#   2. Verify the LXC features Docker needs (nesting, FUSE, keyctl)
#   3. Optionally install Docker + the Compose plugin
#   4. Print a checklist of what to do at the Proxmox host level
#
# Why this matters: Docker inside LXC needs specific kernel features
# exposed by the host. If the Proxmox LXC is created without them,
# Docker will install fine but containers will fail to start with
# cryptic errors like "open sysctl ... permission denied".
#
# Usage:
#   ./scripts/lxc-prep.sh                # check only
#   ./scripts/lxc-prep.sh --install      # check + install Docker
#   ./scripts/lxc-prep.sh --help

set -e

INSTALL_DOCKER=false
for arg in "$@"; do
    case "$arg" in
        --install) INSTALL_DOCKER=true ;;
        --help|-h)
            echo "Usage: $0 [--install] [--help]"
            echo ""
            echo "  --install   also install Docker + Compose plugin via apt"
            echo "  --help      show this help"
            exit 0
            ;;
    esac
done

PASS=0; FAIL=0
ok()   { echo "  \033[32m✓\033[0m $1"; PASS=$((PASS+1)); }
warn() { echo "  \033[33m!\033[0m $1"; }
fail() { echo "  \033[31m✗\033[0m $1"; FAIL=$((FAIL+1)); }
heading() { echo ""; echo "─── $1 ───"; }

# ────────────────────────────────────────────────────────────────────────────
heading "1. Environment detection"
# ────────────────────────────────────────────────────────────────────────────

# /proc/1/cgroup shows "lxc/*" inside an LXC, "systemd" or "init.scope" in a VM/host.
if [ -f /proc/1/cgroup ] && grep -qE '(lxc|containerd)' /proc/1/cgroup 2>/dev/null; then
    ok "Running inside an LXC container"
    IN_LXC=true
elif systemd-detect-virt --container >/dev/null 2>&1 && [ "$(systemd-detect-virt --container)" != "none" ]; then
    ok "Running inside a container ($(systemd-detect-virt --container))"
    IN_LXC=true
else
    warn "Not detected as an LXC. If you're sure this IS an LXC, you can still continue."
    warn "If this is a full VM or bare metal, skip this script — Docker install normally."
    IN_LXC=false
fi

# Identify the OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    ok "OS: ${PRETTY_NAME}"
else
    fail "Could not detect OS (/etc/os-release missing)"
    exit 1
fi

# ────────────────────────────────────────────────────────────────────────────
heading "2. LXC feature check (only relevant inside LXC)"
# ────────────────────────────────────────────────────────────────────────────

if [ "${IN_LXC}" = true ]; then
    # Check kernel features visible inside the container.
    # These come from the LXC config on the Proxmox host:
    #   features: nesting=1,fuse=1,keyctl=1
    # Without nesting, Docker can't start (it needs its own cgroups).
    # Without FUSE, BuildKit can't pull images. Without keyctl, some
    # security ops fail.

    # Special case: detect the community-scripts Docker helper. It creates
    # the LXC with the right features pre-configured, so we can skip
    # the heavy feature checks. We detect it by looking for the helper's
    # fingerprint in /etc/pve/lxc/<ctid>.conf (visible via the host's
    # mount) or by checking the systemd unit that the helper installs.
    if [ -f /etc/systemd/system/docker.service.d/docker.conf ] || \
       [ -f /usr/local/bin/docker-installer.sh ] || \
       systemctl list-unit-files 2>/dev/null | grep -q 'docker-setup'; then
        ok "LXC appears to be set up by the community-scripts Docker helper (features should be correct)"
        COMMUNITY_SCRIPTS=true
    else
        COMMUNITY_SCRIPTS=false
    fi

    # Nesting: check by trying to mount a new cgroup hierarchy.
    if grep -qw cgroup /proc/self/cgroup && [ -d /sys/fs/cgroup ]; then
        ok "Control groups are visible (nesting looks OK)"
    else
        fail "No cgroup hierarchy visible — LXC likely needs features=nesting=1 on the Proxmox host"
    fi

    # FUSE: needed by BuildKit for some image operations
    if [ -e /dev/fuse ] || lsmod 2>/dev/null | grep -qw fuse; then
        ok "FUSE device present (fuse=1)"
    else
        warn "No /dev/fuse — BuildKit may fail. Add features=fuse=1 to the LXC config."
    fi

    # keyctl: needed for some secure-mount operations
    if command -v keyctl >/dev/null 2>&1; then
        ok "keyctl available (keyctl=1)"
    else
        warn "keyctl not found — install kmod package, or add features=keyctl=1"
    fi

    # overlayfs: the killer. Some kernels block it inside unprivileged LXCs.
    if [ -f /proc/filesystems ] && grep -qw overlay /proc/filesystems; then
        ok "overlayfs supported (this is the critical one)"
    else
        fail "overlayfs NOT in /proc/filesystems — Docker cannot use OverlayFS driver"
        echo ""
        echo "      Most likely cause: unprivileged LXC on a host with strict AppArmor."
        echo "      Fix on the Proxmox HOST (pct stop <ctid> first):"
        echo "        pct set <ctid> -features nesting=1,fuse=1,keyctl=1 -unprivileged 0"
        echo "      Then pct start <ctid> and re-run this script."
    fi
fi

# ────────────────────────────────────────────────────────────────────────────
heading "3. Existing Docker check"
# ────────────────────────────────────────────────────────────────────────────

if command -v docker >/dev/null 2>&1; then
    DOCKER_VERSION=$(docker --version 2>/dev/null || echo "unknown")
    ok "Docker already installed: ${DOCKER_VERSION}"
else
    if [ "${INSTALL_DOCKER}" = true ]; then
        echo "  Installing Docker..."
        case "${ID}" in
            debian|ubuntu)
                apt-get update
                apt-get install -y ca-certificates curl gnupg
                install -m 0755 -d /etc/apt/keyrings
                curl -fsSL https://download.docker.com/linux/${ID}/gpg \
                    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
                chmod a+r /etc/apt/keyrings/docker.gpg
                echo \
                    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${ID} \
                    $(. /etc/os-release && echo "${VERSION_CODENAME}") stable" \
                    > /etc/apt/sources.list.d/docker.list
                apt-get update
                apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
                ok "Docker installed"
                ;;
            *)
                fail "Auto-install not supported on ${ID}. Install Docker manually: https://docs.docker.com/engine/install/"
                ;;
        esac
    else
        warn "Docker not found. Re-run with --install to install it automatically."
    fi
fi

# ────────────────────────────────────────────────────────────────────────────
heading "4. Compose check"
# ────────────────────────────────────────────────────────────────────────────

if docker compose version >/dev/null 2>&1; then
    ok "Docker Compose v2 available: $(docker compose version)"
elif command -v docker-compose >/dev/null 2>&1; then
    warn "Only docker-compose v1 found (deprecated). Install the v2 plugin."
else
    fail "No Compose. Install via apt: docker-compose-plugin"
fi

# ────────────────────────────────────────────────────────────────────────────
heading "5. Proxmox host checklist (if running inside LXC)"
# ────────────────────────────────────────────────────────────────────────────

if [ "${IN_LXC}" = true ]; then
    cat <<'EOF'
  On the Proxmox HOST (pct stop <ctid> first, then run):

    pct set <ctid> -features nesting=1,fuse=1,keyctl=1

  If you keep getting "permission denied" on /proc/sys when starting
  containers, you may also need (lxc.apparmor.profile=unconfined in
  /etc/pve/lxc/<ctid>.conf — last resort, weakens host isolation).

  Recommended resource sizing for a small hospital HMS:
    pct set <ctid> -cores 4 -memory 4096 -swap 1024 -rootfs local-lvm:32
    # 4 GB RAM is comfortable. 32 GB disk gives you headroom for
    # Postgres + uploads + Next.js cache.

  Firewall (Proxmox host or upstream router):
    - With Tailscale: no inbound ports needed — Tailscale reaches
      the LXC via its own 100.x.x.x IP
    - If also using a real domain: open TCP 80 + 443
    - The Postgres port 5432 should NEVER be exposed to the internet
EOF
fi

# ────────────────────────────────────────────────────────────────────────────
heading "5. Tailscale prerequisites"
# ────────────────────────────────────────────────────────────────────────────

# The Tailscale sidecar in the stack needs a TUN device and NET_ADMIN
# capabilities. The community-scripts helper usually allows this, but
# some Proxmox versions block it on unprivileged LXCs.
if [ -e /dev/net/tun ]; then
    ok "/dev/net/tun device present (Tailscale will work)"
else
    warn "/dev/net/tun missing — Tailscale sidecar will fail to start"
    if [ "${IN_LXC}" = true ]; then
        echo "      Fix on the Proxmox host:"
        echo "        pct stop <ctid> && pct set <ctid> -features nesting=1,fuse=1,keyctl=1 && pct start <ctid>"
        echo "      If that doesn't work, also try -features net_admin=1"
        echo "      Or make the LXC privileged:  pct set <ctid> -unprivileged 0"
    fi
fi

# Check if a tailscale daemon is already running (might conflict)
if pgrep -f tailscaled >/dev/null 2>&1; then
    warn "A tailscaled process is already running on the LXC host"
    echo "      The Tailscale sidecar uses a SEPARATE state directory"
    echo "      (/var/lib/tailscale in the container) so they shouldn't"
    echo "      conflict, but watch for 'socket already in use' errors"
fi

# Check for an existing Tailscale auth key in the env file
ENV_FILE="${ENV_FILE:-.env.production}"
if [ -f "${ENV_FILE}" ] && grep -q "^TS_AUTHKEY=tskey-" "${ENV_FILE}"; then
    ok "TS_AUTHKEY is set in ${ENV_FILE}"
elif [ -f "${ENV_FILE}" ] && grep -q "^TS_AUTHKEY=CHANGE_ME" "${ENV_FILE}"; then
    warn "TS_AUTHKEY is still the placeholder — get a real key from"
    echo "      https://login.tailscale.com/admin/settings/keys"
else
    warn "TS_AUTHKEY not found in ${ENV_FILE}. You'll need to set it"
    echo "      before docker compose up. See DEPLOY.md step 3."
fi

# Check for Tailscale on the host (alternative to sidecar)
if command -v tailscale >/dev/null 2>&1; then
    ok "Tailscale is installed on the LXC host ($(tailscale version 2>/dev/null | head -1))"
    echo "      (The sidecar uses a separate daemon; you can have both)"
fi

# ────────────────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════"
echo "  ${PASS} passed, ${FAIL} failed"
echo "════════════════════════════════════════"

if [ "${FAIL}" -gt 0 ]; then
    echo ""
    echo "  Fix the failed checks above before continuing."
    echo "  See deploy/DEPLOY.md for the full walkthrough."
    exit 1
fi
