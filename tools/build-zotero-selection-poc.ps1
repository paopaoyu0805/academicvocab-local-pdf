$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$source = 'D:\AcademicVocab\repo\zotero-selection-poc'
$buildDirectory = 'D:\AcademicVocab\zotero-dev\builds'
$output = 'D:\AcademicVocab\zotero-dev\builds\academicvocab-selection-poc-0.4.0.xpi'
$temporaryZip = 'D:\AcademicVocab\zotero-dev\builds\academicvocab-selection-poc-0.4.0.zip'

if (-not (Test-Path -LiteralPath $source -PathType Container)) {
    throw "Plugin source directory is missing: $source"
}

if (-not (Test-Path -LiteralPath $buildDirectory -PathType Container)) {
    throw "Build directory is missing: $buildDirectory"
}

if (Test-Path -LiteralPath $output) {
    Remove-Item -LiteralPath $output -Force
}

if (Test-Path -LiteralPath $temporaryZip) {
    Remove-Item -LiteralPath $temporaryZip -Force
}

Compress-Archive -Path (Join-Path $source '*') -DestinationPath $temporaryZip -CompressionLevel Optimal
Move-Item -LiteralPath $temporaryZip -Destination $output

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($output)
try {
    $entryNames = @($archive.Entries | ForEach-Object { $_.FullName.Replace('\', '/') })
    if ($entryNames -notcontains 'manifest.json') {
        throw 'Built XPI does not contain manifest.json at its root.'
    }
    if ($entryNames -notcontains 'bootstrap.js') {
        throw 'Built XPI does not contain bootstrap.js at its root.'
    }
    if ($entryNames -notcontains 'sentence-extractor.js') {
        throw 'Built XPI does not contain sentence-extractor.js at its root.'
    }
    if ($entryNames -notcontains 'marker-ownership.js') {
        throw 'Built XPI does not contain marker-ownership.js at its root.'
    }
    if ($entryNames -notcontains 'word-normalizer.js') {
        throw 'Built XPI does not contain word-normalizer.js at its root.'
    }
}
finally {
    $archive.Dispose()
}

$hash = (Get-FileHash -LiteralPath $output -Algorithm SHA256).Hash
$size = (Get-Item -LiteralPath $output).Length

Write-Host "PASS: built $output"
Write-Host "PASS: XPI size is $size bytes"
Write-Host "PASS: XPI SHA-256 is $hash"
