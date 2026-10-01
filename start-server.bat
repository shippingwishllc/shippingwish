@echo off
setlocal
title Shipping Wish - Enterprise TMS Server
echo ======================================================
echo   Shipping Wish LLC - Enterprise Dispatch ^& TMS
echo   Base URL: http://localhost:3000
echo ======================================================
echo.

set "PATH=%LOCALAPPDATA%\Programs\nodejs;%LOCALAPPDATA%\Programs\Git\cmd;%PATH%"
cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo [ERROR] Node.js is not found in PATH or %LOCALAPPDATA%\Programs\nodejs.
  pause
  exit /b 1
)

echo Starting server on http://localhost:3000 ...
node server.js
pause
