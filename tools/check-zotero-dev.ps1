$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$root = 'D:\AcademicVocab'
$runtime = 'D:\AcademicVocab\tools\zotero-dev-runtime-9.0.6'
$devExe = 'D:\AcademicVocab\tools\zotero-dev-runtime-9.0.6\zotero.exe'
$dailyExe = 'D:\ZoteroApp\9.0.6\zotero.exe'
$profile = 'D:\AcademicVocab\zotero-dev\profile'
$data = 'D:\AcademicVocab\zotero-dev\data'
$temp = 'D:\AcademicVocab\cache\temp'
$userJs = 'D:\AcademicVocab\zotero-dev\profile\user.js'
$prefsJs = 'D:\AcademicVocab\zotero-dev\profile\prefs.js'
$expectedExeHash = '422D4C88E952A4D40E877D1DBE5E28E902E94D402D6217642E17E9B08CD40E7D'

function Assert-DevCheck {
    param(
        [bool]$Condition,
        [string]$Message
    )

    if (-not $Condition) {
        throw "Zotero development preflight failed: $Message"
    }

    Write-Host "PASS: $Message"
}

Assert-DevCheck ($devExe -ne $dailyExe) 'development executable is separate from daily Zotero'
Assert-DevCheck ($devExe.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) 'development executable is under D:\AcademicVocab'
Assert-DevCheck (Test-Path -LiteralPath $dailyExe -PathType Leaf) 'daily Zotero 9 executable exists'
Assert-DevCheck ((Get-Item -LiteralPath $dailyExe).VersionInfo.FileVersion -eq '9.0.6') 'daily Zotero version is 9.0.6'
Assert-DevCheck ((Get-AuthenticodeSignature -LiteralPath $dailyExe).Status -eq 'Valid') 'daily Zotero signature is valid'
Assert-DevCheck ((Get-FileHash -LiteralPath $dailyExe -Algorithm SHA256).Hash -eq $expectedExeHash) 'daily Zotero hash matches the verified official ZIP'
Assert-DevCheck (Test-Path -LiteralPath $runtime -PathType Container) 'development runtime directory exists'
Assert-DevCheck (Test-Path -LiteralPath $devExe -PathType Leaf) 'development Zotero executable exists'
Assert-DevCheck (Test-Path -LiteralPath $profile -PathType Container) 'development profile directory exists'
Assert-DevCheck (Test-Path -LiteralPath $data -PathType Container) 'development data directory exists'
Assert-DevCheck (Test-Path -LiteralPath $temp -PathType Container) 'development temporary directory exists'
Assert-DevCheck (-not (Get-Process -Name zotero -ErrorAction SilentlyContinue)) 'no Zotero process is currently running'

$exe = Get-Item -LiteralPath $devExe
Assert-DevCheck ($exe.VersionInfo.FileVersion -eq '9.0.6') 'development executable version is 9.0.6'
Assert-DevCheck ((Get-AuthenticodeSignature -LiteralPath $devExe).Status -eq 'Valid') 'development executable signature is valid'
Assert-DevCheck ((Get-FileHash -LiteralPath $devExe -Algorithm SHA256).Hash -eq $expectedExeHash) 'development executable hash matches the verified official ZIP'

$applicationIni = Get-Content -LiteralPath (Join-Path $runtime 'app\application.ini') -Raw
$platformIni = Get-Content -LiteralPath (Join-Path $runtime 'platform.ini') -Raw
Assert-DevCheck ($applicationIni -match '(?m)^Version=9\.0\.6$') 'application.ini version is 9.0.6'
Assert-DevCheck ($applicationIni -match '(?m)^MinVersion=140\.0$') 'application.ini requires Mozilla 140'
Assert-DevCheck ($platformIni -match '(?m)^Milestone=140\.10\.0$') 'official ZIP platform marker is 140.10.0'

Assert-DevCheck (Test-Path -LiteralPath $userJs -PathType Leaf) 'development-only user.js exists'
$userJsContent = Get-Content -LiteralPath $userJs -Raw
Assert-DevCheck ($userJsContent.Contains('user_pref("app.update.auto", false);')) 'automatic updates are disabled for the development profile'
Assert-DevCheck ($userJsContent.Contains('user_pref("app.update.enabled", false);')) 'update checks are disabled for the development profile'

Assert-DevCheck (Test-Path -LiteralPath $prefsJs -PathType Leaf) 'development prefs.js exists'
$prefsJsContent = Get-Content -LiteralPath $prefsJs -Raw
Assert-DevCheck ($prefsJsContent.Contains('user_pref("extensions.zotero.dataDir", "D:\\AcademicVocab\\zotero-dev\\data");')) 'development profile uses the isolated D-drive data directory'
Assert-DevCheck ($prefsJsContent.Contains('user_pref("extensions.zotero.useDataDir", true);')) 'development profile has the custom data directory enabled'

$reparsePoints = Get-ChildItem -LiteralPath $runtime -Force -Recurse -ErrorAction Stop |
    Where-Object { ($_.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0 }
Assert-DevCheck (@($reparsePoints).Count -eq 0) 'development runtime contains no symbolic links or junctions'

Write-Host 'ALL ZOTERO DEVELOPMENT PREFLIGHT CHECKS PASSED.'
