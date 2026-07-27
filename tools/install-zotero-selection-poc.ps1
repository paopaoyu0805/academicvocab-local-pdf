$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$root = 'D:\AcademicVocab'
$source = 'D:\AcademicVocab\repo\zotero-selection-poc'
$profile = 'D:\AcademicVocab\zotero-dev\profile'
$prefs = 'D:\AcademicVocab\zotero-dev\profile\prefs.js'
$extensions = 'D:\AcademicVocab\zotero-dev\profile\extensions'
$pluginID = 'academicvocab-selection-poc@academicvocab.local'
$proxy = Join-Path $extensions $pluginID
$builtXPI = 'D:\AcademicVocab\zotero-dev\builds\academicvocab-selection-poc-0.1.0.xpi'
$installedXPI = Join-Path $extensions "$pluginID.xpi"
$extensionsDatabase = Join-Path $profile 'extensions.json'
$addonStartupCache = Join-Path $profile 'addonStartup.json.lz4'
$prefsBackup = 'D:\AcademicVocab\backups\zotero-dev-prefs-before-selection-poc.js'

if (Get-Process -Name zotero -ErrorAction SilentlyContinue) {
    throw 'Close every Zotero window before installing the development plugin.'
}

foreach ($requiredPath in @($source, $profile)) {
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

if (-not (Test-Path -LiteralPath $prefs -PathType Leaf)) {
    throw 'Development profile prefs.js is missing.'
}

$prefsContent = [System.IO.File]::ReadAllText($prefs)
if (-not $prefsContent.Contains(
    'user_pref("extensions.zotero.dataDir", "D:\\AcademicVocab\\zotero-dev\\data");'
)) {
    throw 'Development prefs.js does not point to the isolated D-drive data directory.'
}

if (-not (Test-Path -LiteralPath $prefsBackup -PathType Leaf)) {
    Copy-Item -LiteralPath $prefs -Destination $prefsBackup
}

New-Item -ItemType Directory -Path $extensions -Force | Out-Null
if (Test-Path -LiteralPath $proxy -PathType Leaf) {
    Remove-Item -LiteralPath $proxy -Force
}
Copy-Item -LiteralPath $builtXPI -Destination $installedXPI -Force

$filteredLines = [System.IO.File]::ReadAllLines($prefs) |
    Where-Object {
        $_ -notmatch '^user_pref\("extensions\.lastApp(BuildId|Version)",'
    }
[System.IO.File]::WriteAllLines(
    $prefs,
    $filteredLines,
    [System.Text.UTF8Encoding]::new($false)
)

foreach ($generatedCache in @($extensionsDatabase, $addonStartupCache)) {
    if (Test-Path -LiteralPath $generatedCache -PathType Leaf) {
        Remove-Item -LiteralPath $generatedCache -Force
    }
}

Write-Host "PASS: development-only XPI installed: $installedXPI"
Write-Host 'PASS: unreliable source proxy is absent'
Write-Host 'PASS: generated development add-on caches were cleared for safe discovery'
Write-Host "PASS: small development prefs backup exists: $prefsBackup"
Write-Host 'PASS: daily Zotero profile and data were not accessed.'
