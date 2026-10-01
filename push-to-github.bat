@echo off
setlocal
echo ======================================================
echo   ShippingWish LLC - Push to GitHub ^& Deploy to Vercel
echo   Repository: https://github.com/shippingwishllc/shippingwish
echo ======================================================
echo.

set "PATH=%LOCALAPPDATA%\Programs\nodejs;%LOCALAPPDATA%\Programs\Git\cmd;%PATH%"
cd /d "%~dp0"

echo Checking local commit...
git log -n 1 --oneline
echo.
echo Pushing commit to origin/main...
git push origin main
echo.
if %errorlevel% equ 0 (
  echo ======================================================
  echo SUCCESS! Pushed to GitHub successfully!
  echo Vercel will now automatically build and deploy.
  echo ======================================================
) else (
  echo ======================================================
  echo Push failed or requires authentication.
  echo If a browser window opened, please authorize GitHub.
  echo ======================================================
)
echo.
pause
