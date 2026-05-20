# Rate-limit smoke test (Windows PowerShell)
#
# Fires BURST_COUNT empty-body POSTs at /api/leads/intake. Each request:
#   - passes auth (real API key)
#   - is counted by the rate limiter
#   - fails at body validation (400 rejected_validation)  ← no DNC call burned
#
# Once the configured rate_limit_per_minute is exceeded, subsequent requests
# return 429 rejected_rate_limit. Script PASSes if any 429 is observed.
#
# Run:
#   pwsh ./rate-limit.ps1
# or
#   powershell -ExecutionPolicy Bypass -File ./rate-limit.ps1

$ErrorActionPreference = 'Stop'

$envPath = Join-Path $PSScriptRoot '.env'
if (-not (Test-Path $envPath)) {
  Write-Host "Missing .env. Copy .env.example to .env in this folder and fill it in." -ForegroundColor Red
  exit 1
}

Get-Content $envPath | ForEach-Object {
  $line = $_.Trim()
  if ($line -eq '' -or $line.StartsWith('#')) { return }
  if ($line -match '^([^=]+)=(.*)$') {
    [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), 'Process')
  }
}

$hostUrl = $env:HOST
$apiKey  = $env:API_KEY
$burst   = if ($env:BURST_COUNT) { [int]$env:BURST_COUNT } else { 25 }

if (-not $hostUrl -or -not $apiKey -or $apiKey -eq 'pk_live_REPLACE_ME') {
  Write-Host "HOST and API_KEY must be set to real values in .env" -ForegroundColor Red
  exit 1
}

Write-Host "Firing $burst empty-body POSTs at $hostUrl/api/leads/intake"
Write-Host ""

$counts = @{}
for ($i = 1; $i -le $burst; $i++) {
  $code = & curl.exe -s -o NUL -w '%{http_code}' -X POST "$hostUrl/api/leads/intake" `
    -H "Authorization: Bearer $apiKey" `
    -H "Content-Type: application/json" `
    -d '{}'
  $code = [int]$code
  if (-not $counts.ContainsKey($code)) { $counts[$code] = 0 }
  $counts[$code]++
  $marker = if ($code -eq 429) { ' ← rate limited' } elseif ($code -eq 400) { '' } else { ' ← unexpected' }
  Write-Host "[$i/$burst] HTTP $code$marker"
}

Write-Host ""
Write-Host "Status distribution:"
$counts.GetEnumerator() | Sort-Object Name | ForEach-Object {
  Write-Host ("  {0}: {1}" -f $_.Key, $_.Value)
}

if ($counts.ContainsKey(429) -and $counts[429] -gt 0) {
  Write-Host ""
  Write-Host "Rate limit triggered ($($counts[429]) x 429). PASS." -ForegroundColor Green
  exit 0
} else {
  Write-Host ""
  Write-Host "No 429 responses observed. Either the key's rate_limit_per_minute" -ForegroundColor Yellow
  Write-Host "is set higher than BURST_COUNT ($burst), or the rate limiter is not engaged." -ForegroundColor Yellow
  exit 1
}
