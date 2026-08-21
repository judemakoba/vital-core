# Vital Core LAN Cert Installer

A drop-in folder for installing the self-signed LAN cert onto any
client machine so the browser, curl, apt, and other tools trust
`https://192.168.1.200` (the vitalcore LXC) without warnings.

## Why this exists

The Tailscale URL (`https://vitalcore.tailfd1512.ts.net`) is the
primary daily-driver and uses a publicly-trusted Let's Encrypt
cert, so it works out of the box on any device with internet.

But when the internet is down (routine in some hospital LAN
configurations), Tailscale goes dark too. The LAN IP
`https://192.168.1.200` is the offline lifeline, and it uses a
self-signed cert that's only trusted by machines that have
installed it explicitly. This folder is the installer.

## What's in this folder

| File          | Purpose                                          |
| ------------- | ------------------------------------------------ |
| `cert.pem`    | The LAN cert (PEM). NOT committed to git.        |
| `key.pem`     | The private key. **STRIP THIS BEFORE SHARING.**  |
| `install.sh`  | Linux/macOS installer (run with `sudo`).         |
| `install.ps1` | Windows PowerShell installer (auto-elevates).    |
| `install.bat` | Windows double-click launcher.                   |
| `README.md`   | This file.                                       |

`cert.pem` and `key.pem` are NOT in git — they're produced on the
LXC by `deploy/lan-fallback.md` and copied to this folder. The
install scripts ARE in git so they can be re-fetched from any
clone of the repo.

## Quick start

### Linux

```bash
sudo ./install.sh
```

Or, from a fresh checkout with no cert yet:

```bash
# 1. Pull the cert from the LXC (you'll need the SSH key)
scp root@vitalcore.tailfd1512.ts.net:/etc/caddy/lan-certs/cert.pem .

# 2. Install
sudo ./install.sh
```

### Windows

Double-click `install.bat`. Approve the UAC prompt. Done.

If UAC doesn't appear (e.g., on a domain-locked workstation),
right-click `install.bat` and choose **Run as administrator**.

To install for the current user only (no admin needed):

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1 -PerUser
```

## Verify

After install, restart your browser (it caches the cert store at
launch), then:

- Browser: open <https://192.168.1.200/> — should show no warning,
  valid padlock
- Linux terminal: `curl -I https://192.168.1.200/`
- Windows PowerShell: `Invoke-WebRequest -UseBasicParsing https://192.168.1.200/`

## Sharing this folder with another machine

The folder is meant to be portable. Before copying it elsewhere:

1. **Delete `key.pem`** — it's the private key, the LXC has the
   master copy, and it should never be on a client machine.
2. Copy the folder (via USB, scp, OneDrive, etc.) to the target
   machine.
3. On the target, drop the cert from the LXC into the folder:
   ```bash
   scp root@vitalcore.tailfd1512.ts.net:/etc/caddy/lan-certs/cert.pem .
   ```
4. Run the installer.

If you only want the install scripts, you can also just clone this
repo on the target machine and run them — the cert.pem fetch is
the only step that needs the LXC.

## Optional: Firefox (NSS trust DB)

Firefox on Linux does NOT pick up the system CA store. To trust
the LAN cert in Firefox too, run as the user who runs Firefox:

```bash
# Find the Firefox profile dir
PROFILE=$(ls -d ~/.mozilla/firefox/*.default-release 2>/dev/null | head -1)
if [ -z "$PROFILE" ]; then
    echo "No Firefox profile found. Open Firefox once, then re-run."
    exit 1
fi

certutil -A -n "vitalcore-lan" -t "CT,C,C" \
    -i /usr/local/share/ca-certificates/vitalcore-lan.crt \
    -d "sql:$PROFILE"
```

`certutil` ships with the `libnss3-tools` package on Debian/Ubuntu.

## Optional: macOS

macOS uses Keychain Access, not `/usr/local/share/ca-certificates/`.
For macOS clients:

```bash
sudo security add-trusted-cert -d -r trustRoot \
    -k /Library/Keychains/System.keychain cert.pem
```

(Or double-click `cert.pem` in Finder, add to System keychain, and
set it to "Always Trust".)

## Re-running the installer

Both installers are **idempotent**. Re-running them:

- Removes any prior copy of the cert with the same subject
- Installs the current `cert.pem`
- Verifies the new install

Useful when the cert is rotated (every ~10 years for the current
self-signed cert) or after the LXC's hostname/IP changes.

## Regenerating the cert

If you need a new cert (new hostname, new IP, key rotation), see
`deploy/lan-fallback.md` Step 1 on the LXC. The new `cert.pem`
goes into this folder, then re-run the installer on every client
machine.
