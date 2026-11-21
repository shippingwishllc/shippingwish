# ==============================================================================
# Shipping Wish & Loads Nexus — Safe Local Clipboard Load Sync Bridge
# ==============================================================================
# How it works (100% safe, zero interaction with TAL One or any other desktop app):
#   1. Watches ONLY your Windows Clipboard text once per second.
#   2. Strict Privacy Filter: ignores normal copied text (URLs, passwords, emails, chats).
#      Only syncs when clipboard clearly looks like freight load table rows
#      (at least 2 US "City, ST" pairs + freight terms like lbs / ft / Full / CS / DTP / $).
#   3. Automatically pushes copied rows to https://shippingwish.com/api/dispatch-desk/sync-dat-bulk
#      with reconcile_snapshot = true (adds new loads + auto-marks disappeared loads as Covered).
#   4. Broadcasts live to BOTH Shipping Wish Load Board & Loads Nexus Load Board + Mobile Apps!
# ==============================================================================

$ErrorActionPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# Disable Windows Console QuickEdit Mode so clicking inside this window NEVER pauses/freezes syncing!
try {
  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class SwConsoleMode {
  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern IntPtr GetStdHandle(int nStdHandle);
  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool GetConsoleMode(IntPtr hConsoleHandle, out uint lpMode);
  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool SetConsoleMode(IntPtr hConsoleHandle, uint dwMode);
  public static void DisableQuickEdit() {
    IntPtr handle = GetStdHandle(-10); // STD_INPUT_HANDLE
    uint mode;
    if (GetConsoleMode(handle, out mode)) {
      mode &= ~0x0040u; // Clear ENABLE_QUICK_EDIT_MODE
      mode |= 0x0080u;  // Set ENABLE_EXTENDED_FLAGS
      SetConsoleMode(handle, mode);
    }
  }
}
"@ -ErrorAction SilentlyContinue
  [SwConsoleMode]::DisableQuickEdit()
} catch {}

$ConfigPath = Join-Path $env:USERPROFILE '.shippingwish-bridge.json'
$ApiUrl     = 'https://www.shippingwish.com/api/dispatch-desk/sync-dat-bulk'

Clear-Host
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "   SHIPPING WISH & LOADS NEXUS - DESKTOP LOAD SYNC BRIDGE v2" -ForegroundColor White
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "  Live Endpoint : $ApiUrl" -ForegroundColor Green
Write-Host "  Click-Freeze  : DISABLED (safe to click or minimize anytime)" -ForegroundColor Green
Write-Host "  Privacy Guard : Ignores non-freight text (only syncs load rows)" -ForegroundColor DarkGray
Write-Host "  Multi-Scroll  : STACK MODE ON (scroll & copy to build 100s of loads; auto-expires stale loads after 3h)" -ForegroundColor DarkGray
Write-Host "=================================================================`n" -ForegroundColor Cyan

# Load or prompt for SuperAdmin Desktop Bridge Key (one-time setup)
$BridgeKey = ''
if (Test-Path $ConfigPath) {
  try {
    $cfg = Get-Content -Path $ConfigPath -Raw | ConvertFrom-Json
    if ($cfg.bridge_key) { $BridgeKey = [string]$cfg.bridge_key }
  } catch {}
}

while ([string]::IsNullOrWhiteSpace($BridgeKey)) {
  Write-Host "First-Time Setup (10 seconds):" -ForegroundColor Yellow
  Write-Host "  1. Open https://shippingwish.com/superadmin-command in Chrome" -ForegroundColor White
  Write-Host "  2. Click the 'Copy PC Bridge Key' button on the top blue Sync bar" -ForegroundColor White
  Write-Host "  3. Right-click below to paste your key and press Enter:`n" -ForegroundColor White
  $inputKey = Read-Host "Paste PC Bridge Key (starts with swb_)"
  $inputKey = $inputKey.Trim()
  if ($inputKey.Length -ge 16) {
    $BridgeKey = $inputKey
    @{ bridge_key = $BridgeKey; api_url = $ApiUrl; saved_at = (Get-Date).ToString('o') } |
      ConvertTo-Json | Set-Content -Path $ConfigPath -Encoding UTF8
    Write-Host "`n[OK] Bridge Key saved locally to $ConfigPath`n" -ForegroundColor Green
  } else {
    Write-Host "[!] Key looks too short. Please copy the full key from Superadmin Command Center.`n" -ForegroundColor Red
  }
}

function Get-TextHash([string]$Text) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
    return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '')
  } finally {
    $sha.Dispose()
  }
}

function Test-LooksLikeFreightTable([string]$Text) {
  if ([string]::IsNullOrWhiteSpace($Text) -or $Text.Length -lt 45) { return $false }
  # Must contain at least 2 US "City, ST" location pairs
  $cityMatches = [regex]::Matches($Text, '\b[A-Za-z][A-Za-z\s\.]{1,28},\s*[A-Z]{2}\b')
  if ($cityMatches.Count -lt 2) { return $false }
  # Must also contain at least one freight cue so normal addresses/letters are ignored
  $hasFreightCue = ($Text -match '(?i)\b(\d{1,3},\d{3}\s*lbs|lbs|53\s*ft|48\s*ft|26\s*ft|24\s*ft|Full|Partial|\d+\s*CS|\d+\s*DTP|\$[0-9,]+(?:\.[0-9]{2})?|BOOK ON EXTERNAL|Loaded Miles|DH-?O|\d+m\s)')
  return [bool]$hasFreightCue
}

# Seed with current clipboard hash ONLY if it is NOT a freight table, so if user ALREADY copied loads, it syncs immediately!
$LastHash = ''
$initialClip = Get-Clipboard -Raw
if (-not [string]::IsNullOrWhiteSpace($initialClip) -and -not (Test-LooksLikeFreightTable $initialClip)) {
  $LastHash = Get-TextHash $initialClip
}

Write-Host "[READY] Watching Windows Clipboard... Just press Ctrl+A then Ctrl+C in TAL One!" -ForegroundColor Green
Write-Host "        Keep this window minimized in the taskbar. Press Ctrl+C here to stop.`n" -ForegroundColor DarkGray

$SyncCount = 0

while ($true) {
  Start-Sleep -Milliseconds 1200

  $clip = Get-Clipboard -Raw
  if ([string]::IsNullOrWhiteSpace($clip)) { continue }

  $hash = Get-TextHash $clip
  if ($hash -eq $LastHash) { continue }
  $LastHash = $hash

  if (-not (Test-LooksLikeFreightTable $clip)) { continue }

  $ts = (Get-Date).ToString('HH:mm:ss')
  Write-Host "[$ts] Freight rows detected ($($clip.Length) chars) -> Syncing live..." -ForegroundColor Cyan

  try {
    $payload = @{
      rawText            = $clip
      text               = $clip
      reconcile_snapshot = $false
    } | ConvertTo-Json -Depth 4 -Compress

    $utf8Bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
    $headers = @{
      'x-bridge-key' = $BridgeKey
      'Content-Type' = 'application/json; charset=utf-8'
    }

    $resp = Invoke-RestMethod -Uri $ApiUrl -Method POST -Headers $headers -Body $utf8Bytes -TimeoutSec 25
    $SyncCount++

    $added     = [int]($resp.inserted_count)
    $covered   = [int]($resp.covered_stale_count)
    $dupes     = [int]($resp.skipped_duplicate_count)
    $total     = [int]($resp.total_received)
    $liveTotal = [int]($resp.total_live_open)

    Write-Host "[$ts] SYNC #$SyncCount OK! +$added new | -$covered expired | $dupes dupes | TOTAL LIVE: $liveTotal loads!" -ForegroundColor Green
    if ($resp.inserted_loads -and $resp.inserted_loads.Count -gt 0) {
      $preview = $resp.inserted_loads | Select-Object -First 3
      foreach ($l in $preview) {
        $contact = if ($l.broker_contact) { $l.broker_contact } else { 'No direct email/phone on row' }
        Write-Host ("       -> {0} | {1} -> {2} | `${3} | {4} | {5}" -f $l.load_number, $l.pickup_location, $l.delivery_location, $l.rate, $l.broker_name, $contact) -ForegroundColor Gray
      }
    }
    [Console]::Beep(880, 90)
  } catch {
    $errMsg = $_.Exception.Message
    $statusCode = $null
    try { $statusCode = [int]$_.Exception.Response.StatusCode } catch {}
    if ($statusCode -eq 401 -or $statusCode -eq 403) {
      Write-Host "[$ts] AUTH ERROR ($statusCode): Bridge Key invalid or rotated. Deleting local key — restart script to re-enter." -ForegroundColor Red
      Remove-Item -Path $ConfigPath -Force -ErrorAction SilentlyContinue
      break
    } else {
      Write-Host "[$ts] Sync warning: $errMsg" -ForegroundColor Yellow
    }
  }
}

Write-Host "`nBridge stopped. Press any key to close..." -ForegroundColor Yellow
$null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
