[CmdletBinding(SupportsShouldProcess)]
param(
  [Parameter(Mandatory = $true)]
  [string]$Source,
  [Parameter(Mandatory = $true)]
  [ValidateSet('analyst-dream-team', 'earnings-analysis', 'fund-manager', 'matt', 'mikko-kevin', 'ppt-factory')]
  [string]$ProjectId,
  [switch]$Apply
)

$repoRoot = Split-Path -Parent $PSScriptRoot
$registry = Get-Content -Raw -LiteralPath (Join-Path $repoRoot 'PROJECT_REGISTRY.json') | ConvertFrom-Json
$project = $registry.projects | Where-Object { $_.id -eq $ProjectId }
if (-not $project) { throw "Project is not registered: $ProjectId" }

$sourceRoot = (Resolve-Path -LiteralPath $Source).Path
$destinationRoot = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $project.path))
$projectsRoot = [System.IO.Path]::GetFullPath((Join-Path $repoRoot 'projects'))
if (-not $destinationRoot.StartsWith($projectsRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Snapshot destination must stay inside projects/'
}

$allowRoots = @('src', 'app', 'scripts', 'docs', 'skills', 'tests', 'config', '.agents\skills')
$blockedSegments = @('node_modules', '.git', '.env', 'dist', '.next', 'cache', 'caches', 'output', 'outputs', 'generated', 'logs', 'temp', 'tmp', 'runs', 'work')
$blockedNamePattern = '(?i)(secret|credential|cookie|api[_-]?key|token)'

$files = foreach ($relativeRoot in $allowRoots) {
  $candidate = Join-Path $sourceRoot $relativeRoot
  if (Test-Path -LiteralPath $candidate) {
    Get-ChildItem -LiteralPath $candidate -Recurse -File | Where-Object {
      $relative = [System.IO.Path]::GetRelativePath($sourceRoot, $_.FullName)
      $segments = $relative -split '[\\/]'
      -not ($segments | Where-Object { $blockedSegments -contains $_ }) -and
        $_.Name -notmatch $blockedNamePattern
    }
  }
}

foreach ($file in $files) {
  $relative = [System.IO.Path]::GetRelativePath($sourceRoot, $file.FullName)
  $destination = Join-Path $destinationRoot $relative
  if ($Apply) {
    if ($PSCmdlet.ShouldProcess($destination, 'Copy snapshot file')) {
      $parent = Split-Path -Parent $destination
      New-Item -ItemType Directory -Force -Path $parent | Out-Null
      Copy-Item -LiteralPath $file.FullName -Destination $destination -Force
    }
  } else {
    Write-Output "DRY-RUN $relative"
  }
}

if (-not $Apply) {
  Write-Output 'Dry run complete. Re-run with -Apply to copy the listed allowlisted files.'
}
