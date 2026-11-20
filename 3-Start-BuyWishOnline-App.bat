@echo off
title 3. Buy Wish Online (E-Commerce) - Port 8083
color 0E
set "PATH=C:\Users\HCT\AppData\Local\Programs\nodejs22;C:\Users\HCT\.gemini\antigravity\bin\mingit\cmd;%PATH%"

echo ========================================================
echo   3. Buy Wish Online (E-Commerce Store) - Port 8083
echo ========================================================
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8083 "') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=*" %%i in ('powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias 'Wi-Fi*' -ErrorAction SilentlyContinue).IPAddress"') do set "WIFI_IP=%%i"
if "%WIFI_IP%"=="" set "WIFI_IP=192.168.1.54"
set "REACT_NATIVE_PACKAGER_HOSTNAME=%WIFI_IP%"

cd /d "D:\Shipping Wish\mobile\buywish-shop"
echo Detected Wi-Fi IP: %WIFI_IP%  (exp://%WIFI_IP%:8083)
echo.
echo [1] Fast LAN Mode (Press Enter)   [2] Tunnel Mode (Ngrok)
set /p choice="Select 1 or 2 (Default 1): "
if "%choice%"=="2" (
  call "D:\Shipping Wish\mobile\node_modules\.bin\expo.cmd" start --tunnel --port 8083
) else (
  call "D:\Shipping Wish\mobile\node_modules\.bin\expo.cmd" start --lan --port 8083
)
pause
