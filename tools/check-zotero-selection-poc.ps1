$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$source = 'D:\AcademicVocab\repo\zotero-selection-poc'
$manifestPath = Join-Path $source 'manifest.json'
$bootstrapPath = Join-Path $source 'bootstrap.js'
$proxy = 'D:\AcademicVocab\zotero-dev\profile\extensions\academicvocab-selection-poc@academicvocab.local'
$builtXPI = 'D:\AcademicVocab\zotero-dev\builds\academicvocab-selection-poc-0.1.0.xpi'
$installedXPI = 'D:\AcademicVocab\zotero-dev\profile\extensions\academicvocab-selection-poc@academicvocab.local.xpi'
$expectedPluginID = 'academicvocab-selection-poc@academicvocab.local'

function Assert-SelectionCheck {
    param(
        [bool]$Condition,
        [string]$Message
    )

    if (-not $Condition) {
        throw "Selection POC check failed: $Message"
    }

    Write-Host "PASS: $Message"
}

Assert-SelectionCheck (-not (Get-Process -Name zotero -ErrorAction SilentlyContinue)) 'no Zotero process is currently running'
Assert-SelectionCheck (Test-Path -LiteralPath $manifestPath -PathType Leaf) 'manifest exists'
Assert-SelectionCheck (Test-Path -LiteralPath $bootstrapPath -PathType Leaf) 'bootstrap exists'

$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$zoteroConfig = $manifest.applications.zotero
Assert-SelectionCheck ($manifest.manifest_version -eq 2) 'manifest version is supported'
Assert-SelectionCheck ($manifest.version -eq '0.1.0') 'POC version is 0.1.0'
Assert-SelectionCheck ($zoteroConfig.id -eq $expectedPluginID) 'plugin ID is exact'
Assert-SelectionCheck ($zoteroConfig.strict_min_version -eq '9.0') 'minimum Zotero version is 9.0'
Assert-SelectionCheck ($zoteroConfig.strict_max_version -eq '9.0.*') 'maximum tested Zotero version is 9.0.*'
Assert-SelectionCheck ($zoteroConfig.PSObject.Properties.Name -notcontains 'update_url') 'manifest has no update URL'

$bootstrap = Get-Content -LiteralPath $bootstrapPath -Raw -Encoding UTF8
Assert-SelectionCheck ($bootstrap.Contains('renderTextSelectionPopup')) 'official text-selection popup event is registered'
Assert-SelectionCheck ($bootstrap.Contains('reader.itemID')) 'current reader attachment ID is used'
Assert-SelectionCheck ($bootstrap.Contains('closeButton.addEventListener')) 'temporary UI has an explicit close action'
Assert-SelectionCheck ($bootstrap.Contains('this.removeNode(overlay)')) 'temporary UI is removed instead of saved'

$forbiddenPatterns = @(
    '\bfetch\s*\(',
    '\bXMLHttpRequest\b',
    '\bZotero\.HTTP\b',
    '\bZotero\.DB\b',
    '\bnew\s+Zotero\.Item\b',
    '\bsaveTx\s*\(',
    '\bsave\s*\(',
    '\beraseTx\s*\(',
    '\blocalStorage\b',
    '\bsessionStorage\b',
    'C:\\'
)
foreach ($pattern in $forbiddenPatterns) {
    Assert-SelectionCheck (-not ($bootstrap -match $pattern)) "bootstrap excludes forbidden pattern: $pattern"
}

Assert-SelectionCheck (-not (Test-Path -LiteralPath $proxy)) 'unreliable development source proxy is absent'
Assert-SelectionCheck (Test-Path -LiteralPath $builtXPI -PathType Leaf) 'built XPI exists on D drive'
Assert-SelectionCheck (Test-Path -LiteralPath $installedXPI -PathType Leaf) 'development-only installed XPI exists'
Assert-SelectionCheck (
    (Get-FileHash -LiteralPath $builtXPI -Algorithm SHA256).Hash -eq
    (Get-FileHash -LiteralPath $installedXPI -Algorithm SHA256).Hash
) 'installed XPI exactly matches the verified build'
Assert-SelectionCheck ($installedXPI.StartsWith('D:\AcademicVocab\', [System.StringComparison]::OrdinalIgnoreCase)) 'installed XPI is under the D-drive project root'

Write-Host 'ALL ZOTERO SELECTION POC CHECKS PASSED.'
