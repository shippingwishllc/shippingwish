@echo off
setlocal enabledelayedexpansion
title Shipping Wish - Mobile Apps Suite Launcher
set "PATH=%LOCALAPPDATA%\Programs\nodejs;%LOCALAPPDATA%\Programs\Git\cmd;%PATH%"
cd /d "%~dp0"

:menu
cls
echo ======================================================
echo   Shipping Wish ^& LoadsNexus - Mobile Apps Suite
echo ======================================================
echo   1. Driver Console        (mobile/driver-app)
echo   2. LoadNexus Carrier     (mobile/loadnexus-carrier)
echo   3. Shipping Wish TMS     (mobile/shippingwish-tms)
echo   4. LoadNexus Broker      (mobile/loadnexus-broker)
echo   5. BuyWish Shop          (mobile/buywish-shop)
echo   6. Exit
echo ======================================================
set /p choice="Select an app to start (1-6): "

if "%choice%"=="1" (
  cd mobile\driver-app && npx expo start
)
if "%choice%"=="2" (
  cd mobile\loadnexus-carrier && npx expo start
)
if "%choice%"=="3" (
  cd mobile\shippingwish-tms && npx expo start
)
if "%choice%"=="4" (
  cd mobile\loadnexus-broker && npx expo start
)
if "%choice%"=="5" (
  cd mobile\buywish-shop && npx expo start
)
if "%choice%"=="6" exit /b 0
goto menu
