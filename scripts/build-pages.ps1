param(
  [switch]$SkipSetup,
  [switch]$NoClean,
  [string]$Environment = "production"
)

. (Join-Path $PSScriptRoot "pages-env.ps1")

if (-not $SkipSetup) {
  & (Join-Path $ScriptDir "setup-pages.ps1")
}

if (-not $NoClean) {
  if (Test-Path $SitePath) {
    $ResolvedSitePath = Resolve-Path $SitePath
    if (-not $ResolvedSitePath.Path.StartsWith($RepoRootPath, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "Refusing to remove unexpected site path $ResolvedSitePath"
    }
    Remove-Item -LiteralPath $ResolvedSitePath -Recurse -Force
  }
}

$env:JEKYLL_ENV = $Environment
$ConfigFiles = @(
  (Join-Path $RepoRootPath "_config.yml"),
  (Join-Path $RepoRootPath "_config.local.yml")
) | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf }
$ConfigArgument = $ConfigFiles -join ","

Write-Host "Building GitHub Pages site with JEKYLL_ENV=$Environment"
Write-Host "Using Jekyll config $ConfigArgument"
Invoke-Native { & bundle exec jekyll build --safe --trace --config $ConfigArgument }

$IndexPath = Join-Path $RepoRootPath "_site/index.html"
if (-not (Test-Path $IndexPath)) {
  throw "Build completed but _site/index.html was not created."
}

Write-Host "Build output is ready at $((Resolve-Path $SitePath).Path)"
