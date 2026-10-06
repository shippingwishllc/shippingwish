<#
  Shipping Wish LLC - TAL One 100% Autonomous Auto-Bridge Daemon
  Supports:
  1. Chrome DevTools Protocol (CDP port 9222) for 100% Zero-Click auto-streaming
  2. Integrated Live Auto-Sync Clipboard daemon (fail-safe fallback)
  3. Auto-creates desktop shortcut for 1-click Auto-Sync launching
#>

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Clear-Host

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   ⚡ Shipping Wish LLC - TAL One Autonomous Sync Bridge" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan

$Port = 9222
$CdpUrl = "http://127.0.0.1:$Port/json"

# Function to test if port 9222 is active
function Test-PortListening {
    try {
        $res = Invoke-RestMethod -Uri $CdpUrl -TimeoutSec 2 -ErrorAction Stop
        return ($res -ne $null)
    } catch {
        return $false
    }
}

# 1. Locate TAL One executable
$possiblePaths = @(
    "$env:USERPROFILE\Desktop\TAL One.exe",
    "C:\Users\HCT\Desktop\TAL One.exe",
    "$env:LOCALAPPDATA\Programs\TAL One\TAL One.exe",
    "$env:LOCALAPPDATA\TAL One\TAL One.exe",
    "C:\Users\Administrator\Desktop\TAL One.exe",
    "C:\Program Files\TAL One\TAL One.exe",
    "C:\Program Files (x86)\TAL One\TAL One.exe"
)

$talExe = $null
foreach ($p in $possiblePaths) {
    if (Test-Path $p) {
        $talExe = $p
        break
    }
}

# Also resolve shortcut on Desktop if .exe not found directly
if (-not $talExe) {
    try {
        $sh = New-Object -ComObject WScript.Shell
        $desktopLnk = Get-ChildItem -Path @("$env:USERPROFILE\Desktop", "$env:PUBLIC\Desktop") -Filter "*TAL*.lnk" -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($desktopLnk) {
            $target = $sh.CreateShortcut($desktopLnk.FullName).TargetPath
            if (Test-Path $target) { $talExe = $target }
        }
    } catch {}
}

# Auto-create Desktop Shortcut with Auto-Sync Port 9222 if TAL One is found
if ($talExe) {
    try {
        $wsh = New-Object -ComObject WScript.Shell
        $shortcutPath = Join-Path ([Environment]::GetFolderPath('Desktop')) "TAL One (Auto-Sync).lnk"
        $shortcut = $wsh.CreateShortcut($shortcutPath)
        $shortcut.TargetPath = $talExe
        $shortcut.Arguments = "--remote-debugging-port=$Port --remote-allow-origins=*"
        $shortcut.Description = "TAL One with Shipping Wish Auto-Sync Enabled"
        $shortcut.IconLocation = "$talExe,0"
        $shortcut.Save()
    } catch {}
}

# 2. Check if port 9222 is open, or launch TAL One in Auto-Sync mode
$connectedCdp = $false

if (-not (Test-PortListening)) {
    Write-Host "[1/2] Checking TAL One running state..." -ForegroundColor Yellow
    
    # Check if TAL One is already running
    $runningProcs = Get-Process | Where-Object { $_.MainWindowTitle -like "*DAT One*" -or $_.ProcessName -like "*TAL*" -or $_.Path -like "*TAL One*" }
    
    if ($runningProcs -and $talExe) {
        Write-Host "      Restarting TAL One with Auto-Sync Port 9222..." -ForegroundColor Cyan
        $runningProcs | Stop-Process -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
        
        Start-Process -FilePath $talExe -ArgumentList "--remote-debugging-port=$Port --remote-allow-origins=*"
        Write-Host "      Waiting for TAL One window to open..." -ForegroundColor Gray
        
        $retries = 10
        while ($retries -gt 0 -and -not (Test-PortListening)) {
            Start-Sleep -Seconds 1
            $retries--
        }
    } elseif ($talExe) {
        Write-Host "      Launching TAL One with Auto-Sync Port 9222..." -ForegroundColor Cyan
        Start-Process -FilePath $talExe -ArgumentList "--remote-debugging-port=$Port --remote-allow-origins=*"
        $retries = 10
        while ($retries -gt 0 -and -not (Test-PortListening)) {
            Start-Sleep -Seconds 1
            $retries--
        }
    }
}

$connectedCdp = Test-PortListening

if ($connectedCdp) {
    Write-Host "[2/2] Connected to TAL One via local port 9222!" -ForegroundColor Green
    Write-Host ""
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host "   🟢 100% ZERO-CLICK AUTO-STREAMING IS ACTIVE!" -ForegroundColor Green
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host "👉 Instructions: Just use TAL One normally. Click SEARCH on any city." -ForegroundColor White
    Write-Host "   Loads will stream automatically into Shipping Wish LoadsNexus!`n" -ForegroundColor Gray
} else {
    Write-Host "[2/2] TAL One is running in standard mode." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host "   🟢 LIVE AUTO-SYNC BRIDGE IS ACTIVE & LISTENING 24/7!" -ForegroundColor Green
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host "👉 How to sync in 1-Second:" -ForegroundColor Yellow
    Write-Host "   1. In TAL One, click the search table." -ForegroundColor White
    Write-Host "   2. Press Ctrl+A then Ctrl+C (or select rows)." -ForegroundColor White
    Write-Host "   3. All 400+ loads will immediately push to shippingwish.com!" -ForegroundColor White
    Write-Host "   (A new 'TAL One (Auto-Sync)' shortcut has also been placed on your Desktop)`n" -ForegroundColor Cyan
}

Add-Type -AssemblyName System.Windows.Forms

# Master loop: Handles both CDP extraction and Live Clipboard auto-sync simultaneously
$LastClipHash = ""
$LastCdpHash = ""

$ExtractScript = @"
(() => {
    try {
        const rows = document.querySelectorAll('div[role="row"], tr, .dat-load-row, [data-test="load-row"]');
        const list = [];
        rows.forEach(r => {
            const txt = (r.innerText || '').trim();
            if (txt && txt.length > 20) list.push(txt);
        });

        // Identify virtual scroll container
        const scroller = document.querySelector('cdk-virtual-scroll-viewport') ||
                         document.querySelector('[role="grid"]') ||
                         document.querySelector('.load-board-results') ||
                         document.querySelector('.virtual-scroll-viewport') ||
                         document.querySelector('div[style*="overflow-y: auto"], div[style*="overflow-y: scroll"]');

        if (window.__sw_scroll_cycle === undefined) {
            window.__sw_scroll_cycle = 0;
            window.__sw_last_top = '';
        }

        const topRow = rows[1] ? rows[1].innerText : (rows[0] ? rows[0].innerText : '');
        const isNewTopLoad = Boolean(topRow && topRow !== window.__sw_last_top);

        if (isNewTopLoad) {
            // New load posted at top! Prioritize immediately and reset to top
            window.__sw_last_top = topRow;
            window.__sw_scroll_cycle = 0;
            if (scroller && scroller.scrollTop > 50) {
                scroller.scrollTop = 0;
            }
        } else if (scroller) {
            // Deep background scan: Every 3 cycles (~4s), advance scroll to pull next batch of rows
            window.__sw_scroll_cycle++;
            if (window.__sw_scroll_cycle % 3 === 0) {
                const maxScroll = (scroller.scrollHeight || 10000) - (scroller.clientHeight || 500);
                if (scroller.scrollTop < Math.min(maxScroll, 4000)) {
                    scroller.scrollTop += (scroller.clientHeight ? Math.floor(scroller.clientHeight * 0.85) : 450);
                } else {
                    scroller.scrollTop = 0;
                }
            }
        }

        const main = document.querySelector('[role="grid"], table, .load-board-results') || document.body;
        return JSON.stringify({
            count: list.length,
            isNewTopLoad: isNewTopLoad,
            fullText: main ? main.innerText : document.body.innerText
        });
    } catch(e) {
        return JSON.stringify({ error: e.message });
    }
})()
"@

while ($true) {
    $timestamp = (Get-Date).ToString("HH:mm:ss")

    # A. Check Clipboard for copied loads (100% reliable)
    try {
        if ([System.Windows.Forms.Clipboard]::ContainsText()) {
            $clip = [System.Windows.Forms.Clipboard]::GetText()
            if ($clip -and $clip.Trim().Length -gt 25 -and ($clip -match "[A-Za-z]+,\s*[A-Za-z]{2}" -or $clip -match "lbs|Trip|\$")) {
                $md5 = [System.Security.Cryptography.MD5]::Create()
                $hashBytes = $md5.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($clip))
                $currentHash = [BitConverter]::ToString($hashBytes)

                if ($currentHash -ne $LastClipHash) {
                    $LastClipHash = $currentHash
                    Write-Host "[$timestamp] ⚡ Detected live loads from TAL One! Pushing to Shipping Wish..." -ForegroundColor Cyan

                    $body = @{ rawText = $clip } | ConvertTo-Json
                    $apiUrl = "https://www.shippingwish.com/api/dispatch/sync-dat-bulk"

                    try {
                        $webClient = New-Object System.Net.WebClient
                        $webClient.Headers.Add("Content-Type", "application/json; charset=utf-8")
                        $responseJson = $webClient.UploadString($apiUrl, "POST", $body)
                        $response = $responseJson | ConvertFrom-Json

                        if ($response.ok) {
                            Write-Host "[$timestamp] ✅ SYNC SUCCESS! Processed $($response.total_received) loads:" -ForegroundColor Green
                            Write-Host "              • +$($response.inserted_count) new loads published to LoadsNexus" -ForegroundColor Green
                            Write-Host "              • $($response.matched_count) loads matched to fleet trucks" -ForegroundColor Green
                            Write-Host "              • View live right now at https://www.shippingwish.com/load-booking`n" -ForegroundColor Gray
                        } else {
                            Write-Host "[$timestamp] ⚠️ Server notice: $($response.error)`n" -ForegroundColor Yellow
                        }
                    } catch {
                        Write-Host "[$timestamp] ⚠️ Push error: $($_.Exception.Message)`n" -ForegroundColor Yellow
                    }
                }
            }
        }
    } catch {}

    # B. Dynamic CDP check: If port 9222 becomes active (or was active), query CDP in background
    $cdpActive = Test-PortListening
    if ($cdpActive) {
        if (-not $connectedCdp) {
            $connectedCdp = $true
            Write-Host "[$timestamp] 🟢 TAL One connected on port 9222! Zero-Click Auto-Streaming is LIVE." -ForegroundColor Green
        }
        try {
            $targets = Invoke-RestMethod -Uri $CdpUrl -TimeoutSec 2 -ErrorAction SilentlyContinue
            $datTarget = $targets | Where-Object { $_.title -like "*DAT One*" -or $_.url -like "*dat.com*" -or $_.type -eq "page" } | Select-Object -First 1

            if ($datTarget -and $datTarget.webSocketDebuggerUrl) {
                $wsUri = [System.Uri]$datTarget.webSocketDebuggerUrl
                $client = [System.Net.WebSockets.ClientWebSocket]::new()
                $ct = [System.Threading.CancellationToken]::None
                $connectTask = $client.ConnectAsync($wsUri, $ct)
                $connectTask.Wait(3000)

                if ($client.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
                    $reqId = [int](Get-Random -Minimum 1000 -Maximum 9999)
                    $evalPayload = @{
                        id = $reqId
                        method = "Runtime.evaluate"
                        params = @{
                            expression = $ExtractScript
                            returnByValue = $true
                        }
                    } | ConvertTo-Json -Compress

                    $sendBuffer = [System.Text.Encoding]::UTF8.GetBytes($evalPayload)
                    $sendSeg = [System.ArraySegment[byte]]::new($sendBuffer)
                    $sendTask = $client.SendAsync($sendSeg, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $ct)
                    $sendTask.Wait(2000)

                    $recvBuffer = New-Object byte[] 65536
                    $recvSeg = [System.ArraySegment[byte]]::new($recvBuffer)
                    $recvTask = $client.ReceiveAsync($recvSeg, $ct)
                    $recvTask.Wait(3000)

                    if ($recvTask.IsCompleted) {
                        $respStr = [System.Text.Encoding]::UTF8.GetString($recvBuffer, 0, $recvTask.Result.Count)
                        $respJson = $respStr | ConvertFrom-Json
                        $rawResult = $respJson.result.result.value

                        if ($rawResult) {
                            $parsedResult = $rawResult | ConvertFrom-Json
                            $textToPush = $parsedResult.fullText

                            if ($textToPush -and $textToPush.Length -gt 100) {
                                $md5 = [System.Security.Cryptography.MD5]::Create()
                                $hashBytes = $md5.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($textToPush))
                                $currHash = [BitConverter]::ToString($hashBytes)

                                if ($currHash -ne $LastCdpHash) {
                                    $LastCdpHash = $currHash
                                    if ($parsedResult.isNewTopLoad) {
                                        Write-Host "[$timestamp] 🚨 NEW FRESH LOAD ARRIVED AT TOP! Instant priority stream..." -ForegroundColor Magenta
                                    } else {
                                        Write-Host "[$timestamp] ⚡ Auto-detected live loads in TAL One! Streaming..." -ForegroundColor Cyan
                                    }

                                    $postBody = @{ rawText = $textToPush } | ConvertTo-Json
                                    $apiRes = Invoke-RestMethod -Uri "https://www.shippingwish.com/api/dispatch/sync-dat-bulk" -Method Post -Body $postBody -ContentType "application/json" -TimeoutSec 15

                                    if ($apiRes.ok) {
                                        Write-Host "[$timestamp] ✅ ZERO-CLICK SYNC SUCCESS! Processed $($apiRes.total_received) loads:" -ForegroundColor Green
                                        Write-Host "              • +$($apiRes.inserted_count) new loads live on LoadsNexus" -ForegroundColor Green
                                        Write-Host "              • $($apiRes.matched_count) matched to your active fleet trucks`n" -ForegroundColor Gray
                                    }
                                }
                            }
                        }
                    }

                    $closeTask = $client.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "done", $ct)
                    $closeTask.Wait(1000)
                }
            }
        } catch {}
    } else {
        if ($connectedCdp) {
            $connectedCdp = $false
            Write-Host "[$timestamp] ℹ️ TAL One closed. Bridge waiting in background for reopen..." -ForegroundColor Gray
        }
    }

    Start-Sleep -Milliseconds 1500
}
