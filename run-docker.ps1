param(
  [ValidateSet("up", "down", "logs", "ps", "reset")]
  [string]$Mode = "up",

  [switch]$Build
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Error "Docker is not installed or not in PATH."
  exit 1
}

switch ($Mode) {
  "up" {
    if ($Build) {
      docker compose up -d --build
    } else {
      docker compose up -d
    }
    exit $LASTEXITCODE
  }
  "down" {
    docker compose down
    exit $LASTEXITCODE
  }
  "logs" {
    docker compose logs -f backend
    exit $LASTEXITCODE
  }
  "ps" {
    docker compose ps
    exit $LASTEXITCODE
  }
  "reset" {
    docker compose down -v --remove-orphans
    exit $LASTEXITCODE
  }
}