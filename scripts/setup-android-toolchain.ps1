$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$toolsRoot = Join-Path $repoRoot ".android-tools"
$downloadDir = Join-Path $toolsRoot "downloads"
$jdkRoot = Join-Path $toolsRoot "jdk"
$sdkRoot = Join-Path $toolsRoot "sdk"
$cmdlineToolsRoot = Join-Path $sdkRoot "cmdline-tools"
$cmdlineLatest = Join-Path $cmdlineToolsRoot "latest"

New-Item -ItemType Directory -Force -Path $downloadDir, $jdkRoot, $sdkRoot, $cmdlineToolsRoot | Out-Null

function Expand-ZipFresh {
  param(
    [Parameter(Mandatory = $true)][string]$ZipPath,
    [Parameter(Mandatory = $true)][string]$Destination
  )

  if (Test-Path $Destination) {
    Remove-Item -LiteralPath $Destination -Recurse -Force
  }

  New-Item -ItemType Directory -Force -Path $Destination | Out-Null
  Expand-Archive -LiteralPath $ZipPath -DestinationPath $Destination -Force
}

function Format-CmdArgument {
  param(
    [Parameter(Mandatory = $true)][string]$Value
  )

  '"' + $Value.Replace('"', '\"') + '"'
}

function Invoke-SdkManagerCommand {
  param(
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [string]$InputText = ""
  )

  $quotedSdkManager = Format-CmdArgument -Value $sdkManager
  $quotedArguments = $Arguments | ForEach-Object { Format-CmdArgument -Value $_ }
  $command = "$quotedSdkManager $($quotedArguments -join ' ')"

  if ($InputText) {
    $InputText | cmd.exe /d /s /c $command
  } else {
    cmd.exe /d /s /c $command
  }

  return $LASTEXITCODE
}

function Test-RequiredSdkPackages {
  $requiredPaths = @(
    (Join-Path $sdkRoot "platform-tools"),
    (Join-Path $sdkRoot "platforms\android-36"),
    (Join-Path $sdkRoot "build-tools\36.0.0")
  )

  foreach ($requiredPath in $requiredPaths) {
    if (-not (Test-Path $requiredPath)) {
      return $false
    }
  }

  return $true
}

if (-not (Test-Path (Join-Path $jdkRoot "bin\java.exe"))) {
  $jdkZip = Join-Path $downloadDir "temurin-jdk-21.zip"
  if (-not (Test-Path $jdkZip)) {
    Write-Host "Downloading JDK 21 to local Android toolchain directory..."
    Invoke-WebRequest `
      -Uri "https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jdk/hotspot/normal/eclipse?project=jdk" `
      -OutFile $jdkZip
  }

  $jdkExtract = Join-Path $downloadDir "jdk-extract"
  Expand-ZipFresh -ZipPath $jdkZip -Destination $jdkExtract
  $jdkFolder = Get-ChildItem -LiteralPath $jdkExtract -Directory | Select-Object -First 1
  if (-not $jdkFolder) {
    throw "JDK archive did not contain an extracted folder."
  }

  if (Test-Path $jdkRoot) {
    Remove-Item -LiteralPath $jdkRoot -Recurse -Force
  }
  Move-Item -LiteralPath $jdkFolder.FullName -Destination $jdkRoot
  Remove-Item -LiteralPath $jdkExtract -Recurse -Force
}

if (-not (Test-Path (Join-Path $cmdlineLatest "bin\sdkmanager.bat"))) {
  $repoXml = Join-Path $downloadDir "repository2-1.xml"
  Invoke-WebRequest -Uri "https://dl.google.com/android/repository/repository2-1.xml" -OutFile $repoXml
  [xml]$xml = Get-Content $repoXml
  $package = $xml."sdk-repository"."remotePackage" | Where-Object { $_.path -eq "cmdline-tools;latest" }
  $archive = $package.archives.archive | Where-Object { $_."host-os" -eq "windows" } | Select-Object -First 1
  if (-not $archive) {
    throw "Could not find Android command-line tools for Windows."
  }

  $relativeUrl = $archive.complete.url
  $cmdlineZip = Join-Path $downloadDir $relativeUrl
  if (-not (Test-Path $cmdlineZip)) {
    Write-Host "Downloading Android command-line tools to local Android toolchain directory..."
    Invoke-WebRequest -Uri "https://dl.google.com/android/repository/$relativeUrl" -OutFile $cmdlineZip
  }

  $cmdlineExtract = Join-Path $downloadDir "cmdline-tools-extract"
  Expand-ZipFresh -ZipPath $cmdlineZip -Destination $cmdlineExtract
  $inner = Join-Path $cmdlineExtract "cmdline-tools"

  if (Test-Path $cmdlineLatest) {
    Remove-Item -LiteralPath $cmdlineLatest -Recurse -Force
  }

  New-Item -ItemType Directory -Force -Path $cmdlineLatest | Out-Null
  Copy-Item -Path (Join-Path $inner "*") -Destination $cmdlineLatest -Recurse -Force
  Remove-Item -LiteralPath $cmdlineExtract -Recurse -Force
}

$env:JAVA_HOME = $jdkRoot
$env:ANDROID_HOME = $sdkRoot
$env:ANDROID_SDK_ROOT = $sdkRoot
$env:GRADLE_USER_HOME = Join-Path $repoRoot ".gradle-home"
$env:Path = "$jdkRoot\bin;$cmdlineLatest\bin;$sdkRoot\platform-tools;$env:Path"

New-Item -ItemType Directory -Force -Path $env:GRADLE_USER_HOME | Out-Null

$sdkManager = Join-Path $cmdlineLatest "bin\sdkmanager.bat"

Write-Host "Installing Android SDK packages..."
$installExitCode = Invoke-SdkManagerCommand -Arguments @(
  "--sdk_root=$sdkRoot",
  "platform-tools",
  "platforms;android-36",
  "build-tools;36.0.0"
)
if ($installExitCode -ne 0) {
  if (Test-RequiredSdkPackages) {
    Write-Warning "sdkmanager exited with code $installExitCode after installing required SDK packages. Continuing because all required package directories exist."
  } else {
    throw "sdkmanager package install failed."
  }
}

Write-Host "Accepting Android SDK licenses..."
$licenseInput = ("y`n" * 100)
$licenseExitCode = Invoke-SdkManagerCommand -Arguments @("--sdk_root=$sdkRoot", "--licenses") -InputText $licenseInput
if ($licenseExitCode -ne 0) {
  throw "sdkmanager license acceptance failed."
}

Write-Host "Android toolchain ready."
Write-Host "JAVA_HOME=$jdkRoot"
Write-Host "ANDROID_SDK_ROOT=$sdkRoot"
Write-Host "GRADLE_USER_HOME=$env:GRADLE_USER_HOME"
