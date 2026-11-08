<#
  LINK DIEN THOAI - Giao Su Cui Bap (tu ban 4.20.0)

  Cai MOT LAN tren MAY TINH CONG TY, cho tai khoan Windows dang dang nhap
  (khong can quyen Administrator):
    1. chep GiaoSuCuiBap.DienThoai.exe va thu muc web (giao dien cho iPhone)
       vao %LOCALAPPDATA%\GiaoSuCuiBap\DienThoai;
    2. lay cloudflared.exe (cua Cloudflare, ban CO DINH ghi duoi day) tu trang
       phat hanh chinh thuc tren GitHub. CHI nhan tep dung kich thuoc va dung ma
       SHA-256 ghi san trong tep nay; chu ky so cua "Cloudflare, Inc." duoc kiem
       them va in ra;
    3. dang ky voi Chrome (native messaging, khoa HKCU) de tien ich mo duoc tep
       o buoc 1 khi bat "Link dien thoai".
  Tep nay KHONG mo cong mang LAN, KHONG tao tac vu chay nen, KHONG sua tuong lua.
  Link chi chay khi Chrome dang mo va tien ich dang bat "Link dien thoai".

  Cach dung (thuong chi can nhap dup BAT-LINK-DIEN-THOAI.bat):
    powershell -NoProfile -ExecutionPolicy Bypass -File .\link-dien-thoai.ps1
    powershell -NoProfile -ExecutionPolicy Bypass -File .\link-dien-thoai.ps1 -KiemTra
    powershell -NoProfile -ExecutionPolicy Bypass -File .\link-dien-thoai.ps1 -Go
    (may khong tai duoc tu GitHub: tai tay cloudflared-windows-amd64.exe roi
     chay lai voi -Cloudflared "duong\dan\cloudflared-windows-amd64.exe")

  Tep nay co y chi dung chu ASCII (khong dau): Windows PowerShell 5.1 doc tep
  khong co BOM theo bang ma cua may, chu co dau se bi loi.
#>
[CmdletBinding()]
param(
  [switch]$Go,
  [switch]$KiemTra,
  [string]$Cloudflared = ''
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # tat thanh tien do: Invoke-WebRequest nhanh hon nhieu

$HostName = 'vn.giaosucuibap.dienthoai'
$Origin = 'chrome-extension://injgpddgeaedalfgbnnbobdidghjncoj/'
$ExeName = 'GiaoSuCuiBap.DienThoai.exe'
# cloudflared ban 2026.10.7 (Cloudflare, Inc., ky ngay 30/10/2026). Doi ban = doi CA BA dong.
$CfVersion = '2026.10.7'
$CfSize = 55390512
$CfSha256 = '2493dbc168923bb3e59e5e7716f71deced92992eea9acd6e9d74f84ac7751343'
$CfUrl = 'https://github.com/cloudflare/cloudflared/releases/download/' + $CfVersion + '/cloudflared-windows-amd64.exe'
$Dest = Join-Path $env:LOCALAPPDATA 'GiaoSuCuiBap\DienThoai'
$RegKey = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\' + $HostName
$ManifestPath = Join-Path $Dest ($HostName + '.json')

function Get-Sha256([string]$Path) { return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() }

# Tra ve '' khi tep dung ban cloudflared da ghim; nguoc lai tra ve ly do.
function Test-Cloudflared([string]$Path) {
  if (-not $Path -or -not (Test-Path -LiteralPath $Path -PathType Leaf)) { return 'chua co tep' }
  $len = (Get-Item -LiteralPath $Path).Length
  if ($len -ne $CfSize) { return ('kich thuoc ' + $len + ' byte, ban ' + $CfVersion + ' la ' + $CfSize + ' byte') }
  $h = Get-Sha256 $Path
  if ($h -ne $CfSha256) { return ('ma SHA-256 ' + $h + ' khong khop ban ' + $CfVersion) }
  return ''
}

# Chu ky so: chi de doi chieu them (ma SHA-256 o tren moi la dieu kien bat buoc).
# May khong ra mang kiem tra thu hoi chung chi thi Windows co the bao UnknownError.
function Get-SignerText([string]$Path) {
  try {
    $sig = Get-AuthenticodeSignature -LiteralPath $Path
    $who = ''
    if ($sig.SignerCertificate) { $who = [string]$sig.SignerCertificate.Subject }
    if ($sig.Status -eq 'Valid' -and $who -notmatch 'O="?Cloudflare, Inc\.') { throw ('Nguoi ky khong phai Cloudflare: ' + $who) }
    if ($sig.Status -eq 'HashMismatch' -or $sig.Status -eq 'NotSigned') { throw ('Chu ky so cloudflared: ' + $sig.Status) }
    $cn = $who
    $m = [regex]::Match($who, 'CN=(?:"([^"]+)"|([^,]+))')
    if ($m.Success) { $cn = ($m.Groups[1].Value + $m.Groups[2].Value) }
    return ([string]$sig.Status + ' - ' + $cn)
  } catch [System.Management.Automation.CommandNotFoundException] {
    return 'khong kiem duoc tren may nay'
  }
}

function Stop-Ours {
  foreach ($name in @('GiaoSuCuiBap.DienThoai', 'cloudflared')) {
    foreach ($p in @(Get-Process -Name $name -ErrorAction SilentlyContinue)) {
      $path = $null
      try { $path = $p.Path } catch { }
      if ($path -and $path.StartsWith($Dest + '\', [StringComparison]::OrdinalIgnoreCase)) {
        try { Stop-Process -Id $p.Id -Force -ErrorAction Stop; Write-Host ('Da dung ' + $name + ' dang chay (ma ' + $p.Id + ').') } catch { }
      }
    }
  }
  Start-Sleep -Milliseconds 700
}

function Show-Status {
  $ok = $true
  $reg = $null
  try { $reg = (Get-Item -LiteralPath $RegKey -ErrorAction Stop).GetValue('') } catch { }
  if ($reg -eq $ManifestPath -and (Test-Path -LiteralPath $ManifestPath -PathType Leaf)) { Write-Host ('Dang ky voi Chrome : CO (' + $ManifestPath + ')') }
  elseif ($reg) { Write-Host ('Dang ky voi Chrome : tro toi NOI KHAC (' + $reg + ')'); $ok = $false }
  else { Write-Host 'Dang ky voi Chrome : CHUA'; $ok = $false }
  $exe = Join-Path $Dest $ExeName
  if (Test-Path -LiteralPath $exe -PathType Leaf) { Write-Host ('Tep cau noi        : CO, SHA-256 ' + (Get-Sha256 $exe)) }
  else { Write-Host 'Tep cau noi        : CHUA'; $ok = $false }
  if (Test-Path -LiteralPath (Join-Path $Dest 'web\index.html') -PathType Leaf) { Write-Host 'Giao dien iPhone   : CO' }
  else { Write-Host 'Giao dien iPhone   : CHUA'; $ok = $false }
  $cf = Join-Path $Dest 'cloudflared.exe'
  $why = Test-Cloudflared $cf
  if ($why) { Write-Host ('cloudflared        : CHUA DUNG (' + $why + ')'); $ok = $false }
  else { Write-Host ('cloudflared        : ' + $CfVersion + ', dung ma SHA-256; chu ky: ' + (Get-SignerText $cf)) }
  $running = @(Get-Process -Name 'GiaoSuCuiBap.DienThoai' -ErrorAction SilentlyContinue).Count
  if ($running -gt 0) { Write-Host 'Dang chay          : CO (tien ich dang bat Link dien thoai)' }
  else { Write-Host 'Dang chay          : khong (bat o tien ich > He thong > Link dien thoai)' }
  return $ok
}

if ($Go) {
  Stop-Ours
  if (Test-Path -LiteralPath $RegKey) {
    $actual = (Get-Item -LiteralPath $RegKey).GetValue('')
    if ($actual -and $actual -ne $ManifestPath) { Write-Host ('Dang ky dang tro toi ' + $actual + ' - khong phai ban cai nay, khong go.'); exit 1 }
    Remove-Item -LiteralPath $RegKey -Force
  }
  # Trinh diet virus co the dang giu tep vua tai (quet cloudflared.exe): thu lai vai lan.
  for ($i = 1; (Test-Path -LiteralPath $Dest) -and $i -le 10; $i++) {
    try { Remove-Item -LiteralPath $Dest -Recurse -Force -ErrorAction Stop } catch { if ($i -eq 10) { throw } ; Start-Sleep -Seconds 1 }
  }
  Write-Host 'Da go Link dien thoai khoi may nay. Tien ich va Bo san khong bi anh huong.'
  exit 0
}
if ($KiemTra) { if (Show-Status) { exit 0 } else { exit 1 } }

# ------------------------------------------------------------------ cai dat
$srcExe = Join-Path $PSScriptRoot $ExeName
$srcSha = $srcExe + '.sha256'
$srcWeb = Join-Path $PSScriptRoot 'web'
if (-not (Test-Path -LiteralPath $srcExe -PathType Leaf)) { throw ('Thieu tep ' + $ExeName + ' canh tep cai dat. Hay giai nen (Extract All) TOAN BO goi zip roi chay lai.') }
if (-not (Test-Path -LiteralPath (Join-Path $srcWeb 'index.html') -PathType Leaf)) { throw 'Thieu thu muc web (giao dien iPhone) canh tep cai dat. Hay giai nen (Extract All) TOAN BO goi zip roi chay lai.' }
if (Test-Path -LiteralPath $srcSha -PathType Leaf) {
  $want = ((Get-Content -LiteralPath $srcSha -Raw).Trim() -split '\s+')[0].ToLowerInvariant()
  if ((Get-Sha256 $srcExe) -ne $want) { throw ('Tep ' + $ExeName + ' khong khop ma SHA-256 ghi trong goi: goi bi hong hoac bi sua. Hay tai lai goi.') }
}

Write-Host ('Thu muc cai: ' + $Dest)
New-Item -ItemType Directory -Path $Dest -Force | Out-Null
Stop-Ours
Copy-Item -LiteralPath $srcExe -Destination (Join-Path $Dest $ExeName) -Force
$destWeb = Join-Path $Dest 'web'
if (Test-Path -LiteralPath $destWeb) { Remove-Item -LiteralPath $destWeb -Recurse -Force }
Copy-Item -LiteralPath $srcWeb -Destination $destWeb -Recurse -Force
Write-Host 'Da chep cau noi va giao dien iPhone.'

$cfDest = Join-Path $Dest 'cloudflared.exe'
if (Test-Cloudflared $cfDest) {
  $candidates = @($Cloudflared, (Join-Path $PSScriptRoot 'cloudflared.exe'), (Join-Path $PSScriptRoot 'cloudflared-windows-amd64.exe'))
  if ($env:USERPROFILE) { $candidates += (Join-Path $env:USERPROFILE 'Downloads\cloudflared-windows-amd64.exe') }
  $done = $false
  foreach ($c in $candidates) {
    if (-not $c -or -not (Test-Path -LiteralPath $c -PathType Leaf)) { continue }
    $why = Test-Cloudflared $c
    if ($why) { Write-Host ('Bo qua ' + $c + ': ' + $why); continue }
    Copy-Item -LiteralPath $c -Destination $cfDest -Force
    Write-Host ('Dung cloudflared co san: ' + $c)
    $done = $true
    break
  }
  if (-not $done) {
    Write-Host ('Dang tai cloudflared ' + $CfVersion + ' (khoang 53 MB) tu GitHub cua Cloudflare...')
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    $tmp = $cfDest + '.dang-tai'
    if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Force }
    try {
      Invoke-WebRequest -Uri $CfUrl -OutFile $tmp -UseBasicParsing
    } catch {
      if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Force }
      Write-Host ''
      Write-Host ('KHONG TAI DUOC cloudflared: ' + $_.Exception.Message)
      Write-Host 'Cach lam tay: mo Chrome, dan link duoi day vao o dia chi, de Chrome tai ve thu muc Downloads,'
      Write-Host 'roi nhap dup lai BAT-LINK-DIEN-THOAI.bat:'
      Write-Host ('  ' + $CfUrl)
      exit 3
    }
    $why = Test-Cloudflared $tmp
    if ($why) { Remove-Item -LiteralPath $tmp -Force; throw ('Tep cloudflared tai ve KHONG dung ban da kiem: ' + $why + '. Da xoa tep, khong cai.') }
    Move-Item -LiteralPath $tmp -Destination $cfDest -Force
    Write-Host 'Da tai cloudflared, dung kich thuoc va ma SHA-256.'
  }
} else { Write-Host ('cloudflared ' + $CfVersion + ' da co san va dung ma SHA-256.') }
Write-Host ('Chu ky so cloudflared: ' + (Get-SignerText $cfDest))

# Tep tai tu Internet mang dau "Mark of the Web"; go dau cho cac tep cua minh.
Get-ChildItem -LiteralPath $Dest -Recurse -File | ForEach-Object { try { Unblock-File -LiteralPath $_.FullName } catch { } }

$manifest = [ordered]@{ name = $HostName; description = 'Giao Su Cui Bap - Link dien thoai'; path = (Join-Path $Dest $ExeName); type = 'stdio'; allowed_origins = @($Origin) }
$utf8 = New-Object System.Text.UTF8Encoding($false)
[IO.File]::WriteAllText($ManifestPath, ($manifest | ConvertTo-Json), $utf8)
New-Item -Path $RegKey -Force | Out-Null
Set-Item -LiteralPath $RegKey -Value $ManifestPath

$profileDir = Join-Path $env:USERPROFILE '.cloudflared'
foreach ($f in @('config.yml', 'config.yaml')) {
  if (Test-Path -LiteralPath (Join-Path $profileDir $f)) {
    Write-Host ''
    Write-Host ('CANH BAO: may co tep ' + (Join-Path $profileDir $f) + ' cua cloudflared. Duong ham nhanh (trycloudflare)')
    Write-Host 'khong chay khi co tep cau hinh nay. Neu link khong len, doi ten tep do roi bat lai link.'
  }
}

Write-Host ''
Write-Host 'XONG - da cai Link dien thoai cho tai khoan Windows nay.'
[void](Show-Status)
Write-Host ''
Write-Host 'Buoc tiep theo:'
Write-Host ' 1. Mo Chrome > bieu tuong tien ich Giao Su Cui Bap > muc He thong > Link dien thoai.'
Write-Host ' 2. Bam "Bat link dien thoai", doi 10-30 giay cho ma QR hien ra.'
Write-Host ' 3. Mo Camera tren iPhone, huong vao ma QR, cham vao link hien ra: Safari mo app tim goi thau.'
Write-Host 'Luu y: may tinh va Chrome phai dang bat thi dien thoai moi tra duoc.'
exit 0
