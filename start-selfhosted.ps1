# Self-hosted ($0) Mailflare launcher.
# Starts the Next.js app and the Cloudflare Tunnel if they aren't already
# running. Run this after a reboot, or whenever things are down:
#   powershell -ExecutionPolicy Bypass -File start-selfhosted.ps1
$ErrorActionPreference = 'Continue'
$repo = 'C:\Users\paw\Documents\GitHub\mailfare'
$exe = "$env:LOCALAPPDATA\cloudflared\cloudflared.exe"

# 1. Next dev server on :3000
$conn = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $conn) {
  Start-Process -FilePath 'npm.cmd' -ArgumentList 'run', 'dev' -WorkingDirectory $repo `
    -RedirectStandardOutput "$repo\dev-server.log" -RedirectStandardError "$repo\dev-server.err.log" -WindowStyle Hidden
  Write-Host 'Next dev server starting on :3000 ...'
} else {
  Write-Host 'Next dev server already running on :3000'
}

# 2. Cloudflare Tunnel (mail.akamasocial.online -> localhost:3000)
$proc = Get-Process cloudflared -ErrorAction SilentlyContinue
if (-not $proc) {
  Start-Process -FilePath $exe -ArgumentList 'tunnel', 'run', 'mailfare' -WorkingDirectory $env:USERPROFILE `
    -RedirectStandardOutput "$env:TEMP\cfl-run.log" -RedirectStandardError "$env:TEMP\cfl-run.err.log" -WindowStyle Hidden
  Write-Host 'Cloudflare tunnel (mailfare) starting ...'
} else {
  Write-Host 'Cloudflare tunnel already running'
}

Start-Sleep -Seconds 4
Write-Host ''
Write-Host 'Mailflare is (or will be shortly) available at:'
Write-Host '  local dev:    http://localhost:3000'
Write-Host '  public URL:   https://mail.akamasocial.online'
Write-Host ''
Write-Host 'Keep this PC running for mail to be receivable.'