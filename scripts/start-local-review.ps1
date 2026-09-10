param(
  [switch]$NoBrowser,
  [int]$StartupTimeoutSeconds = 90
)

$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$runtimeRoot = 'C:\Users\urmylucky\.cache\codex-runtimes\codex-primary-runtime\dependencies'
$node = Join-Path $runtimeRoot 'node\bin\node.exe'
$vinextCli = Join-Path $workspace 'node_modules\vinext\dist\cli.js'
$workDir = Join-Path $workspace 'work'
$pidFile = Join-Path $workDir 'local-server.pid'
$outLog = Join-Path $workDir 'local-server.out.log'
$errLog = Join-Path $workDir 'local-server.err.log'
$url = 'http://localhost:3000'

New-Item -ItemType Directory -Force -Path $workDir | Out-Null

if (-not (Test-Path -LiteralPath $node)) {
  throw "Node runtime is missing: $node"
}
if (-not (Test-Path -LiteralPath $vinextCli)) {
  throw "Vinext CLI is missing: $vinextCli"
}

function Test-ReviewServerReady {
  try {
    $response = Invoke-WebRequest -UseBasicParsing "$url/market-snapshot.json" -TimeoutSec 2
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

$listener = Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
  if (-not (Test-ReviewServerReady)) {
    throw "Port 3000 belongs to another service. Daily review startup requires this port."
  }
} else {
  $env:WRANGLER_LOG_PATH = '.wrangler/wrangler.log'
  $process = Start-Process -FilePath $node `
    -ArgumentList @($vinextCli,'dev','--host','127.0.0.1','--port','3000') `
    -WorkingDirectory $workspace `
    -WindowStyle Hidden `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog `
    -PassThru
  Set-Content -LiteralPath $pidFile -Value $process.Id -Encoding ascii

  $ready = $false
  $deadline = [DateTime]::UtcNow.AddSeconds($StartupTimeoutSeconds)
  while ([DateTime]::UtcNow -lt $deadline) {
    Start-Sleep -Milliseconds 500
    if (Test-ReviewServerReady) {
      $ready = $true
      break
    }
    if ($process.HasExited) { break }
  }
  if (-not $ready) {
    $details = @(
      if (Test-Path $outLog) { Get-Content -Raw $outLog }
      if (Test-Path $errLog) { Get-Content -Raw $errLog }
    ) -join [Environment]::NewLine
    if ([string]::IsNullOrWhiteSpace($details)) {
      $details = 'The server produced an empty startup log.'
    }
    throw "Local daily review server failed to start: $details"
  }
}

if (-not $NoBrowser) {
  Start-Process $url
}

Write-Output $url
