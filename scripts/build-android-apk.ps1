param(
  [string]$RealtimeProxyUrl = $env:REALTIME_PROXY_URL
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$toolsRoot = Join-Path $repoRoot ".android-tools"
$jdkRoot = Join-Path $toolsRoot "jdk"
$sdkRoot = Join-Path $toolsRoot "sdk"
$cmdlineLatest = Join-Path $sdkRoot "cmdline-tools\latest"
$gradleHome = Join-Path $repoRoot ".gradle-home"

if (-not (Test-Path (Join-Path $jdkRoot "bin\java.exe")) -or -not (Test-Path (Join-Path $cmdlineLatest "bin\sdkmanager.bat"))) {
  & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "setup-android-toolchain.ps1")
  if ($LASTEXITCODE -ne 0) {
    throw "Android toolchain setup failed."
  }
}

$env:JAVA_HOME = $jdkRoot
$env:ANDROID_HOME = $sdkRoot
$env:ANDROID_SDK_ROOT = $sdkRoot
$env:GRADLE_USER_HOME = $gradleHome
$env:Path = "$jdkRoot\bin;$cmdlineLatest\bin;$sdkRoot\platform-tools;$env:Path"

Set-Location $repoRoot
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "build-android-app.ps1") -RealtimeProxyUrl $RealtimeProxyUrl

Set-Location (Join-Path $repoRoot "android")
.\gradlew.bat --no-daemon assembleDebug
if ($LASTEXITCODE -ne 0) {
  throw "Android APK build failed."
}

$apkPath = Join-Path $repoRoot "android\app\build\outputs\apk\debug\app-debug.apk"
if (-not (Test-Path $apkPath)) {
  throw "APK was not created at $apkPath"
}

Write-Host "APK created: $apkPath"
