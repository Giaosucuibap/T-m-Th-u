@echo off
REM Bam dup de build TA_Estimate.xlam (can Excel desktop tren Windows).
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\build_addin.ps1"
echo.
echo Neu thanh cong: file dist\TA_Estimate.xlam da duoc tao.
pause
