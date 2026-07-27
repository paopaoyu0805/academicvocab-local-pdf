$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$root = 'D:\AcademicVocab'
$runtime = 'D:\AcademicVocab\tools\zotero-dev-runtime'
$devExe = 'D:\AcademicVocab\tools\zotero-dev-runtime\zotero.exe'
$dailyExe = 'D:\zotero\zotero.exe'
$profile = 'D:\AcademicVocab\zotero-dev\profile'
$data = 'D:\AcademicVocab\zotero-dev\data'
$temp = 'D:\AcademicVocab\cache\temp'
$userJs = 'D:\AcademicVocab\zotero-dev\profile\user.js'
$expectedExeHash = '52073E9F5FDEF5412542920C3F7D3FC88D37D78F97F09D9C5FD82EF6B5B2CAD7'

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
Assert-DevCheck (Test-Path -LiteralPath $runtime -PathType Container) 'development runtime directory exists'
Assert-DevCheck (Test-Path -LiteralPath $devExe -PathType Leaf) 'development Zotero executable exists'
Assert-DevCheck (Test-Path -LiteralPath $profile -PathType Container) 'development profile directory exists'
Assert-DevCheck (Test-Path -LiteralPath $data -PathType Container) 'development data directory exists'
Assert-DevCheck (Test-Path -LiteralPath $temp -PathType Container) 'development temporary directory exists'
Assert-DevCheck (-not (Get-Process -Name zotero -ErrorAction SilentlyContinue)) 'no Zotero process is currently running'

$exe = Get-Item -LiteralPath $devExe
Assert-DevCheck ($exe.VersionInfo.FileVersion -eq '7.0.32') 'development executable version is 7.0.32'
Assert-DevCheck ((Get-AuthenticodeSignature -LiteralPath $devExe).Status -eq 'Valid') 'development executable signature is valid'
Assert-DevCheck ((Get-FileHash -LiteralPath $devExe -Algorithm SHA256).Hash -eq $expectedExeHash) 'development executable hash matches the verified official ZIP'

$applicationIni = Get-Content -LiteralPath (Join-Path $runtime 'app\application.ini') -Raw
$platformIni = Get-Content -LiteralPath (Join-Path $runtime 'platform.ini') -Raw
Assert-DevCheck ($applicationIni -match '(?m)^Version=7\.0\.32$') 'application.ini version is 7.0.32'
Assert-DevCheck ($applicationIni -match '(?m)^MinVersion=115\.0$') 'application.ini requires Mozilla 115'
Assert-DevCheck ($platformIni -match '(?m)^Milestone=115\.14\.0$') 'Mozilla platform version is 115.14.0'

Assert-DevCheck (Test-Path -LiteralPath $userJs -PathType Leaf) 'development-only user.js exists'
$userJsContent = Get-Content -LiteralPath $userJs -Raw
Assert-DevCheck ($userJsContent.Contains('user_pref("app.update.auto", false);')) 'automatic updates are disabled for the development profile'
Assert-DevCheck ($userJsContent.Contains('user_pref("app.update.enabled", false);')) 'update checks are disabled for the development profile'

$reparsePoints = Get-ChildItem -LiteralPath $runtime -Force -Recurse -ErrorAction Stop |
    Where-Object { ($_.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0 }
Assert-DevCheck (@($reparsePoints).Count -eq 0) 'development runtime contains no symbolic links or junctions'

Write-Host 'ALL ZOTERO DEVELOPMENT PREFLIGHT CHECKS PASSED.'
