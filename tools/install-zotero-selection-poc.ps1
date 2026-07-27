$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$root = 'D:\AcademicVocab'
$source = 'D:\AcademicVocab\repo\zotero-selection-poc'
$builtXPI = 'D:\AcademicVocab\zotero-dev\builds\academicvocab-selection-poc-0.3.9.xpi'

if (Get-Process -Name zotero -ErrorAction SilentlyContinue) {
    throw 'Close every Zotero window before preparing the development plugin.'
}

foreach ($requiredPath in @($source)) {
    if (-not $requiredPath.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Path is outside D:\AcademicVocab: $requiredPath"
    }
    if (-not (Test-Path -LiteralPath $requiredPath -PathType Container)) {
        throw "Required directory is missing: $requiredPath"
    }
}

if (-not (Test-Path -LiteralPath (Join-Path $source 'manifest.json') -PathType Leaf)) {
    throw 'Plugin manifest is missing.'
}

if (-not (Test-Path -LiteralPath (Join-Path $source 'bootstrap.js') -PathType Leaf)) {
    throw 'Plugin bootstrap file is missing.'
}

if (-not (Test-Path -LiteralPath $builtXPI -PathType Leaf)) {
    throw "Built plugin XPI is missing: $builtXPI"
}

Write-Host "PASS: development XPI is ready: $builtXPI"
Write-Host 'INFO: Zotero 9 requires confirmation in Tools -> Plugins -> Install Add-on From File.'
Write-Host 'PASS: no Zotero profile, data, cache, or daily installation was modified.'
