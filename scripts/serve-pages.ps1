param(
  [int]$Port = 4000,
  [string]$BindAddress = "127.0.0.1",
  [switch]$SkipBuild
)

. (Join-Path $PSScriptRoot "pages-env.ps1")

if (-not $SkipBuild) {
  & (Join-Path $ScriptDir "build-pages.ps1")
}

if (-not (Test-Path (Join-Path $SitePath "index.html"))) {
  throw "No built site was found. Run scripts/build-pages.ps1 first."
}

$Python = Get-PythonInvocation
$PythonCommand = $Python.Command
$PythonArgs = @($Python.Arguments) + @("-m", "http.server", "$Port", "--bind", $BindAddress, "--directory", $SitePath)

Write-Host "Serving $SitePath"
Write-Host "Open http://$BindAddress`:$Port"
& $PythonCommand @PythonArgs
