param(
    [switch]$RequireInstalled
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$source = 'D:\AcademicVocab\repo\zotero-selection-poc'
$manifestPath = Join-Path $source 'manifest.json'
$bootstrapPath = Join-Path $source 'bootstrap.js'
$extractorPath = Join-Path $source 'sentence-extractor.js'
$ownershipPath = Join-Path $source 'marker-ownership.js'
$normalizerPath = Join-Path $source 'word-normalizer.js'
$proxy = 'D:\AcademicVocab\zotero-dev\profile\extensions\academicvocab-selection-poc@academicvocab.local'
$builtXPI = 'D:\AcademicVocab\zotero-dev\builds\academicvocab-selection-poc-0.4.0.xpi'
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
Assert-SelectionCheck (Test-Path -LiteralPath $ownershipPath -PathType Leaf) 'marker ownership module exists'
Assert-SelectionCheck (Test-Path -LiteralPath $normalizerPath -PathType Leaf) 'word normalizer module exists'

$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$zoteroConfig = $manifest.applications.zotero
Assert-SelectionCheck ($manifest.manifest_version -eq 2) 'manifest version is supported'
Assert-SelectionCheck ($manifest.version -eq '0.4.0') 'POC version is 0.4.0'
Assert-SelectionCheck ($zoteroConfig.id -eq $expectedPluginID) 'plugin ID is exact'
Assert-SelectionCheck ($zoteroConfig.strict_min_version -eq '8.999') 'minimum Zotero version follows the current Zotero 9 plugin convention'
Assert-SelectionCheck ($zoteroConfig.strict_max_version -eq '10.0.*') 'maximum Zotero version follows the current Zotero 9 plugin convention'
Assert-SelectionCheck ($zoteroConfig.update_url -eq 'https://academicvocab.invalid/zotero-selection-poc-updates.json') 'required update URL uses the reserved .invalid domain'

$bootstrap = Get-Content -LiteralPath $bootstrapPath -Raw -Encoding UTF8
$extractor = Get-Content -LiteralPath $extractorPath -Raw -Encoding UTF8
$ownership = Get-Content -LiteralPath $ownershipPath -Raw -Encoding UTF8
$normalizer = Get-Content -LiteralPath $normalizerPath -Raw -Encoding UTF8
$pluginCode = "$bootstrap`n$extractor`n$ownership`n$normalizer"
Assert-SelectionCheck ($bootstrap.Contains('renderTextSelectionPopup')) 'official text-selection popup event is registered'
Assert-SelectionCheck ($bootstrap.Contains('reader.itemID')) 'current reader attachment ID is used'
Assert-SelectionCheck ($bootstrap.Contains('Zotero.PDFWorker.getFullText')) 'adjacent PDF pages are read through Zotero PDFWorker'
Assert-SelectionCheck ($bootstrap.Contains('pageIndex - 1, pageIndex, pageIndex + 1')) 'only the selected and adjacent page indexes are requested'
Assert-SelectionCheck ($bootstrap.Contains('loadSubScript')) 'tested sentence extractor is loaded at plugin startup'
Assert-SelectionCheck ($bootstrap.Contains('marker-ownership.js')) 'tested marker ownership module is loaded at plugin startup'
Assert-SelectionCheck ($bootstrap.Contains('word-normalizer.js')) 'tested word normalizer module is loaded at plugin startup'
Assert-SelectionCheck ($bootstrap.Contains('academicvocab-lemma-preview')) 'panel shows the lemma intended for the main word record'
Assert-SelectionCheck ($bootstrap.Contains('academicvocab-surface-form-preview')) 'panel preserves the selected surface form'
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
Assert-SelectionCheck ($bootstrap.Contains('assertIsolatedDevelopmentProfile')) 'marker actions are restricted to the isolated development profile'
Assert-SelectionCheck ($bootstrap.Contains('Services.prefs.setStringPref')) 'marker ledger is persisted in the plugin development profile'
Assert-SelectionCheck ($bootstrap.Contains('Zotero.Annotations.saveFromJSON')) 'test markers use Zotero annotation APIs'
Assert-SelectionCheck ($bootstrap.Contains('markerColor: "#8b5cf6"')) 'test marker uses the brighter lowercase purple color'
Assert-SelectionCheck ($bootstrap.Contains('markerType: "underline"')) 'new test markers use a purple underline rather than a highlighter fill'
Assert-SelectionCheck ($bootstrap.Contains('attachment.getAnnotations(false)')) 'existing annotations are checked only on the current attachment'
Assert-SelectionCheck ($bootstrap.Contains('overlapsExistingAnnotation')) 'existing annotations may overlap without being modified'
Assert-SelectionCheck (-not $bootstrap.Contains('return { code: "overlap_detected"')) 'overlap never blocks safe creation of a separate owned underline'
Assert-SelectionCheck ($ownership.Contains('matchesExactOwnership')) 'deletion requires exact ownership verification'
Assert-SelectionCheck ($ownership.Contains('legacyCanonicalJSONString')) 'pre-normalization ledger signatures have a constrained migration path'
Assert-SelectionCheck ($ownership.Contains('matchesLegacyContextRecord')) 'legacy ledger lookup requires the same normalized owned selection'
Assert-SelectionCheck ($ownership.Contains('canRecreateRemovedRecord')) 'only explicitly removed owned markers may be recreated on a new Create action'
Assert-SelectionCheck ($bootstrap.Contains('removeOwnedTestMarker')) 'test-marker removal has a dedicated safe path'
Assert-SelectionCheck (([regex]::Matches($bootstrap, 'eraseTx\s*\(')).Count -eq 1) 'only one exact-key erase operation exists'
Assert-SelectionCheck ($bootstrap.Contains('verifyOrRestoreOwnedMarker')) 'only verified owned marker colors can be restored'
Assert-SelectionCheck (([regex]::Matches($bootstrap, 'saveTx\s*\(')).Count -eq 1) 'only one exact-key color restore save operation exists'

$forbiddenPatterns = @(
    '\bfetch\s*\(',
    '\bXMLHttpRequest\b',
    '\bZotero\.HTTP\b',
    '\bZotero\.DB\b',
    '\bnew\s+Zotero\.Item\b',
    '\bsave\s*\(',
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
