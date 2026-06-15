param(
  [string]$BaseUri = "http://127.0.0.1:4000",
  [int]$Port = 4000,
  [string]$BindAddress = "127.0.0.1",
  [ValidateSet("Auto", "Chrome", "Edge", "Chromium")]
  [string]$Browser = "Auto",
  [string]$OutputDirectory = "",
  [switch]$SkipBuild,
  [switch]$SkipBrowser,
  [switch]$SkipScreenshots,
  [switch]$SkipVisualValidation,
  [string]$VisualBaselineDirectory = "",
  [decimal]$MaxPixelDiffPercent = 0.3,
  [switch]$UpdateVisualBaselines,
  [switch]$RequireVisualBaselines,
  [switch]$KeepServer
)

. (Join-Path $PSScriptRoot "pages-env.ps1")
. (Join-Path $PSScriptRoot "pages-server.ps1")

if (-not $SkipBuild) {
  $BuildArgs = @{
    SkipSetup = $true
  }

  $ExistingServerForBuild = Get-NetTCPConnection -LocalAddress $BindAddress -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($ExistingServerForBuild) {
    Write-Host "Existing local server detected at http://$BindAddress`:$Port"
    Write-Host "Building without deleting _site so the server can stay attached"
    $BuildArgs.NoClean = $true
  }

  & (Join-Path $ScriptDir "build-pages.ps1") @BuildArgs
}

& (Join-Path $ScriptDir "verify-pages-output.ps1") -SkipBuild
$Server = Start-PagesServer -Port $Port -BindAddress $BindAddress

try {
  & (Join-Path $ScriptDir "smoke-pages.ps1") -SkipBuild -Port $Port -BindAddress $BindAddress

  if (-not $SkipBrowser) {
    $BrowserArgs = @{
      BaseUri = $BaseUri
      Browser = $Browser
    }

    if ($OutputDirectory) {
      $BrowserArgs.OutputDirectory = $OutputDirectory
    }

    if ($SkipScreenshots) {
      $BrowserArgs.SkipScreenshots = $true
    }

    if ($SkipVisualValidation) {
      $BrowserArgs.SkipVisualValidation = $true
    }

    if ($VisualBaselineDirectory) {
      $BrowserArgs.VisualBaselineDirectory = $VisualBaselineDirectory
    }

    if ($UpdateVisualBaselines) {
      $BrowserArgs.UpdateVisualBaselines = $true
    }

    if ($RequireVisualBaselines) {
      $BrowserArgs.RequireVisualBaselines = $true
    }

    $BrowserArgs.MaxPixelDiffPercent = $MaxPixelDiffPercent

    & (Join-Path $ScriptDir "verify-browser-pages.ps1") @BrowserArgs
  }
} finally {
  if (-not $KeepServer) {
    Stop-PagesServer -Server $Server
  }
}

Write-Host "Pages verification passed"
