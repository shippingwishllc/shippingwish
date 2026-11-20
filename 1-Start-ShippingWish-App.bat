@echo off
title 1. Shipping Wish (Trucking & Drivers) - Port 8081
color 0A
set "PATH=C:\Users\HCT\AppData\Local\Programs\nodejs22;C:\Users\HCT\.gemini\antigravity\bin\mingit\cmd;%PATH%"

echo ========================================================
echo   1. Shipping Wish (Trucking, Drivers ^& TMS) - Port 8081
echo ========================================================
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8081 "') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=*" %%i in ('powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias 'Wi-Fi*' -ErrorAction SilentlyContinue).IPAddress"') do set "WIFI_IP=%%i"
if "%WIFI_IP%"=="" set "WIFI_IP=192.168.1.54"
set "REACT_NATIVE_PACKAGER_HOSTNAME=%WIFI_IP%"

cd /d "D:\Shipping Wish\mobile\shippingwish-app"
echo Detected Wi-Fi IP: %WIFI_IP%  (exp://%WIFI_IP%:8081)
echo.
echo [1] Fast LAN Mode (Press Enter)   [2] Tunnel Mode (Ngrok)
set /p choice="Select 1 or 2 (Default 1): "
if "%choice%"=="2" (
  call "D:\Shipping Wish\mobile\node_modules\.bin\expo.cmd" start --tunnel --port 8081
) else (
  call "D:\Shipping Wish\mobile\node_modules\.bin\expo.cmd" start --lan --port 8081
)
pause
