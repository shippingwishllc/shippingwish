@echo off
setlocal enabledelayedexpansion
title Shipping Wish Portfolio - 4 Mobile Apps Expo Go Launcher
color 0A
set "PATH=C:\Users\HCT\AppData\Local\Programs\nodejs22;C:\Users\HCT\.gemini\antigravity\bin\mingit\cmd;%LOCALAPPDATA%\Programs\nodejs;%PATH%"
cd /d "%~dp0"

:: Detect Wi-Fi IP so Expo binds to the same Wi-Fi as iPhone/Android
for /f "tokens=*" %%i in ('powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias 'Wi-Fi*' -ErrorAction SilentlyContinue).IPAddress"') do set "WIFI_IP=%%i"
if "%WIFI_IP%"=="" set "WIFI_IP=192.168.1.54"
set "REACT_NATIVE_PACKAGER_HOSTNAME=%WIFI_IP%"

:menu
cls
echo ============================================================
echo   Shipping Wish Portfolio - 4 Mobile Apps (Expo Go Suite)
echo   Detected Wi-Fi IP: %WIFI_IP%
echo ============================================================
echo   [1] First:  Shipping Wish    (Trucking, Drivers ^& TMS)
echo   [2] Second: Loads Nexus      (50-State Load Board)
echo   [3] Third:  Buy Wish Online  (E-Commerce Store)
echo   [4] Fourth: NYC Limo Wish    (Luxury Chauffeur ^& Limo)
echo   [5] Exit
echo ============================================================
echo.
set /p choice="Konsi app scan karni hai? (1-5 likh kar Enter dabayein): "

if "%choice%"=="1" (
  set "APP_DIR=mobile\shippingwish-app"
  set "APP_NAME=1. Shipping Wish (Trucking ^& Drivers)"
  goto mode_select
)
if "%choice%"=="2" (
  set "APP_DIR=mobile\loadsnexus-app"
  set "APP_NAME=2. Loads Nexus (Load Board)"
  goto mode_select
)
if "%choice%"=="3" (
  set "APP_DIR=mobile\buywish-shop"
  set "APP_NAME=3. Buy Wish Online (E-Commerce)"
  goto mode_select
)
if "%choice%"=="4" (
  set "APP_DIR=mobile\nyclimo-app"
  set "APP_NAME=4. NYC Limo Wish (Limo)"
  goto mode_select
)
if "%choice%"=="5" exit /b 0
goto menu

:mode_select
echo.
echo Cleaning up old processes on Port 8081 / 8082...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8081 "') do (
  taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8082 "') do (
  taskkill /F /PID %%a >nul 2>&1
)

echo.
echo ============================================================
echo   Selected: !APP_NAME!
echo ============================================================
echo   [1] Fast LAN Mode (RECOMMENDED - Same Wi-Fi %WIFI_IP%)
echo       ^> Press Enter ya 1 dabayein
echo.
echo   [2] Tunnel Mode (Ngrok Cloud)
echo       ^> Agar mobile doosre internet par ho
echo ============================================================
set "mode="
set /p mode="Enter 1 ya 2 (Press Enter for Fast LAN Mode): "

cd /d "%~dp0!APP_DIR!"
if "!mode!"=="2" (
  echo.
  echo [TUNNEL MODE] Starting !APP_NAME! via Ngrok Tunnel...
  call "D:\Shipping Wish\mobile\node_modules\.bin\expo.cmd" start --tunnel --port 8081
) else (
  echo.
  echo [LAN MODE] Starting !APP_NAME! on exp://%WIFI_IP%:8081 ...
  echo Apne mobile me Expo Go / Camera se QR Code scan karein!
  echo.
  call "D:\Shipping Wish\mobile\node_modules\.bin\expo.cmd" start --lan --port 8081
)
pause
goto menu
