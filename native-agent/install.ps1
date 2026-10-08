param([string]$DownloadDirectory = (Join-Path $env:USERPROFILE 'Downloads\GiaoSuCuiBap\HoSo'))
$ErrorActionPreference = 'Stop'
$hostName = 'vn.giaosucuibap.hsmt'
$destination = Join-Path $env:LOCALAPPDATA 'GiaoSuCuiBap\NativeHost'
$exeSource = Join-Path $PSScriptRoot 'GiaoSuCuiBap.NativeHost.exe'
if (-not (Test-Path -LiteralPath $exeSource -PathType Leaf)) { throw 'Missing native host binary.' }
$downloadPath = [IO.Path]::GetFullPath($DownloadDirectory)
if ($downloadPath -notmatch '^[A-Za-z]:\\' -or $downloadPath.Length -le 3) { throw 'Choose a local download folder below a drive root.' }
New-Item -ItemType Directory -Path $destination -Force | Out-Null
Copy-Item -LiteralPath $exeSource -Destination (Join-Path $destination 'GiaoSuCuiBap.NativeHost.exe') -Force
$utf8 = New-Object System.Text.UTF8Encoding($false)
[IO.File]::WriteAllText((Join-Path $destination 'settings.json'), (@{downloadDirectory=$downloadPath} | ConvertTo-Json), $utf8)
$manifestPath = Join-Path $destination 'vn.giaosucuibap.hsmt.json'
$manifest = @{name=$hostName; description='Giao Su Cui Bap E-HSMT bridge'; path=(Join-Path $destination 'GiaoSuCuiBap.NativeHost.exe'); type='stdio'; allowed_origins=@('chrome-extension://injgpddgeaedalfgbnnbobdidghjncoj/')}
[IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json), $utf8)
$key = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\' + $hostName
New-Item -Path $key -Force | Out-Null
Set-Item -LiteralPath $key -Value $manifestPath
Write-Host 'Native bridge installed for the current Windows user. Reopen the extension and check E-HSMT connection.'
Write-Host ('Download folder: ' + $downloadPath)
