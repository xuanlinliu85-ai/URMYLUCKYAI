param(
  [ValidateSet('Poll', 'Running', 'Completed', 'Failed')]
  [string]$Action = 'Poll',
  [int]$Id = 0,
  [string]$TradeDate = '',
  [string]$Message = ''
)

$ErrorActionPreference = 'Stop'
$siteUrl = 'https://urmylucky-daily-review.xuanlinliu85.chatgpt.site'
$token = [Environment]::GetEnvironmentVariable('REFRESH_WORKER_TOKEN', 'User')
if (-not $token) { $token = $env:REFRESH_WORKER_TOKEN }
if (-not $token) { throw 'REFRESH_WORKER_TOKEN is not configured for the current Windows user.' }

$headers = @{ 'x-refresh-worker-token' = $token }
if ($Action -eq 'Poll') {
  $response = Invoke-RestMethod -Method Get -Uri "$siteUrl/api/refresh" -Headers $headers -TimeoutSec 30
  $response | ConvertTo-Json -Depth 8 -Compress
  exit 0
}

if ($Id -le 0) { throw 'A positive refresh request Id is required.' }
$status = $Action.ToLowerInvariant()
$payload = @{
  id = $Id
  status = $status
  message = $Message
}
if ($TradeDate -match '^\d{4}-\d{2}-\d{2}$') { $payload.resultTradeDate = $TradeDate }

$response = Invoke-RestMethod -Method Patch -Uri "$siteUrl/api/refresh" -Headers $headers -ContentType 'application/json; charset=utf-8' -Body ($payload | ConvertTo-Json -Compress) -TimeoutSec 30
$response | ConvertTo-Json -Depth 8 -Compress
