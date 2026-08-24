$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$deployDir = Join-Path $root "deploy\aliyun-fc"
$stageDir = Join-Path $deployDir "fc-upload-v04"
$zipPath = Join-Path $deployDir "ai-translator-fc-v04.zip"
$fcBuildDir = Join-Path $root ".fc-build"

Set-Location $root

if (Test-Path $stageDir) {
  Remove-Item -LiteralPath $stageDir -Recurse -Force
}

if (Test-Path $fcBuildDir) {
  Remove-Item -LiteralPath $fcBuildDir -Recurse -Force
}

function Invoke-CheckedCommand {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$Arguments
  )

  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed: $FilePath $($Arguments -join ' ')"
  }
}

Invoke-CheckedCommand "npm" @("run", "build")
Invoke-CheckedCommand "npm" @("run", "build:fc-server")

New-Item -ItemType Directory -Force -Path $stageDir | Out-Null

Copy-Item -Path (Join-Path $root ".next\standalone\*") -Destination $stageDir -Recurse -Force

$nextStaticTarget = Join-Path $stageDir ".next\static"
New-Item -ItemType Directory -Force -Path $nextStaticTarget | Out-Null
Copy-Item -Path (Join-Path $root ".next\static\*") -Destination $nextStaticTarget -Recurse -Force

$publicSource = Join-Path $root "public"
if (Test-Path $publicSource) {
  Copy-Item -Path $publicSource -Destination (Join-Path $stageDir "public") -Recurse -Force
}

Copy-Item -Path (Join-Path $root "app") -Destination (Join-Path $stageDir "app") -Recurse -Force
Copy-Item -Path (Join-Path $fcBuildDir "server") -Destination (Join-Path $stageDir "server") -Recurse -Force
Copy-Item -Path (Join-Path $fcBuildDir "lib") -Destination (Join-Path $stageDir "lib") -Recurse -Force

$cloudServerFile = Join-Path $stageDir "server\cloud-server.js"
$realtimeProxyFile = Join-Path $stageDir "server\realtime-proxy.js"

if (!(Test-Path -LiteralPath $cloudServerFile -PathType Leaf)) {
  throw "Missing deployment file: server/cloud-server.js"
}

if (!(Test-Path -LiteralPath $realtimeProxyFile -PathType Leaf)) {
  throw "Missing deployment file: server/realtime-proxy.js"
}

foreach ($moduleName in @("next", "ws", "dotenv")) {
  $moduleSource = Join-Path $root "node_modules\$moduleName"
  $moduleTarget = Join-Path $stageDir "node_modules\$moduleName"

  if (!(Test-Path $moduleSource)) {
    throw "Missing node module: $moduleName. Run npm install first."
  }

  New-Item -ItemType Directory -Force -Path (Split-Path $moduleTarget) | Out-Null
  if (Test-Path $moduleTarget) {
    Remove-Item -LiteralPath $moduleTarget -Recurse -Force
  }
  Copy-Item -Path $moduleSource -Destination $moduleTarget -Recurse -Force
}

if (Test-Path (Join-Path $root "translation-glossary.json")) {
  Copy-Item -Path (Join-Path $root "translation-glossary.json") -Destination (Join-Path $stageDir "translation-glossary.json") -Force
}

$packageJson = @'
{
  "name": "ai-portable-interpreter-fc",
  "private": true,
  "scripts": {
    "start:fc": "NODE_ENV=production HOSTNAME=0.0.0.0 PORT=${FC_SERVER_PORT:-9000} REALTIME_PROXY_PATH=${REALTIME_PROXY_PATH:-/realtime} node server/cloud-server.js"
  }
}
'@
[System.IO.File]::WriteAllText(
  (Join-Path $stageDir "package.json"),
  $packageJson,
  [System.Text.UTF8Encoding]::new($false)
)

$bootstrap = @'
#!/bin/sh
export NODE_ENV=production
export HOSTNAME=0.0.0.0
export PORT=${FC_SERVER_PORT:-9000}
export REALTIME_PROXY_PATH=${REALTIME_PROXY_PATH:-/realtime}
npm run start:fc
'@
[System.IO.File]::WriteAllText(
  (Join-Path $stageDir "bootstrap"),
  $bootstrap,
  [System.Text.UTF8Encoding]::new($false)
)

if (Test-Path $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}

Compress-Archive -Path (Join-Path $stageDir "*") -DestinationPath $zipPath -Force

Write-Host "Function Compute ZIP package created:"
Write-Host $zipPath
