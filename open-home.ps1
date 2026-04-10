param(
  [switch]$Build,
  [int]$TimeoutSeconds = 180,
  [switch]$NoBrowser,
  [switch]$PreferLocal
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

$dockerAvailable = [bool](Get-Command docker -ErrorAction SilentlyContinue)
$serverProcess = $null

if ($dockerAvailable -and -not $PreferLocal) {
  if ($Build) {
    docker compose up -d --build
  } else {
    docker compose up -d
  }

  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
} else {
  if ($Build) {
    Write-Host "-Build is ignored in local mode." -ForegroundColor Yellow
  }

  if (-not $dockerAvailable) {
    Write-Host "Docker not found. Switching to local mode." -ForegroundColor Yellow
  }

  $runProjectScript = Join-Path $projectRoot "run-project.ps1"
  if (-not (Test-Path $runProjectScript)) {
    Write-Error "Cannot find run-project.ps1 in project root."
    exit 1
  }

  $runArgs = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", $runProjectScript,
    "-Mode", "start"
  )

  $serverProcess = Start-Process -FilePath "powershell" -ArgumentList $runArgs -WorkingDirectory $projectRoot -PassThru
}

$healthUrl = "http://localhost:3000/health"
$homeUrl = "http://localhost:3000"
$deadline = (Get-Date).AddSeconds([Math]::Max(10, $TimeoutSeconds))
$ready = $false
$dbHealthy = $false

while ((Get-Date) -lt $deadline) {
  if ($serverProcess -and $serverProcess.HasExited) {
    Write-Error "Local server process exited before startup completed."
    exit 1
  }

  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $healthUrl -TimeoutSec 5
    if ($response.StatusCode -eq 200 -and $response.Content -match '"ok"\s*:\s*true') {
      $ready = $true
      $dbHealthy = $true
      break
    }
  } catch {
    # Continue waiting.
  }

  try {
    $homeResponse = Invoke-WebRequest -UseBasicParsing -Uri $homeUrl -TimeoutSec 5
    if ($homeResponse.StatusCode -ge 200 -and $homeResponse.StatusCode -lt 400) {
      $ready = $true
      break
    }
  } catch {
    # Continue waiting.
  }

  [System.Threading.Thread]::Sleep(1500)
}

if (-not $ready) {
  if ($dockerAvailable -and -not $PreferLocal) {
    Write-Error "Service did not become ready before timeout. Check logs: docker compose logs --tail=120 backend"
  } else {
    Write-Error "Service did not become ready before timeout. Check console output from run-project.ps1."
  }
  exit 1
}

if (-not $NoBrowser) {
  Start-Process $homeUrl
}

if ($dbHealthy) {
  Write-Host "Service is ready at http://localhost:3000" -ForegroundColor Green
} else {
  Write-Host "Homepage is available at http://localhost:3000 (database may still be unavailable)." -ForegroundColor Yellow
}