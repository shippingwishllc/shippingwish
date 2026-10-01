@echo off
setlocal
echo ======================================================
echo   ShippingWish LLC - GitHub Sync Tool
echo   Repository: https://github.com/shippingwishllc/shippingwish
echo ======================================================
echo.

set "PATH=%LOCALAPPDATA%\Programs\nodejs;%LOCALAPPDATA%\Programs\Git\cmd;%PATH%"
cd /d "%~dp0"

echo Checking Git remote...
git remote -v
echo.
echo Pulling latest changes from origin/main...
git pull origin main
echo.
echo ======================================================
echo Current Commit:
git log -n 1 --oneline
echo ======================================================
echo.
echo Done! Your local repository is up to date with GitHub.
pause
