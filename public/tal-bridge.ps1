<#
  Shipping Wish LLC - TAL One Live Auto-Sync Bridge Daemon
  Runs on any Windows PC where TAL One is open.
  Automatically detects loads copied from TAL One and syncs directly to shippingwish.com
#>

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Clear-Host

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   🚚 Shipping Wish LLC - TAL One Live Auto-Sync Bridge" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "[STATUS] Bridge is ACTIVE & WAITING FOR FRESH LOADS!" -ForegroundColor Green
Write-Host ""
Write-Host "👉 HOW TO USE:" -ForegroundColor Yellow
Write-Host "   1. Switch to your TAL One software window." -ForegroundColor White
Write-Host "   2. Click on the loads search table, press Ctrl+A (Select All), then Ctrl+C (Copy)." -ForegroundColor White
Write-Host "   3. This bridge will immediately detect it and push all 200+ loads to shippingwish.com!" -ForegroundColor White
Write-Host "==========================================================`n" -ForegroundColor Cyan

Add-Type -AssemblyName System.Windows.Forms

# Ignore whatever was in clipboard before starting the bridge
$LastHash = ""
try {
    if ([System.Windows.Forms.Clipboard]::ContainsText()) {
        $initialText = [System.Windows.Forms.Clipboard]::GetText()
        if ($initialText) {
            $md5 = [System.Security.Cryptography.MD5]::Create()
            $hashBytes = $md5.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($initialText))
            $LastHash = [BitConverter]::ToString($hashBytes)
        }
    }
} catch {}

Write-Host "Listening for your next Ctrl+C in TAL One... (Press Ctrl+C here in terminal to exit)`n" -ForegroundColor Gray

while ($true) {
    try {
        if ([System.Windows.Forms.Clipboard]::ContainsText()) {
            $clip = [System.Windows.Forms.Clipboard]::GetText()
            if ($clip -and $clip.Trim().Length -gt 15) {
                $md5 = [System.Security.Cryptography.MD5]::Create()
                $hashBytes = $md5.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($clip))
                $currentHash = [BitConverter]::ToString($hashBytes)

                if ($currentHash -ne $LastHash) {
                    $LastHash = $currentHash
                    $timestamp = (Get-Date).ToString("HH:mm:ss")
                    $len = $clip.Trim().Length
                    Write-Host "[$timestamp] ⚡ Detected fresh copied data ($len characters)! Pushing to Shipping Wish..." -ForegroundColor Cyan

                    $body = @{ rawText = $clip } | ConvertTo-Json
                    $apiUrl = "https://www.shippingwish.com/api/dispatch/sync-dat-bulk"

                    try {
                        $webClient = New-Object System.Net.WebClient
                        $webClient.Headers.Add("Content-Type", "application/json; charset=utf-8")
                        $responseJson = $webClient.UploadString($apiUrl, "POST", $body)
                        $response = $responseJson | ConvertFrom-Json

                        if ($response.ok) {
                            Write-Host "[$timestamp] ✅ SUCCESS! Processed $($response.total_received) loads:" -ForegroundColor Green
                            Write-Host "              • +$($response.inserted_count) new loads published to LoadsNexus" -ForegroundColor Green
                            Write-Host "              • $($response.matched_count) loads matched to fleet trucks" -ForegroundColor Green
                            Write-Host "              • Check your shippingwish.com tab - they are live right now!`n" -ForegroundColor Gray
                        } else {
                            Write-Host "[$timestamp] ⚠️ Notice: $($response.error)`n" -ForegroundColor Yellow
                        }
                    } catch [System.Net.WebException] {
                        $errStream = $_.Exception.Response.GetResponseStream()
                        $reader = New-Object System.IO.StreamReader($errStream)
                        $errBody = $reader.ReadToEnd()
                        try {
                            $errJson = $errBody | ConvertFrom-Json
                            Write-Host "[$timestamp] ⚠️ Server: $($errJson.error)`n" -ForegroundColor Yellow
                        } catch {
                            Write-Host "[$timestamp] ⚠️ Server: $errBody`n" -ForegroundColor Yellow
                        }
                    } catch {
                        Write-Host "[$timestamp] ❌ Error: $($_.Exception.Message)`n" -ForegroundColor Red
                    }
                }
            }
        }
    } catch {
        # Loop protection
    }
    Start-Sleep -Milliseconds 1200
}
