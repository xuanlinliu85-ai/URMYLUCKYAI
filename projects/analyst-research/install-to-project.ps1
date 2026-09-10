param(
  [Parameter(Mandatory=$false)]
  [string]$Target = "."
)

$ErrorActionPreference = "Stop"
$Source = Split-Path -Parent $MyInvocation.MyCommand.Path
$Target = (Resolve-Path $Target).Path

Write-Host "Installing Analyst Dream Team into: $Target"

New-Item -ItemType Directory -Force -Path (Join-Path $Target ".agents\skills") | Out-Null

Copy-Item -Recurse -Force (Join-Path $Source ".agents\skills\*") (Join-Path $Target ".agents\skills\")

$rootFiles = @(
  "CODEX_START_HERE.md",
  "RELEASE_TO_CODEX.md",
  "INSTALL.md",
  "FRAMEWORK.md",
  "CORPUS_POLICY.md",
  "EXTENDING.md",
  "EXTENSION_API.md",
  "ANALYST_REGISTRY.json",
  "CORPUS_AUDIT_V2.1.json",
  "manifest.json",
  "CHANGELOG.md"
)

foreach ($f in $rootFiles) {
  Copy-Item -Force (Join-Path $Source $f) (Join-Path $Target $f)
}

Copy-Item -Recurse -Force (Join-Path $Source "EXTENSION_KIT") (Join-Path $Target "EXTENSION_KIT")
New-Item -ItemType Directory -Force -Path (Join-Path $Target "tools") | Out-Null
Copy-Item -Force (Join-Path $Source "tools\self_check.py") (Join-Path $Target "tools\self_check.py")

$agentsTarget = Join-Path $Target "AGENTS.md"
if (Test-Path $agentsTarget) {
  Write-Host "AGENTS.md already exists; leaving it unchanged."
  Write-Host "Please merge the Analyst Dream Team instructions manually from this package's AGENTS.md."
} else {
  Copy-Item -Force (Join-Path $Source "AGENTS.md") $agentsTarget
}

Write-Host ""
Write-Host "Installed."
Write-Host "Next: ask Codex to read CODEX_START_HERE.md from the package, or paste its first-run prompt."
