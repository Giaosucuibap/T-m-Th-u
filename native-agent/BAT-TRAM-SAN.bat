@echo off
setlocal
cd /d "%~dp0"
echo ============================================================
echo   TRAM SAN - Giao Su Cui Bap
echo   Tu mo Chrome chay nen khi dang nhap Windows va danh thuc
echo   may (neu dang Ngu) truoc moi gio san 3 phut.
echo ============================================================
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tram-san.ps1"
echo.
pause
