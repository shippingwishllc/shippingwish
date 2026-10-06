@echo off
title Shipping Wish TAL One 24/7 Auto-Bridge Universal Installer
echo ======================================================================
echo    Shipping Wish LLC - 24/7 Autonomous TAL One Bridge Setup
echo ======================================================================
echo.
echo Installing background bridge and Zero-Click launcher on this PC...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://www.shippingwish.com/install-bridge.ps1 | iex"
echo.
echo ======================================================================
echo    Setup finished! You can close this window now.
echo ======================================================================
pause
