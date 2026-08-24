param(
  [string]$RealtimeProxyUrl = $env:REALTIME_PROXY_URL
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RealtimeProxyUrl)) {
  throw "RealtimeProxyUrl is required. Pass -RealtimeProxyUrl or set REALTIME_PROXY_URL to your Gateway WSS URL."
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

Write-Host "Building static mobile app bundle..."
$env:NEXT_OUTPUT = "export"
$env:NEXT_PUBLIC_REALTIME_PROXY_URL = $RealtimeProxyUrl.Trim()
npm run build

if (-not (Test-Path (Join-Path $repoRoot "android"))) {
  Write-Host "Creating Android project..."
  npx cap add android
}

Write-Host "Syncing Android project..."
npx cap sync android

Write-Host "Android app project is ready."
Write-Host "Realtime proxy URL: $($RealtimeProxyUrl.Trim())"
