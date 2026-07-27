$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$root = 'D:\AcademicVocab'
$repo = 'D:\AcademicVocab\repo'
$nodePath = 'D:\AcademicVocab\tools\node\node.exe'
$npmPath = 'D:\AcademicVocab\tools\node\npm.cmd'
$gitPath = 'D:\AcademicVocab\tools\git\cmd\git.exe'

function Assert-Check {
    param(
        [bool]$Condition,
        [string]$Message
    )

    if (-not $Condition) {
        throw "Path check failed: $Message"
    }

    Write-Host "PASS: $Message"
}

function Assert-DPath {
    param(
        [string]$Value,
        [string]$Label
    )

    Assert-Check `
        (-not [string]::IsNullOrWhiteSpace($Value) -and
            $Value.StartsWith('D:\AcademicVocab', [System.StringComparison]::OrdinalIgnoreCase)) `
        "$Label is under D:\AcademicVocab"
}

function Assert-ExactEnvironmentValue {
    param(
        [string]$Name,
        [string]$Expected
    )

    $actual = [Environment]::GetEnvironmentVariable($Name, 'Process')
    Assert-Check ($actual -eq $Expected) "$Name equals $Expected"
    Assert-DPath $actual $Name
}

function Get-NpmConfigValue {
    param([string]$Name)

    $value = (& $npmPath config get $Name 2>&1 | Out-String).Trim()
    Assert-Check ($LASTEXITCODE -eq 0) "npm can read the $Name setting"
    return $value
}

Assert-Check ((Get-Location).Path.TrimEnd('\') -eq $repo) 'current directory is D:\AcademicVocab\repo'
Assert-Check ($PSCommandPath.StartsWith($repo, [System.StringComparison]::OrdinalIgnoreCase)) 'check script is inside the repository'
Assert-Check (Test-Path -LiteralPath $nodePath -PathType Leaf) 'Node executable exists'
Assert-DPath $nodePath 'Node'
Assert-Check (Test-Path -LiteralPath $npmPath -PathType Leaf) 'npm command exists'
Assert-DPath $npmPath 'npm'
Assert-Check (Test-Path -LiteralPath $gitPath -PathType Leaf) 'Git executable exists'
Assert-DPath $gitPath 'Git'

Assert-ExactEnvironmentValue 'ROOT' $root
Assert-ExactEnvironmentValue 'NPM_CONFIG_CACHE' 'D:\AcademicVocab\cache\npm'
Assert-ExactEnvironmentValue 'NPM_CONFIG_PREFIX' 'D:\AcademicVocab\tools\npm-global'
Assert-ExactEnvironmentValue 'NPM_CONFIG_USERCONFIG' 'D:\AcademicVocab\config\npm\.npmrc'
Assert-ExactEnvironmentValue 'TEMP' 'D:\AcademicVocab\cache\temp'
Assert-ExactEnvironmentValue 'TMP' 'D:\AcademicVocab\cache\temp'
Assert-ExactEnvironmentValue 'PLAYWRIGHT_BROWSERS_PATH' 'D:\AcademicVocab\cache\playwright'
Assert-ExactEnvironmentValue 'ELECTRON_CACHE' 'D:\AcademicVocab\cache\electron'

$npmCache = Get-NpmConfigValue 'cache'
Assert-Check ($npmCache -eq 'D:\AcademicVocab\cache\npm') 'effective npm cache is on D drive'
$npmPrefix = Get-NpmConfigValue 'prefix'
Assert-Check ($npmPrefix -eq 'D:\AcademicVocab\tools\npm-global') 'effective npm prefix is on D drive'
$npmUserConfig = Get-NpmConfigValue 'userconfig'
Assert-Check ($npmUserConfig -eq 'D:\AcademicVocab\config\npm\.npmrc') 'effective npm userconfig is on D drive'

$reparsePoints = Get-ChildItem -LiteralPath $root -Force -Recurse -ErrorAction Stop |
    Where-Object { ($_.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0 }
foreach ($item in $reparsePoints) {
    $targets = @($item.Target)
    Assert-Check ($targets.Count -gt 0 -and -not [string]::IsNullOrWhiteSpace([string]$targets[0])) "link target can be read: $($item.FullName)"
    foreach ($target in $targets) {
        $targetText = [string]$target
        Assert-Check ($targetText.IndexOf('C:\', [System.StringComparison]::OrdinalIgnoreCase) -lt 0) "link or junction does not target C drive: $($item.FullName)"
    }
}
Write-Host 'PASS: no symbolic link or junction under the project points to C drive'

$forbiddenTerms = @(
    (('C' + ':') + '\' + 'Users'),
    ('App' + 'Data'),
    ('Desk' + 'top'),
    ('Docu' + 'ments'),
    ('Down' + 'loads')
)
$configurationExtensions = @(
    '.cmd', '.conf', '.config', '.env', '.gitconfig', '.ini', '.json',
    '.jsonc', '.npmrc', '.ps1', '.toml', '.yaml', '.yml'
)
$configurationFiles = @(
    Get-ChildItem -LiteralPath $repo -Force -Recurse -File -ErrorAction Stop |
        Where-Object { $configurationExtensions -contains $_.Extension.ToLowerInvariant() }
    Get-ChildItem -LiteralPath (Join-Path $root 'config') -Force -Recurse -File -ErrorAction Stop |
        Where-Object { $configurationExtensions -contains $_.Extension.ToLowerInvariant() }
    Get-Item -LiteralPath (Join-Path $root 'start-dev.cmd') -ErrorAction SilentlyContinue
) | Where-Object { $null -ne $_ } | Sort-Object -Property FullName -Unique

foreach ($file in $configurationFiles) {
    $content = Get-Content -LiteralPath $file.FullName -Raw -ErrorAction Stop
    foreach ($term in $forbiddenTerms) {
        Assert-Check ($content.IndexOf($term, [System.StringComparison]::OrdinalIgnoreCase) -lt 0) "configuration file excludes forbidden path text: $($file.FullName)"
    }
}
Write-Host 'PASS: project configuration excludes the specified C-drive and user-folder paths'
Write-Host 'ALL PATH CHECKS PASSED.'
