param(
    [switch]$RequireInstalled
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$source = 'D:\AcademicVocab\repo\zotero-selection-poc'
$manifestPath = Join-Path $source 'manifest.json'
$bootstrapPath = Join-Path $source 'bootstrap.js'
$extractorPath = Join-Path $source 'sentence-extractor.js'
$proxy = 'D:\AcademicVocab\zotero-dev\profile\extensions\academicvocab-selection-poc@academicvocab.local'
$builtXPI = 'D:\AcademicVocab\zotero-dev\builds\academicvocab-selection-poc-0.2.7.xpi'
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
Assert-SelectionCheck (Test-Path -LiteralPath $extractorPath -PathType Leaf) 'sentence extractor exists'

$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$zoteroConfig = $manifest.applications.zotero
Assert-SelectionCheck ($manifest.manifest_version -eq 2) 'manifest version is supported'
Assert-SelectionCheck ($manifest.version -eq '0.2.7') 'POC version is 0.2.7'
Assert-SelectionCheck ($zoteroConfig.id -eq $expectedPluginID) 'plugin ID is exact'
Assert-SelectionCheck ($zoteroConfig.strict_min_version -eq '8.999') 'minimum Zotero version follows the current Zotero 9 plugin convention'
Assert-SelectionCheck ($zoteroConfig.strict_max_version -eq '10.0.*') 'maximum Zotero version follows the current Zotero 9 plugin convention'
Assert-SelectionCheck ($zoteroConfig.update_url -eq 'https://academicvocab.invalid/zotero-selection-poc-updates.json') 'required update URL uses the reserved .invalid domain'

$bootstrap = Get-Content -LiteralPath $bootstrapPath -Raw -Encoding UTF8
$extractor = Get-Content -LiteralPath $extractorPath -Raw -Encoding UTF8
$pluginCode = "$bootstrap`n$extractor"
Assert-SelectionCheck ($bootstrap.Contains('renderTextSelectionPopup')) 'official text-selection popup event is registered'
Assert-SelectionCheck ($bootstrap.Contains('reader.itemID')) 'current reader attachment ID is used'
Assert-SelectionCheck ($bootstrap.Contains('Zotero.PDFWorker.getFullText')) 'adjacent PDF pages are read through Zotero PDFWorker'
Assert-SelectionCheck ($bootstrap.Contains('pageIndex - 1, pageIndex, pageIndex + 1')) 'only the selected and adjacent page indexes are requested'
Assert-SelectionCheck ($bootstrap.Contains('loadSubScript')) 'tested sentence extractor is loaded at plugin startup'
Assert-SelectionCheck (-not $bootstrap.Contains('reader._internalReader')) 'private reader view path is not used'
Assert-SelectionCheck (-not $bootstrap.Contains('page.getTextContent')) 'private PDF.js page object is not used'
Assert-SelectionCheck (-not $bootstrap.Contains('doc.getSelection')) 'popup document selection is not mistaken for PDF page text'
Assert-SelectionCheck ($extractor.Contains('removeRepeatedHeadersAndFooters')) 'repeated page furniture is filtered locally'
Assert-SelectionCheck ($extractor.Contains('requiresConfirmation')) 'low-confidence and ambiguous results require confirmation'
Assert-SelectionCheck ($extractor.Contains('MAX_CANDIDATE_LENGTH = 1000')) 'candidate length has a hard local limit'
Assert-SelectionCheck ($bootstrap.Contains('closeButton.addEventListener')) 'temporary UI has an explicit close action'
Assert-SelectionCheck ($bootstrap.Contains('this.removeNode(overlay)')) 'temporary UI is removed instead of saved'
Assert-SelectionCheck ($bootstrap.Contains('enablePanelDragging')) 'temporary panel enables title-bar dragging'
Assert-SelectionCheck ($bootstrap.Contains('setPointerCapture')) 'dragging keeps pointer control until release'
Assert-SelectionCheck ($bootstrap.Contains('maximumLeft') -and $bootstrap.Contains('maximumTop')) 'dragging is constrained to the Zotero window'
Assert-SelectionCheck ($bootstrap.Contains('"background: transparent"')) 'floating panel does not dim the PDF'
Assert-SelectionCheck ($bootstrap.Contains('"pointer-events: none"')) 'PDF remains interactive outside the floating panel'
Assert-SelectionCheck ($bootstrap.Contains('panel.setAttribute("aria-modal", "false")')) 'floating panel is explicitly non-modal'
Assert-SelectionCheck ($bootstrap.Contains('"width: 400px"')) 'floating panel has a compact stable default width'
Assert-SelectionCheck ($bootstrap.Contains('enablePanelResizing')) 'floating panel has a custom resize handle'
Assert-SelectionCheck ($bootstrap.Contains('keepPanelInsideViewport')) 'floating panel is returned to the visible viewport'
Assert-SelectionCheck ($bootstrap.Contains('ResizeObserver')) 'reader viewport changes trigger panel containment'
Assert-SelectionCheck ($bootstrap.Contains('addNodeCleanup')) 'viewport listeners are cleaned up with the panel'
Assert-SelectionCheck ($bootstrap.Contains('doc.createElement("details")')) 'technical metadata is collapsed by default'
Assert-SelectionCheck ($bootstrap.Contains('"position: sticky"')) 'drag title remains visible while panel content scrolls'
Assert-SelectionCheck ($bootstrap.Contains('"white-space: nowrap"')) 'compact title remains on one line'

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
    Assert-SelectionCheck (-not ($pluginCode -match $pattern)) "plugin code excludes forbidden pattern: $pattern"
}

Assert-SelectionCheck (-not (Test-Path -LiteralPath $proxy)) 'unreliable development source proxy is absent'
Assert-SelectionCheck (Test-Path -LiteralPath $builtXPI -PathType Leaf) 'built XPI exists on D drive'

if ($RequireInstalled) {
    Assert-SelectionCheck (Test-Path -LiteralPath $installedXPI -PathType Leaf) 'development-only installed XPI exists'
    Assert-SelectionCheck (
        (Get-FileHash -LiteralPath $builtXPI -Algorithm SHA256).Hash -eq
        (Get-FileHash -LiteralPath $installedXPI -Algorithm SHA256).Hash
    ) 'installed XPI exactly matches the verified build'
    Assert-SelectionCheck ($installedXPI.StartsWith('D:\AcademicVocab\', [System.StringComparison]::OrdinalIgnoreCase)) 'installed XPI is under the D-drive project root'
}
else {
    Write-Host 'SKIP: installed-XPI check awaits manual Zotero confirmation.'
}

Write-Host 'ALL ZOTERO SELECTION POC CHECKS PASSED.'
