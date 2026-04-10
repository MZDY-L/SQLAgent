param(
  [ValidateSet("start", "dev", "test", "check")]
  [string]$Mode = "start",

  [switch]$SkipInstall,

  [switch]$ForcePortableNode
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $projectRoot "backend"
$toolsDir = Join-Path $projectRoot ".tools"
$portableNodeBaseDir = Join-Path $toolsDir "node-portable"

if (-not (Test-Path (Join-Path $backendDir "package.json"))) {
  Write-Error "Cannot find backend/package.json. Please run this script from the auto-build-table root."
  exit 1
}

function Get-PortableNodeTooling {
  if (-not (Test-Path $portableNodeBaseDir)) {
    New-Item -Path $portableNodeBaseDir -ItemType Directory -Force | Out-Null
  }

  $existing = Get-ChildItem -Path $portableNodeBaseDir -Directory -Filter "node-v*-win-x64" -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending |
    Select-Object -First 1

  if (-not $existing) {
    Write-Host "Downloading portable Node.js into project folder..." -ForegroundColor Cyan

    $index = Invoke-RestMethod -Uri "https://nodejs.org/dist/index.json" -TimeoutSec 45
    $release = $index |
      Where-Object { $_.version -like "v20.*" -and $_.files -contains "win-x64-zip" } |
      Select-Object -First 1

    if (-not $release) {
      throw "Could not find a compatible Node.js win-x64 zip release."
    }

    $zipName = "node-$($release.version)-win-x64.zip"
    $zipUrl = "https://nodejs.org/dist/$($release.version)/$zipName"
    $cacheDir = Join-Path $toolsDir "downloads"

    if (-not (Test-Path $cacheDir)) {
      New-Item -Path $cacheDir -ItemType Directory -Force | Out-Null
    }

    $zipPath = Join-Path $cacheDir $zipName
    if (-not (Test-Path $zipPath)) {
      Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -UseBasicParsing
    }

    Expand-Archive -Path $zipPath -DestinationPath $portableNodeBaseDir -Force

    $existing = Get-ChildItem -Path $portableNodeBaseDir -Directory -Filter "node-v*-win-x64" -ErrorAction SilentlyContinue |
      Sort-Object Name -Descending |
      Select-Object -First 1

    if (-not $existing) {
      throw "Portable Node.js extraction failed."
    }
  }

  $nodeExe = Join-Path $existing.FullName "node.exe"
  $npmCli = Join-Path $existing.FullName "node_modules\npm\bin\npm-cli.js"

  if (-not (Test-Path $nodeExe) -or -not (Test-Path $npmCli)) {
    throw "Portable Node.js files are incomplete."
  }

  return @{
    nodeExe = $nodeExe
    npmCli = $npmCli
    source = "portable"
  }
}

function Resolve-NodeTooling {
  $systemNode = Get-Command node -ErrorAction SilentlyContinue
  $systemNpm = Get-Command npm -ErrorAction SilentlyContinue

  if (-not $ForcePortableNode -and $systemNode -and $systemNpm) {
    return @{
      useSystem = $true
      nodeExe = $systemNode.Source
      npmCommand = "npm"
      source = "system"
    }
  }

  return Get-PortableNodeTooling
}

$nodeTooling = Resolve-NodeTooling

if ($nodeTooling.source -eq "portable") {
  Write-Host "Using portable Node.js from project folder." -ForegroundColor Cyan
  Write-Host "Node path: $($nodeTooling.nodeExe)" -ForegroundColor DarkGray

  $portableNodeDir = Split-Path -Parent $nodeTooling.nodeExe
  if ($env:Path -notlike "$portableNodeDir*") {
    $env:Path = "$portableNodeDir;$env:Path"
  }
}

function Invoke-Npm {
  param(
    [string[]]$Arguments
  )

  if ($nodeTooling.useSystem) {
    & $nodeTooling.npmCommand @Arguments
  } else {
    & $nodeTooling.nodeExe $nodeTooling.npmCli @Arguments
  }

  return $LASTEXITCODE
}

Set-Location $backendDir

$envFile = Join-Path $backendDir ".env"
$envExample = Join-Path $backendDir ".env.example"

if (-not (Test-Path $envFile)) {
  Write-Host "Missing .env file in backend directory." -ForegroundColor Yellow
  if (Test-Path $envExample) {
    Write-Host "Create it with: Copy-Item .env.example .env" -ForegroundColor Yellow
  }
  exit 1
}

if (-not $SkipInstall -and -not (Test-Path (Join-Path $backendDir "node_modules"))) {
  Write-Host "Installing dependencies..." -ForegroundColor Cyan
  $installExit = Invoke-Npm -Arguments @("install")
  if ($installExit -ne 0) {
    exit $installExit
  }
}

Write-Host "Running npm run $Mode ..." -ForegroundColor Cyan
$runExit = Invoke-Npm -Arguments @("run", $Mode)
exit $runExit