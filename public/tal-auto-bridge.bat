@echo off
title Shipping Wish - TAL One 100% Zero-Click Auto-Bridge
echo ==============================================================
echo    Starting Shipping Wish TAL One Zero-Click Auto-Bridge...
echo ==============================================================
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://www.shippingwish.com/tal-auto-bridge.ps1 | iex"
pause
