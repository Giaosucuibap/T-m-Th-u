<#
  TRAM SAN - Giao Su Cui Bap (tu ban 4.19.0)

  Tao MOT tac vu Windows Task Scheduler cho tai khoan dang dang nhap:
    - khi dang nhap Windows: mo Chrome CHAY NEN (--no-startup-window), khong bat cua so;
    - moi ngay, som hon moi gio san vai phut: DANH THUC may neu dang Ngu (Sleep)
      va mo Chrome chay nen.
  Bo san van do tien ich chay theo lich cua no; tac vu nay chi bao dam Chrome dang chay.
  Chrome dang chay roi thi lenh mo them khong lam gi.

  Can bat "Cho Chrome chay nen" o trang Bo san cua tien ich truoc; neu khong,
  Chrome mo khong cua so se tu dong lai ngay.

  Cach dung (thuong chi can nhap dup BAT-TRAM-SAN.bat):
    powershell -NoProfile -ExecutionPolicy Bypass -File .\tram-san.ps1 -Gio "06:05,13:05"
    powershell -NoProfile -ExecutionPolicy Bypass -File .\tram-san.ps1 -KiemTra
    powershell -NoProfile -ExecutionPolicy Bypass -File .\tram-san.ps1 -Go

  Tep nay co y chi dung chu ASCII (khong dau): Windows PowerShell 5.1 doc tep
  khong co BOM theo bang ma cua may, chu co dau se bi loi.
#>
[CmdletBinding()]
param(
  [string]$Gio = '',
  [switch]$Go,
  [switch]$KiemTra,
  [string]$ChromePath = '',
  [string]$ChromeProfile = '',
  [ValidateRange(0, 30)][int]$SomPhut = 3,
  [string]$TenTacVu = 'GiaoSuCuiBap - Tram san'
)
$ErrorActionPreference = 'Stop'

if ($TenTacVu -notmatch '^[A-Za-z0-9 _.-]{3,80}$') { throw 'Ten tac vu khong hop le.' }

function Esc([string]$s) { return [System.Security.SecurityElement]::Escape($s) }

function Find-Chrome([string]$Hint) {
  if ($Hint) {
    if ($Hint.Contains('"')) { throw 'Duong dan Chrome khong duoc chua dau ngoac kep.' }
    if (Test-Path -LiteralPath $Hint -PathType Leaf) { return (Resolve-Path -LiteralPath $Hint).Path }
    throw ('Khong thay Chrome tai: ' + $Hint)
  }
  $keys = @(
    'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe',
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe',
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe'
  )
  foreach ($k in $keys) {
    try {
      $v = (Get-Item -LiteralPath $k -ErrorAction Stop).GetValue('')
      if ($v -and (Test-Path -LiteralPath $v -PathType Leaf)) { return [string]$v }
    } catch { }
  }
  $candidates = @()
  if ($env:ProgramFiles) { $candidates += (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe') }
  if (${env:ProgramFiles(x86)}) { $candidates += (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe') }
  if ($env:LOCALAPPDATA) { $candidates += (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe') }
  foreach ($c in $candidates) { if (Test-Path -LiteralPath $c -PathType Leaf) { return $c } }
  throw 'Khong tim thay Google Chrome tren may. Chay lai voi -ChromePath "duong\dan\chrome.exe".'
}

# "06:05,13:05" -> gio danh thuc (som hon $Lead phut), khong trung, sap xep.
function Get-WakeTimes([string]$Text, [int]$Lead) {
  $items = @($Text -split '[,;\s]+' | Where-Object { $_ -ne '' })
  if ($items.Count -eq 0) { throw 'Chua nhap gio san. Vi du: 06:05,13:05' }
  if ($items.Count -gt 8) { throw 'Toi da 8 gio san.' }
  $out = New-Object System.Collections.Generic.List[string]
  foreach ($it in $items) {
    $m = [regex]::Match($it, '^([01]?\d|2[0-3]):([0-5]\d)$')
    if (-not $m.Success) { throw ("Gio khong hop le: '" + $it + "'. Dung dang 06:05") }
    $mins = [int]$m.Groups[1].Value * 60 + [int]$m.Groups[2].Value - $Lead
    if ($mins -lt 0) { $mins += 1440 }
    $hhmm = '{0:D2}:{1:D2}' -f [int][math]::Floor($mins / 60), [int]($mins % 60)
    if (-not $out.Contains($hhmm)) { $out.Add($hhmm) }
  }
  return ,([string[]]($out | Sort-Object))
}

function New-TaskXml([string[]]$WakeTimes, [string]$Chrome, [string]$ProfileDir, [string]$UserId) {
  $today = (Get-Date).ToString('yyyy-MM-dd')
  $sb = New-Object System.Text.StringBuilder
  [void]$sb.AppendLine('    <LogonTrigger><Enabled>true</Enabled><UserId>' + (Esc $UserId) + '</UserId><Delay>PT1M</Delay></LogonTrigger>')
  foreach ($t in $WakeTimes) {
    [void]$sb.AppendLine('    <CalendarTrigger><StartBoundary>' + $today + 'T' + $t + ':00</StartBoundary><Enabled>true</Enabled><ScheduleByDay><DaysInterval>1</DaysInterval></ScheduleByDay></CalendarTrigger>')
  }
  $chromeArgs = '--no-startup-window'
  if ($ProfileDir) { $chromeArgs = '--profile-directory="' + $ProfileDir + '" ' + $chromeArgs }
  # Mo Chrome qua "cmd /c start" de tac vu ket thuc ngay: neu tac vu giu chinh
  # tien trinh Chrome, Task Scheduler co the dung (giet) Chrome khi het gio cho phep.
  $cmdArgs = '/c start "" "' + $Chrome + '" ' + $chromeArgs
  $cmdExe = Join-Path $env:SystemRoot 'System32\cmd.exe'
  return @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Author>$(Esc $UserId)</Author>
    <Description>Giao Su Cui Bap - Tram san: mo Chrome chay nen khi dang nhap va danh thuc may truoc gio san.</Description>
  </RegistrationInfo>
  <Triggers>
$($sb.ToString().TrimEnd())
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>$(Esc $UserId)</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>true</WakeToRun>
    <ExecutionTimeLimit>PT5M</ExecutionTimeLimit>
    <Priority>7</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>$(Esc $cmdExe)</Command>
      <Arguments>$(Esc $cmdArgs)</Arguments>
    </Exec>
  </Actions>
</Task>
"@
}

function Show-Status {
  $task = Get-ScheduledTask -TaskName $TenTacVu -ErrorAction SilentlyContinue
  if (-not $task) { Write-Host 'Chua cai tram san tren may nay.'; return $false }
  $info = Get-ScheduledTaskInfo -TaskName $TenTacVu
  $times = @($task.Triggers | Where-Object { $_.StartBoundary } | ForEach-Object { ([datetime]$_.StartBoundary).ToString('HH:mm') })
  Write-Host ('Tac vu            : ' + $TenTacVu + ' (' + $task.State + ')')
  Write-Host ('Mo Chrome chay nen: khi dang nhap Windows')
  Write-Host ('Danh thuc may luc : ' + ($times -join ', ') + ' moi ngay (WakeToRun=' + $task.Settings.WakeToRun + ')')
  Write-Host ('Lan chay toi      : ' + $info.NextRunTime)
  return $true
}

if ($Go) {
  if (Get-ScheduledTask -TaskName $TenTacVu -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TenTacVu -Confirm:$false
    Write-Host 'Da go tram san. Bo san trong tien ich van chay khi Chrome dang mo.'
  } else { Write-Host 'Chua cai tram san; khong co gi de go.' }
  exit 0
}
if ($KiemTra) { [void](Show-Status); exit 0 }

if (-not $Gio) {
  Write-Host 'Mo tien ich > Bo san > muc "Tram san" de xem dong gio san (vi du 06:05,13:05).'
  $Gio = Read-Host 'Nhap gio san roi nhan Enter'
}
if ($ChromeProfile -and $ChromeProfile -notmatch '^[A-Za-z0-9 _-]{1,40}$') { throw 'Ten ho so Chrome khong hop le (vi du: Default, Profile 1).' }
$wake = Get-WakeTimes $Gio $SomPhut
$chrome = Find-Chrome $ChromePath
$user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$xml = New-TaskXml $wake $chrome $ChromeProfile $user
Register-ScheduledTask -TaskName $TenTacVu -Xml $xml -Force | Out-Null
Write-Host ''
Write-Host 'DA CAI TRAM SAN.'
[void](Show-Status)
Write-Host ''
Write-Host 'Luu y:'
Write-Host ' - Trong tien ich, trang Bo san > Tram san: bam "Bat chay nen" neu chua bat.'
Write-Host ' - May TAT HAN (Shut down) thi khong danh thuc duoc; chi chay bu khi bat lai.'
Write-Host ' - Laptop: Power Options > Sleep > Allow wake timers phai la Enable.'
Write-Host ' - Doi gio san trong tien ich thi chay lai tep nay.'
exit 0
