$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$runtimeRoot = 'C:\Users\urmylucky\.cache\codex-runtimes\codex-primary-runtime\dependencies'
$node = Join-Path $runtimeRoot 'node\bin\node.exe'
$pnpm = Join-Path $runtimeRoot 'bin\fallback\pnpm.cmd'
$pidFile = Join-Path $workspace 'work\local-server.pid'

$env:PATH = "$(Join-Path $runtimeRoot 'node\bin');$(Join-Path $runtimeRoot 'bin\fallback');$env:PATH"
$env:WRANGLER_LOG_PATH = '.wrangler/wrangler.log'

Push-Location $workspace
try {
  & $node 'scripts\update-snapshots.mjs'
  if ($LASTEXITCODE -ne 0) { throw 'Online data update failed. The previous trading-day version was preserved.' }

  & $pnpm exec vinext build
  if ($LASTEXITCODE -ne 0) { throw 'Local site build failed. The previous version was preserved.' }

  $listener = Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($listener) {
    $serverProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)" -ErrorAction SilentlyContinue
    if ($serverProcess -and $serverProcess.CommandLine -like "*$workspace*" -and $serverProcess.CommandLine -like '*vinext*') {
      Stop-Process -Id $listener.OwningProcess -Force
    }
  }
  Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue

  & (Join-Path $PSScriptRoot 'start-local-review.ps1') -NoBrowser
} finally {
  Pop-Location
}
