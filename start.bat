@echo off
echo ====================================
echo    HABER WEB UYGULAMASI BASLATILIYOR
echo ====================================
echo.

cd /d "%~dp0"

:: Node.js calistir
node app.js

pause
