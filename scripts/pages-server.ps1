. (Join-Path $PSScriptRoot "pages-env.ps1")

function Get-Sha256ForFile {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  $Sha = [System.Security.Cryptography.SHA256]::Create()
  $Stream = [System.IO.File]::OpenRead($Path)
  try {
    return ([BitConverter]::ToString($Sha.ComputeHash($Stream)) -replace '-', '').ToLowerInvariant()
  } finally {
    $Stream.Dispose()
    $Sha.Dispose()
  }
}

function Get-PagesRoutePath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Route
  )

  $CleanRoute = ($Route -split "\?")[0]
  if (-not $CleanRoute -or $CleanRoute -eq "/") {
    return Join-Path $SitePath "index.html"
  }

  $RelativeRoute = $CleanRoute.TrimStart("/")
  if ($CleanRoute.EndsWith("/")) {
    return Join-Path $SitePath (Join-Path $RelativeRoute "index.html")
  }

  return Join-Path $SitePath $RelativeRoute
}

function Test-PagesServerFreshness {
  param(
    [string]$BaseUri = "http://127.0.0.1:4000",
    [string[]]$Routes = @("/", "/assets/css/main.css", "/assets/js/main.min.js", "/hobbies/")
  )

  $Results = New-Object System.Collections.Generic.List[object]
  $Failures = New-Object System.Collections.Generic.List[string]
  $RunId = "{0}-{1}" -f $PID, ([System.Guid]::NewGuid().ToString("N"))
  $TempDir = Join-Path $ToolCachePath ("server-freshness-$RunId")
  New-Item -ItemType Directory -Force -Path $TempDir | Out-Null

  foreach ($Route in $Routes) {
    $GeneratedPath = Get-PagesRoutePath -Route $Route
    if (-not (Test-Path -LiteralPath $GeneratedPath -PathType Leaf)) {
      $Failures.Add("Generated file for route $Route was not found at $GeneratedPath")
      continue
    }

    $SafeName = ($Route.Trim("/") -replace '[\\/:"*?<>|]+', "_")
    if (-not $SafeName) {
      $SafeName = "index"
    }

    $DownloadPath = Join-Path $TempDir ("{0}.served" -f $SafeName)
    $Uri = "$BaseUri$Route"
    Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec 15 -OutFile $DownloadPath

    $DiskHash = Get-Sha256ForFile -Path $GeneratedPath
    $ServedHash = Get-Sha256ForFile -Path $DownloadPath
    $Fresh = $DiskHash -eq $ServedHash

    if (-not $Fresh) {
      $Failures.Add("Served route $Route does not match $GeneratedPath")
    }

    $Results.Add([pscustomobject]@{
      route = $Route
      generatedPath = $GeneratedPath
      servedSha256 = "sha256:$ServedHash"
      diskSha256 = "sha256:$DiskHash"
      fresh = $Fresh
    })
  }

  return [pscustomobject]@{
    fresh = $Failures.Count -eq 0
    failures = @($Failures.ToArray())
    routes = @($Results.ToArray())
  }
}

function Start-PagesServer {
  param(
    [int]$Port = 4000,
    [string]$BindAddress = "127.0.0.1",
    [int]$StartupTimeoutSeconds = 20,
    [string[]]$FreshnessRoutes = @("/", "/assets/css/main.css", "/assets/js/main.min.js", "/hobbies/")
  )

  if (-not (Test-Path (Join-Path $SitePath "index.html"))) {
    throw "No built site was found. Run scripts/build-pages.ps1 first."
  }

  $BaseUri = "http://$BindAddress`:$Port"
  $Listener = Get-NetTCPConnection -LocalAddress $BindAddress -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  $StartedProcess = $null

  if (-not $Listener) {
    $Python = Get-PythonInvocation
    $PythonCommand = $Python.Command
    $PythonArgs = @($Python.Arguments) + @("-m", "http.server", "$Port", "--bind", $BindAddress, "--directory", $SitePath)

    Write-Host "Starting local server at $BaseUri"
    $ProcessArguments = $PythonArgs | ForEach-Object { ConvertTo-ProcessArgument -Value $_ }
    $StartedProcess = Start-Process -FilePath $PythonCommand -ArgumentList $ProcessArguments -WorkingDirectory $RepoRootPath -PassThru -WindowStyle Hidden

    $Deadline = (Get-Date).AddSeconds($StartupTimeoutSeconds)
    do {
      Start-Sleep -Milliseconds 250
      $Listener = Get-NetTCPConnection -LocalAddress $BindAddress -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    } while (-not $Listener -and (Get-Date) -lt $Deadline)

    if (-not $Listener) {
      throw "Local server did not start at $BaseUri"
    }
  } else {
    Write-Host "Using existing server at $BaseUri"
  }

  $Freshness = Test-PagesServerFreshness -BaseUri $BaseUri -Routes $FreshnessRoutes
  if (-not $Freshness.fresh) {
    if ($StartedProcess -and -not $StartedProcess.HasExited) {
      Stop-Process -Id $StartedProcess.Id -Force -ErrorAction SilentlyContinue
    }
    throw "Local server is not serving the current _site output. $($Freshness.failures -join ' ')"
  }

  return [pscustomobject]@{
    BaseUri = $BaseUri
    Started = $null -ne $StartedProcess
    Process = $StartedProcess
    Freshness = $Freshness
  }
}

function Stop-ExistingPagesServerForBuild {
  param(
    [int]$Port = 4000,
    [string]$BindAddress = "127.0.0.1"
  )

  $Listener = Get-NetTCPConnection -LocalAddress $BindAddress -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if (-not $Listener) {
    return $null
  }

  $Process = Get-CimInstance Win32_Process -Filter "ProcessId = $($Listener.OwningProcess)" -ErrorAction SilentlyContinue
  if (-not $Process) {
    throw "Port $Port is already in use, but the owning process could not be inspected."
  }

  $CommandLine = [string]$Process.CommandLine
  $IsPagesPythonServer = $Process.Name -match "python" -and
    $CommandLine -match "http\.server" -and
    $CommandLine -match "\s$Port(\s|$)" -and
    ($CommandLine -like "*$SitePath*" -or $CommandLine -match "--directory\s+[`"']?_site[`"']?")

  if (-not $IsPagesPythonServer) {
    throw "Port $Port is already in use by process $($Process.ProcessId), and it is not the known local Pages server."
  }

  Stop-Process -Id $Process.ProcessId -Force -ErrorAction Stop
  Write-Host "Stopped existing local Pages server process $($Process.ProcessId) before clean build"

  return [pscustomobject]@{
    ProcessId = $Process.ProcessId
    CommandLine = $CommandLine
  }
}

function Stop-PagesServer {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Server
  )

  if ($Server.Started -and $Server.Process -and -not $Server.Process.HasExited) {
    Stop-Process -Id $Server.Process.Id -Force -ErrorAction SilentlyContinue
    Write-Host "Stopped local server process $($Server.Process.Id)"
  }
}
