$ErrorActionPreference = 'Stop'
$key = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\vn.giaosucuibap.hsmt'
$expected = Join-Path $env:LOCALAPPDATA 'GiaoSuCuiBap\NativeHost\vn.giaosucuibap.hsmt.json'
if (Test-Path -LiteralPath $key) {
  $actual = (Get-Item -LiteralPath $key).GetValue('')
  if ($actual -ne $expected) { throw 'Registration points to another installation; nothing was removed.' }
  Remove-Item -LiteralPath $key
}
Write-Host 'Native bridge registration removed. Downloaded files and installation files were kept.'
