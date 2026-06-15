param(
  [int]$Port = 4000,
  [string]$BindAddress = "127.0.0.1",
  [switch]$SkipBuild,
  [int]$StartupTimeoutSeconds = 20
)

. (Join-Path $PSScriptRoot "pages-env.ps1")
. (Join-Path $PSScriptRoot "pages-server.ps1")

if (-not $SkipBuild) {
  & (Join-Path $ScriptDir "build-pages.ps1")
}

$BaseUri = "http://$BindAddress`:$Port"
$Server = Start-PagesServer -Port $Port -BindAddress $BindAddress -StartupTimeoutSeconds $StartupTimeoutSeconds

try {
  $Routes = @(
    "/",
    "/links.html",
    "/certifications/",
    "/hobbies/",
    "/soldering-101/",
    "/feed.xml",
    "/assets/css/main.css",
    "/assets/js/main.min.js",
    "/assets/js/theme-mode.js"
  )

  foreach ($Route in $Routes) {
    $Uri = "$BaseUri$Route"
    $Response = Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec 15
    if ($Response.StatusCode -lt 200 -or $Response.StatusCode -ge 400) {
      throw "Smoke check failed for $Uri with status $($Response.StatusCode)"
    }
    Write-Host "OK $($Response.StatusCode) $Route"
  }

  $HomeResponse = Invoke-WebRequest -Uri "$BaseUri/" -UseBasicParsing -TimeoutSec 15
  if ($HomeResponse.Content -notmatch "MohammadMahdi Javid") {
    throw "Home page content check failed."
  }

  Write-Host "Smoke checks passed at $BaseUri"
} finally {
  Stop-PagesServer -Server $Server
}
