<#
.SYNOPSIS
  Build dist\TA_Estimate.xlam tu src\vba (*.bas, *.cls) va src\ribbon\customUI14.xml.

.DESCRIPTION
  Chay tren Windows co Excel desktop (baseline Microsoft 365 / 2024, 64-bit).
  Buoc build can "Trust access to the VBA project object model" TREN MAY PHAT TRIEN:
    File > Options > Trust Center > Trust Center Settings > Macro Settings.
  Script KHONG sua registry, KHONG ha muc bao mat macro. Tat lai tuy chon tren sau khi build
  neu chinh sach cong ty yeu cau. Neu khong duoc bat, lam theo duong nhap tay trong docs\BUILD.md.

  File nay chi dung ky tu ASCII de PowerShell 5.1 doc dung ma khong can BOM.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\build_addin.ps1
#>
param(
    [string]$Root = "",
    [string]$OutFile = ""
)
$ErrorActionPreference = "Stop"
if (-not $Root) { $Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path }
if (-not $OutFile) { $OutFile = Join-Path $Root "dist\TA_Estimate.xlam" }
$srcVba = Join-Path $Root "src\vba"
$ribbon = Join-Path $Root "src\ribbon\customUI14.xml"
New-Item -ItemType Directory -Force -Path (Split-Path $OutFile) | Out-Null
if (Test-Path $OutFile) { Remove-Item $OutFile -Force }

$excel = New-Object -ComObject Excel.Application
# De hien Excel: neu VBA bao loi bien dich, hop thoai se hien ra thay vi treo an.
$excel.Visible = $true
$excel.DisplayAlerts = $false
try {
    $wb = $excel.Workbooks.Add(-4167)
    try {
        $vbp = $wb.VBProject
        $null = $vbp.VBComponents.Count
    } catch {
        throw "Excel chan truy cap VBProject. Bat 'Trust access to the VBA project object model' tren may phat trien, hoac lam theo docs\BUILD.md (nhap tay)."
    }
    $files = @(Get-ChildItem $srcVba -File | Where-Object { $_.Extension -in @(".bas", ".cls") } | Sort-Object Name)
    foreach ($f in $files) {
        $null = $vbp.VBComponents.Import($f.FullName)
        Write-Host ("Import " + $f.Name)
    }
    Write-Host "Tao frmSearch..."
    $excel.Run("'" + $wb.Name + "'!TA_Dev_BuildForms")
    foreach ($n in @("modDevBuild", "modFormCode")) {
        $vbp.VBComponents.Remove($vbp.VBComponents.Item($n))
    }
    $wb.Title = "TA Estimate"
    $wb.SaveAs($OutFile, 55)   # 55 = xlOpenXMLAddIn
    $wb.Close($false)
} finally {
    $excel.Quit()
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
    [GC]::Collect()
}

# Chen Ribbon: customUI/customUI14.xml + quan he trong _rels/.rels
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$relType = "http://schemas.microsoft.com/office/2007/relationships/ui/extensibility"
$zip = [System.IO.Compression.ZipFile]::Open($OutFile, [System.IO.Compression.ZipArchiveMode]::Update)
try {
    $old = $zip.GetEntry("customUI/customUI14.xml")
    if ($old) { $old.Delete() }
    $entry = $zip.CreateEntry("customUI/customUI14.xml")
    $bytes = [System.IO.File]::ReadAllBytes($ribbon)
    $s = $entry.Open()
    $s.Write($bytes, 0, $bytes.Length)
    $s.Close()

    $relsEntry = $zip.GetEntry("_rels/.rels")
    $reader = New-Object System.IO.StreamReader($relsEntry.Open())
    $xml = $reader.ReadToEnd()
    $reader.Close()
    if ($xml -notmatch "customUI14.xml") {
        $rel = '<Relationship Id="rIdTAribbon" Type="' + $relType + '" Target="customUI/customUI14.xml"/>'
        $xml = $xml.Replace("</Relationships>", $rel + "</Relationships>")
        $relsEntry.Delete()
        $newRels = $zip.CreateEntry("_rels/.rels")
        $w = New-Object System.IO.StreamWriter($newRels.Open(), (New-Object System.Text.UTF8Encoding($false)))
        $w.Write($xml)
        $w.Close()
    }
} finally {
    $zip.Dispose()
}

$hash = (Get-FileHash $OutFile -Algorithm SHA256).Hash
Write-Host ("Da tao " + $OutFile)
Write-Host ("SHA-256 " + $hash)
Write-Host "Tiep theo: mo Excel > Alt+F11 > Debug > Compile VBAProject; cai add-in; chay TA_SelfTest (docs\BUILD.md)."
