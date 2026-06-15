param(
  [ValidateSet("Serve", "Smoke", "Build")]
  [string]$Mode = "Serve",
  [int]$Port = 4000,
  [string]$BindAddress = "127.0.0.1",
  [switch]$SkipBuild,
  [switch]$SkipSetup,
  [switch]$NoClean,
  [string]$Environment = "production"
)

. (Join-Path $PSScriptRoot "pages-env.ps1")

$BuildScript = Join-Path $ScriptDir "build-pages.ps1"
$ServeScript = Join-Path $ScriptDir "serve-pages.ps1"
$SmokeScript = Join-Path $ScriptDir "smoke-pages.ps1"

foreach ($RequiredScript in @($BuildScript, $ServeScript, $SmokeScript)) {
  if (-not (Test-Path $RequiredScript)) {
    throw "Required script was not found at $RequiredScript"
  }
}

function Invoke-LocalBuild {
  $BuildArgs = @{
    Environment = $Environment
  }
  if ($SkipSetup) {
    $BuildArgs.SkipSetup = $true
  }
  if ($NoClean) {
    $BuildArgs.NoClean = $true
  }

  & $BuildScript @BuildArgs
}

switch ($Mode) {
  "Build" {
    Invoke-LocalBuild
  }
  "Smoke" {
    $SmokeArgs = @{
      Port = $Port
      BindAddress = $BindAddress
    }
    if ($SkipBuild) {
      $SmokeArgs.SkipBuild = $true
    }
    & $SmokeScript @SmokeArgs
  }
  "Serve" {
    if (-not $SkipBuild) {
      Invoke-LocalBuild
    }
    & $ServeScript -Port $Port -BindAddress $BindAddress -SkipBuild
  }
}
