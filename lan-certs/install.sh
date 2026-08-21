#!/bin/bash
# install.sh — Install the LAN cert as a system Trusted CA.
#
# Drop this folder on any Linux/macOS machine and run:
#   sudo ./install.sh
#
# What it does:
#   1. Locates cert.pem in the same folder as this script.
#   2. Removes any prior copy of this cert (idempotent re-run).
#   3. Copies the cert to /usr/local/share/ca-certificates/ (PEM).
#   4. Runs update-ca-certificates (Debian/Ubuntu) or update-ca-trust
#      (RHEL/Fedora) to refresh the system trust store.
#   5. Verifies the install by reading the cert back from the store
#      and prints a green check on success.
#
# Notes:
#   - macOS uses Keychain Access, not /usr/local/share. For macOS,
#     use the README's Keychain recipe instead.
#   - Firefox uses its own NSS trust DB and does NOT pick up system
#     CAs by default. The README has the optional Firefox step.
#   - Requires root. Will refuse to run otherwise.

set -e

# Resolve the folder this script lives in (works with symlinks too)
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERT_PEM="$HERE/cert.pem"
CERT_NAME="vitalcore-lan"
TARGET_DEBIAN="/usr/local/share/ca-certificates/${CERT_NAME}.crt"
TARGET_RHEL="/etc/pki/ca-trust/source/anchors/${CERT_NAME}.crt"

# ─── Sanity ─────────────────────────────────────────────────────────────
if [ ! -f "$CERT_PEM" ]; then
    echo "ERROR: cert.pem not found in $HERE" >&2
    echo "       Put the LAN cert (PEM, base64) in this folder and re-run." >&2
    exit 1
fi

# ─── Privilege check ────────────────────────────────────────────────────
if [ "$EUID" -ne 0 ]; then
    echo "ERROR: this script must run as root (it writes to the system CA store)." >&2
    echo "       Re-run with:    sudo $0" >&2
    exit 1
fi

# ─── Detect distro family ───────────────────────────────────────────────
install_debian() {
    rm -f "$TARGET_DEBIAN"
    install -m 644 "$CERT_PEM" "$TARGET_DEBIAN"
    echo "Installed: $TARGET_DEBIAN"
    update-ca-certificates --fresh
}

install_rhel() {
    rm -f "$TARGET_RHEL"
    install -m 644 "$CERT_PEM" "$TARGET_RHEL"
    echo "Installed: $TARGET_RHEL"
    update-ca-trust extract
}

if [ -d /usr/local/share/ca-certificates ] && command -v update-ca-certificates >/dev/null 2>&1; then
    install_debian
    DISTRO="Debian/Ubuntu"
elif [ -d /etc/pki/ca-trust ] && command -v update-ca-trust >/dev/null 2>&1; then
    install_rhel
    DISTRO="RHEL/Fedora/CentOS"
else
    echo "ERROR: no supported CA trust store found." >&2
    echo "       This script supports Debian/Ubuntu (update-ca-certificates)" >&2
    echo "       and RHEL/Fedora/CentOS (update-ca-trust)." >&2
    echo "       For other systems, see the README for manual install steps." >&2
    exit 1
fi

# ─── Verify ─────────────────────────────────────────────────────────────
echo ""
HASH=$(openssl x509 -in "$CERT_PEM" -noout -fingerprint -sha256 2>/dev/null | cut -d'=' -f2)
SUBJECT=$(openssl x509 -in "$CERT_PEM" -noout -subject 2>/dev/null | sed 's/^subject=//')
EXPIRES=$(openssl x509 -in "$CERT_PEM" -noout -enddate 2>/dev/null | sed 's/^notAfter=//')

echo -e "\033[32m✓\033[0m Cert installed to $DISTRO system trust store"
echo "    Subject:   $SUBJECT"
echo "    Expires:   $EXPIRES"
echo "    SHA-256:   $HASH"
echo ""
echo "Test: curl -I https://192.168.1.200/"
echo ""
echo "If you use Firefox, see README.md for the additional NSS step."
