@echo off
setlocal
cd /d "%~dp0"
echo ============================================================
echo   LINK DIEN THOAI - Giao Su Cui Bap
echo   Cai mot lan: may tinh cong ty lam may tra e-GP cho iPhone.
echo   Khong can quyen Administrator.
echo ============================================================
echo.
if not exist "%~dp0link-dien-thoai.ps1" (
  echo KHONG THAY tep link-dien-thoai.ps1 canh tep nay.
  echo Hay giai nen ^(Extract All^) TOAN BO goi zip truoc, roi nhap dup
  echo tep BAT-LINK-DIEN-THOAI.bat trong thu muc da giai nen.
  echo.
  pause
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0link-dien-thoai.ps1" %*
echo.
pause
