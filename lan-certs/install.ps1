# install.ps1 - Install the LAN cert as a Windows Trusted Root CA.
#
# Drop this folder on any Windows machine and run ONE of:
#   - Double-click install.bat
#   - From an elevated PowerShell:  powershell -ExecutionPolicy Bypass -File .\install.ps1
#   - From this folder in PowerShell: .\install.ps1
#
# What it does:
#   1. Locates cert.pem in the same folder as this script.
#   2. Converts PEM to DER (Import-Certificate needs DER; we base64-decode).
#   3. Removes any prior cert with the same subject from LocalMachine\Root
#      (idempotent re-run, even if the cert was regenerated with a new key).
#   4. Installs the new cert to LocalMachine\Root.
#   5. Verifies the install by reading it back from the store.
#
# Notes:
#   - Auto-elevates to Administrator via UAC if not already elevated.
#   - Per-user (CurrentUser\Root) install is also supported via the
#     -PerUser switch, but most hospital workstations want the
#     machine-wide store so all users (and services) trust the cert.
#   - If your install.bat didn't trigger UAC, right-click it and
#     "Run as administrator".

[CmdletBinding()]
param(
    [switch]$PerUser
)

$ErrorActionPreference = "Stop"

# Self-folder (resolves correctly even when launched via Explorer)
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$certsDir = $here
$certPem = Join-Path $certsDir "cert.pem"
$certDer = Join-Path $certsDir "vitalcore-lan.cer"

# ─── Sanity ──────────────────────────────────────────────────────────────
if (-not (Test-Path $certPem)) {
    Write-Host "ERROR: cert.pem not found in $certsDir" -ForegroundColor Red
    Write-Host "       Put the LAN cert (PEM, base64) in this folder and re-run."
    Read-Host "Press Enter to exit"
    exit 1
}

# ─── Privilege check + auto-elevation ───────────────────────────────────
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
$isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "Need to run as Administrator. Requesting elevation..." -ForegroundColor Yellow
    $args2 = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$PSCommandPath`"")
    if ($PerUser) { $args2 += "-PerUser" }
    try {
        Start-Process -FilePath "powershell.exe" -ArgumentList $args2 -Verb RunAs -WorkingDirectory $here
    } catch {
        Write-Host "Elevation cancelled or failed." -ForegroundColor Red
        Write-Host "Right-click install.bat and 'Run as administrator' instead." -ForegroundColor Yellow
        Read-Host "Press Enter to exit"
        exit 1
    }
    exit 0
}

# ─── Store selection ─────────────────────────────────────────────────────
if ($PerUser) {
    $storeLocation = [System.Security.Cryptography.X509Certificates.StoreLocation]::CurrentUser
    $storeName     = [System.Security.Cryptography.X509Certificates.StoreName]::Root
} else {
    $storeLocation = [System.Security.Cryptography.X509Certificates.StoreLocation]::LocalMachine
    $storeName     = [System.Security.Cryptography.X509Certificates.StoreName]::Root
}

# ─── Convert PEM → DER (writeAllBytes with base64; bypasses X509 Export limits) ─
$pemText    = Get-Content $certPem -Raw
$base64Body = $pemText `
    -replace '-----BEGIN CERTIFICATE-----','' `
    -replace '-----END CERTIFICATE-----','' `
    -replace '\s',''
[System.IO.File]::WriteAllBytes($certDer, [Convert]::FromBase64String($base64Body))

$tempCert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($certDer)
Write-Host ("Loaded cert: subject={0}, expires={1:yyyy-MM-dd}" -f $tempCert.Subject, $tempCert.NotAfter)

# ─── Open store, remove prior, add new, close ───────────────────────────
$store = New-Object System.Security.Cryptography.X509Certificates.X509Store($storeName, $storeLocation)
$store.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)

try {
    # Remove any prior cert with the same subject (handles re-runs
    # after the cert was regenerated with a different key).
    $existing = $store.Certificates | Where-Object { $_.Subject -eq $tempCert.Subject }
    foreach ($old in $existing) {
        Write-Host ("Removing prior cert: thumbprint={0}" -f $old.Thumbprint) -ForegroundColor Yellow
        $store.Remove($old)
    }

    $store.Add($tempCert)
} finally {
    $store.Close()
}

# ─── Verify ──────────────────────────────────────────────────────────────
$verifyStore = New-Object System.Security.Cryptography.X509Certificates.X509Store($storeName, $storeLocation)
$verifyStore.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadOnly)
try {
    $found = $verifyStore.Certificates | Where-Object { $_.Thumbprint -eq $tempCert.Thumbprint }
} finally {
    $verifyStore.Close()
}

if ($found.Count -gt 0) {
    Write-Host ""
    Write-Host "[OK] LAN cert installed to $storeLocation\$storeName" -ForegroundColor Green
    Write-Host ("     Subject:     {0}" -f $tempCert.Subject)
    Write-Host ("     Thumbprint:  {0}" -f $tempCert.Thumbprint)
    Write-Host ("     Expires:     {0:yyyy-MM-dd}" -f $tempCert.NotAfter)
    Write-Host ""
    Write-Host "Test: open https://192.168.1.200/ in your browser."
    Write-Host "      (Restart the browser first so it picks up the new store.)"
} else {
    Write-Host "ERROR: cert was added but is not visible in the store." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

if (-not $PerUser) {
    Read-Host "Press Enter to exit"
}
