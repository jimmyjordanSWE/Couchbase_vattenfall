Param(
  [string]$Config = "pipeline/pipeline.config.json"
)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$launcher = Join-Path $root "pipeline/launcher.mjs"

if (!(Test-Path $launcher)) {
  Write-Error "Launcher not found: $launcher"
  exit 1
}

if (!(Test-Path (Join-Path $root $Config))) {
  Write-Error "Config not found: $Config"
  exit 1
}

Push-Location (Join-Path $root "pipeline")
try {
  Write-Host "Building 02-edge-app..."
  Push-Location "02-edge-app"
  try {
    npm.cmd run build
    if ($LASTEXITCODE -ne 0) {
      throw "Build failed for 02-edge-app"
    }
  } finally {
    Pop-Location
  }

  Write-Host "Starting pipeline launcher..."
  node "launcher.mjs"
} finally {
  Pop-Location
}
