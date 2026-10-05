<#
  Shipping Wish LLC - TAL One Live Auto-Sync Bridge Daemon
  Runs on any Windows PC where TAL One is open.
  Automatically detects loads copied from TAL One and syncs directly to shippingwish.com
#>

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   🚚 Shipping Wish LLC - TAL One Live Auto-Sync Bridge" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Status: BRIDGE IS ACTIVE & LISTENING 24/7" -ForegroundColor Green
Write-Host "Instructions: In TAL One, simply press Ctrl+A then Ctrl+C to copy your search results." -ForegroundColor Yellow
Write-Host "The bridge will automatically capture and push all loads to LoadsNexus in real-time!`n" -ForegroundColor Gray

Add-Type -AssemblyName System.Windows.Forms

$LastHash = ""

while ($true) {
    try {
        if ([System.Windows.Forms.Clipboard]::ContainsText()) {
            $clip = [System.Windows.Forms.Clipboard]::GetText()
            if ($clip -and $clip.Trim().Length -gt 15) {
                # Simple check if text resembles freight loads (has state codes or miles or rate or broker)
                if ($clip -match "(?i)(mi|miles|\$|van|reefer|flatbed|box|[A-Z]{2}\b)") {
                    $md5 = [System.Security.Cryptography.MD5]::Create()
                    $hashBytes = $md5.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($clip))
                    $currentHash = [BitConverter]::ToString($hashBytes)

                    if ($currentHash -ne $LastHash) {
                        $LastHash = $currentHash
                        $timestamp = (Get-Date).ToString("HH:mm:ss")
                        Write-Host "[$timestamp] ⚡ Detected loads in clipboard! Pushing to Shipping Wish..." -ForegroundColor Cyan

                        $body = @{ rawText = $clip } | ConvertTo-Json
                        $apiUrl = "https://www.shippingwish.com/api/dispatch/sync-dat-bulk"

                        try {
                            $response = Invoke-RestMethod -Uri $apiUrl -Method Post -Body $body -ContentType "application/json" -TimeoutSec 15
                            if ($response.ok) {
                                Write-Host "[$timestamp] ✅ SUCCESS! Processed $($response.total_received) loads:" -ForegroundColor Green
                                Write-Host "              • +$($response.inserted_count) new loads published to LoadsNexus" -ForegroundColor Green
                                Write-Host "              • $($response.matched_count) matched to your active fleet trucks" -ForegroundColor Green
                                Write-Host "              • Check your shippingwish.com browser tab to view them live!`n" -ForegroundColor Gray
                            } else {
                                Write-Host "[$timestamp] ⚠️ Server notice: $($response.error)`n" -ForegroundColor Yellow
                            }
                        } catch {
                            Write-Host "[$timestamp] ❌ Network/API Error: $($_.Exception.Message)`n" -ForegroundColor Red
                        }
                    }
                }
            }
        }
    } catch {
        # Silent loop guard
    }
    Start-Sleep -Milliseconds 1500
}
