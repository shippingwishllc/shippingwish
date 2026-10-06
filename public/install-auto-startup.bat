@echo off
title Install Shipping Wish TAL One Bridge to Windows Startup
echo ======================================================================
echo    Shipping Wish LLC - 24/7 TAL One Autonomous Background Service
echo ======================================================================
echo.
echo Installing silent background bridge into Windows Startup...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$sh = New-Object -ComObject WScript.Shell; $startup = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup'; $lnk = $sh.CreateShortcut((Join-Path $startup 'ShippingWish-TAL-Bridge.lnk')); $lnk.TargetPath = 'wscript.exe'; $lnk.Arguments = '\"d:\shippingwish\public\tal-auto-bridge-silent.vbs\"'; $lnk.WindowStyle = 7; $lnk.Description = 'Shipping Wish TAL Bridge 24/7 Silent Daemon'; $lnk.Save(); Write-Host 'SUCCESS: The bridge will now start automatically whenever Windows boots!' -ForegroundColor Green"
echo.
echo Launching background service now...
wscript.exe "d:\shippingwish\public\tal-auto-bridge-silent.vbs"
echo Bridge is now running silently in the background!
pause
