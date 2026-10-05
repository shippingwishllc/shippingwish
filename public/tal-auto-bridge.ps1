<#
  Shipping Wish LLC - TAL One 100% Zero-Click Auto-Network Bridge Daemon
  Connects to TAL One via Chrome DevTools Protocol (CDP port 9222).
  Automatically intercepts live search results and streams them to shippingwish.com without any manual Ctrl+C!
#>

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Clear-Host

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   ⚡ Shipping Wish LLC - TAL One 100% Zero-Click Auto-Bridge" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan

$Port = 9222
$CdpUrl = "http://127.0.0.1:$Port/json"

# 1. Check if TAL One is already listening on port 9222
function Test-PortListening {
    try {
        $res = Invoke-RestMethod -Uri $CdpUrl -TimeoutSec 2 -ErrorAction Stop
        return ($res -ne $null)
    } catch {
        return $false
    }
}

if (-not (Test-PortListening)) {
    Write-Host "[1/3] Preparing TAL One in Auto-Sync Mode..." -ForegroundColor Yellow
    
    # Close any running TAL One instances so it can launch with debugging port
    Get-Process -Name "*TAL*" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1

    # Find TAL One executable path
    $possiblePaths = @(
        "$env:USERPROFILE\Desktop\TAL One.exe",
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

    if (-not $talExe) {
        Write-Host "⚠️ TAL One.exe not found automatically. Searching Desktop..." -ForegroundColor Yellow
        $search = Get-ChildItem -Path "$env:USERPROFILE\Desktop", "C:\Users" -Filter "TAL One.exe" -Recurse -Depth 2 -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($search) { $talExe = $search.FullName }
    }

    if ($talExe) {
        Write-Host "[2/3] Launching TAL One with Auto-Sync Port 9222 ($talExe)..." -ForegroundColor Cyan
        Start-Process -FilePath $talExe -ArgumentList "--remote-debugging-port=$Port"
        Write-Host "      Waiting for TAL One window to open..." -ForegroundColor Gray
        
        $retries = 15
        while ($retries -gt 0 -and -not (Test-PortListening)) {
            Start-Sleep -Seconds 1
            $retries--
        }
    } else {
        Write-Host "❌ Could not find TAL One.exe automatically." -ForegroundColor Red
        Write-Host "Please close TAL One, right-click its shortcut -> Properties, add ' --remote-debugging-port=9222' to Target, and restart it." -ForegroundColor Yellow
    }
}

if (-not (Test-PortListening)) {
    Write-Host "❌ Could not attach to port 9222. Falling back to Live Clipboard Auto-Sync Listener..." -ForegroundColor Yellow
    & (Join-Path $PSScriptRoot "tal-bridge.ps1")
    exit
}

Write-Host "[3/3] Connected to TAL One via local port 9222!" -ForegroundColor Green
Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "   🟢 ZERO-CLICK AUTO-BRIDGE IS RUNNING & ACTIVE!" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "👉 Instructions: Just use TAL One normally. Click SEARCH on any city." -ForegroundColor White
Write-Host "   The daemon will automatically stream all loads directly to shippingwish.com!" -ForegroundColor White
Write-Host "   No selecting, no Ctrl+C, no exporting needed.`n" -ForegroundColor Gray

# JS script to run inside TAL One page context to extract all visible and virtual search table rows
$ExtractScript = @"
(() => {
    try {
        const loads = [];
        // Extract table rows from DAT One interface
        const rows = document.querySelectorAll('div[role="row"], tr, .dat-load-row, [data-test="load-row"]');
        rows.forEach(r => {
            const text = (r.innerText || '').trim();
            if (text && text.length > 20 && (text.includes('mi') || text.includes('$') || text.includes(','))) {
                loads.push(text);
            }
        });

        // Also check if entire table text is available
        const mainGrid = document.querySelector('[role="grid"], table, .load-board-results');
        const gridText = mainGrid ? (mainGrid.innerText || '').trim() : '';

        return JSON.stringify({
            rowCount: loads.length,
            sample: loads.slice(0, 50),
            fullText: gridText || document.body.innerText || ''
        });
    } catch (e) {
        return JSON.stringify({ error: e.message });
    }
})()
"@

$LastPayloadHash = ""

while ($true) {
    try {
        $targets = Invoke-RestMethod -Uri $CdpUrl -TimeoutSec 3 -ErrorAction SilentlyContinue
        $datTarget = $targets | Where-Object { $_.title -like "*DAT One*" -or $_.url -like "*dat.com*" -or $_.type -eq "page" } | Select-Object -First 1

        if ($datTarget -and $datTarget.webSocketDebuggerUrl) {
            $wsUri = [System.Uri]$datTarget.webSocketDebuggerUrl
            $client = [System.Net.WebSockets.ClientWebSocket]::new()
            $ct = [System.Threading.CancellationToken]::None
            
            $connectTask = $client.ConnectAsync($wsUri, $ct)
            $connectTask.Wait(4000)

            if ($client.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
                # Evaluate DOM extraction
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

                # Receive response
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

                            if ($currHash -ne $LastPayloadHash) {
                                $LastPayloadHash = $currHash
                                $timeStr = (Get-Date).ToString("HH:mm:ss")
                                Write-Host "[$timeStr] ⚡ Detected live loads table in TAL One! Pushing to Shipping Wish..." -ForegroundColor Cyan

                                $postBody = @{ rawText = $textToPush } | ConvertTo-Json
                                $apiRes = Invoke-RestMethod -Uri "https://www.shippingwish.com/api/dispatch/sync-dat-bulk" -Method Post -Body $postBody -ContentType "application/json" -TimeoutSec 15

                                if ($apiRes.ok) {
                                    Write-Host "[$timeStr] ✅ AUTO-SYNC SUCCESS! Processed $($apiRes.total_received) loads:" -ForegroundColor Green
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
    } catch {
        # Loop safety
    }

    Start-Sleep -Seconds 5
}
