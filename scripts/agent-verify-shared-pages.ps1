param(
  [Parameter(Mandatory = $true)]
  [string]$AgentId,
  [ValidateSet("Auto", "Chrome", "Edge", "Chromium")]
  [string]$Browser = "Auto",
  [string]$OutputDirectory = "",
  [int]$ReadyTimeoutSeconds = 180,
  [int]$LockTimeoutSeconds = 300,
  [Alias("Fast")]
  [switch]$SkipBrowser,
  [switch]$SkipScreenshots,
  [switch]$SkipVisualValidation,
  [switch]$AllowMissingVisualBaselines
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot "pages-env.ps1")
. (Join-Path $PSScriptRoot "pages-server.ps1")

$Port = 4000
$BindAddress = "127.0.0.1"
$BaseUri = "http://127.0.0.1:4000"
$RuntimeDirectory = Join-Path $RepoRootPath ".agent-runtime"
$StatusPath = Join-Path $RuntimeDirectory "pages-shared-server-status.json"
$LockPath = Join-Path $RuntimeDirectory "site-read-write.lock"

function Read-PagesStatus {
  if (-not (Test-Path -LiteralPath $StatusPath -PathType Leaf)) {
    return $null
  }

  try {
    return Get-Content -LiteralPath $StatusPath -Raw | ConvertFrom-Json
  } catch {
    return $null
  }
}

function Test-CoordinatorProcessAlive {
  param([object]$Status)

  if (-not $Status -or -not $Status.processId) {
    return $false
  }

  $Process = Get-Process -Id ([int]$Status.processId) -ErrorAction SilentlyContinue
  return $null -ne $Process
}

function Wait-PagesReadyStatus {
  param([datetime]$Deadline)

  do {
    $Status = Read-PagesStatus
    if ($Status) {
      if ($Status.state -eq "failed") {
        throw "Shared Pages coordinator reports a failed build: $($Status.error)"
      }

      if ($Status.state -eq "ready" -and $Status.buildId -and [int]$Status.port -eq $Port) {
        if (-not (Test-CoordinatorProcessAlive -Status $Status)) {
          throw "Shared Pages status file exists, but coordinator process $($Status.processId) is not running. Start scripts\pages-shared-server.ps1."
        }
        return $Status
      }
    }

    Start-Sleep -Milliseconds 500
  } while ((Get-Date) -lt $Deadline)

  throw "Timed out waiting for shared Pages server readiness at $StatusPath"
}

function Open-SiteReadWriteLock {
  param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("Shared", "Exclusive")]
    [string]$Mode,
    [int]$TimeoutSeconds = 300
  )

  if (-not (Test-Path -LiteralPath $LockPath -PathType Leaf)) {
    throw "Shared Pages lock file does not exist at $LockPath. Start scripts\pages-shared-server.ps1 first."
  }

  $Deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    try {
      if ($Mode -eq "Exclusive") {
        return [System.IO.File]::Open($LockPath, [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
      }

      return [System.IO.File]::Open($LockPath, [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
    } catch [System.IO.IOException] {
      if ((Get-Date) -ge $Deadline) {
        throw "Timed out waiting for $Mode access to $LockPath"
      }
      Start-Sleep -Milliseconds 250
    }
  } while ($true)
}

$InterestingExtensions = New-Object System.Collections.Generic.HashSet[string]([System.StringComparer]::OrdinalIgnoreCase)
@(
  ".md", ".markdown", ".html", ".htm", ".yml", ".yaml", ".scss", ".sass", ".css", ".js",
  ".json", ".xml", ".txt", ".svg", ".png", ".jpg", ".jpeg", ".webp", ".ico", ".pdf"
) | ForEach-Object { [void]$InterestingExtensions.Add($_) }

$InterestingFileNames = New-Object System.Collections.Generic.HashSet[string]([System.StringComparer]::OrdinalIgnoreCase)
@("Gemfile", "Gemfile.lock", "CNAME", "robots.txt", "sitemap.xml", "package.json", "package-lock.json") |
  ForEach-Object { [void]$InterestingFileNames.Add($_) }

$IgnoredDirectoryNames = New-Object System.Collections.Generic.HashSet[string]([System.StringComparer]::OrdinalIgnoreCase)
@(".git", "_site", "vendor", "node_modules", ".bundle", "verification-artifacts", "source-packages", ".agent-runtime") |
  ForEach-Object { [void]$IgnoredDirectoryNames.Add($_) }

function Test-WatchedSourceFile {
  param([Parameter(Mandatory = $true)][System.IO.FileInfo]$File)

  if ($File.Name -match '(^\.|~$|\.tmp$|\.swp$|\.bak$|\.zip$|\.log$)') {
    return $false
  }

  if ($InterestingExtensions.Contains($File.Extension)) {
    return $true
  }

  return $InterestingFileNames.Contains($File.Name)
}

function Get-WatchedSourceFiles {
  $Root = Get-Item -LiteralPath $RepoRootPath
  $Stack = New-Object 'System.Collections.Generic.Stack[System.IO.DirectoryInfo]'
  $Stack.Push($Root)

  while ($Stack.Count -gt 0) {
    $Directory = $Stack.Pop()

    foreach ($ChildDirectory in Get-ChildItem -LiteralPath $Directory.FullName -Directory -Force -ErrorAction SilentlyContinue) {
      if ($IgnoredDirectoryNames.Contains($ChildDirectory.Name)) {
        continue
      }
      $Stack.Push($ChildDirectory)
    }

    foreach ($File in Get-ChildItem -LiteralPath $Directory.FullName -File -Force -ErrorAction SilentlyContinue) {
      if (Test-WatchedSourceFile -File $File) {
        $File
      }
    }
  }
}

function Get-SourceFingerprint {
  $Sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    [System.IO.FileInfo[]]$Files = @(Get-WatchedSourceFiles)
    [System.Array]::Sort(
      $Files,
      [System.Comparison[System.IO.FileInfo]]{
        param([System.IO.FileInfo]$Left, [System.IO.FileInfo]$Right)
        [System.StringComparer]::OrdinalIgnoreCase.Compare($Left.FullName, $Right.FullName)
      }
    )
    foreach ($File in $Files) {
      $RelativePath = $File.FullName.Substring($RepoRootPath.Length)
      $RelativePath = $RelativePath.TrimStart([char[]]@([char]92, [char]47))

      $FileSha = [System.Security.Cryptography.SHA256]::Create()
      $Stream = [System.IO.File]::Open(
        $File.FullName,
        [System.IO.FileMode]::Open,
        [System.IO.FileAccess]::Read,
        ([System.IO.FileShare]::ReadWrite -bor [System.IO.FileShare]::Delete)
      )
      try {
        $ContentHash = ([BitConverter]::ToString($FileSha.ComputeHash($Stream)) -replace '-', '').ToLowerInvariant()
      } finally {
        $Stream.Dispose()
        $FileSha.Dispose()
      }

      $Line = "{0}|{1}|{2}`n" -f $RelativePath.ToLowerInvariant(), $File.Length, $ContentHash
      $Bytes = [System.Text.Encoding]::UTF8.GetBytes($Line)
      [void]$Sha.TransformBlock($Bytes, 0, $Bytes.Length, $Bytes, 0)
    }
    [void]$Sha.TransformFinalBlock([byte[]]::new(0), 0, 0)
    return ([BitConverter]::ToString($Sha.Hash) -replace '-', '').ToLowerInvariant()
  } finally {
    $Sha.Dispose()
  }
}

function Assert-SharedServerAvailable {
  $Listener = Get-NetTCPConnection -LocalAddress $BindAddress -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1

  if (-not $Listener) {
    throw "No shared Pages server is listening at $BaseUri. Start scripts\pages-shared-server.ps1; agents must not start their own server."
  }

  $Freshness = Test-PagesServerFreshness -BaseUri $BaseUri
  if (-not $Freshness.fresh) {
    throw "The shared server at $BaseUri is not serving the current _site output. $($Freshness.failures -join ' ')"
  }
}

function Invoke-SmokeRoutes {
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
}

$SafeAgentId = ($AgentId -replace '[^A-Za-z0-9_.-]', '_')
$GlobalDeadline = (Get-Date).AddSeconds($ReadyTimeoutSeconds)
$SharedLock = $null
$Status = $null

try {
  while ($true) {
    $CandidateStatus = Wait-PagesReadyStatus -Deadline $GlobalDeadline
    $SharedLock = Open-SiteReadWriteLock -Mode Shared -TimeoutSeconds $LockTimeoutSeconds

    $Status = Read-PagesStatus
    if (-not $Status -or $Status.state -ne "ready" -or [string]$Status.buildId -ne [string]$CandidateStatus.buildId) {
      $SharedLock.Dispose()
      $SharedLock = $null
      Start-Sleep -Milliseconds 500
      continue
    }

    $CurrentSourceFingerprint = Get-SourceFingerprint
    if ($CurrentSourceFingerprint -ne [string]$Status.sourceFingerprint) {
      $SharedLock.Dispose()
      $SharedLock = $null
      Write-Host "Source files are newer than ready build $($Status.buildId); waiting for the coordinator to rebuild."
      Start-Sleep -Milliseconds 1000
      if ((Get-Date) -ge $GlobalDeadline) {
        throw "Timed out waiting for coordinator to publish a build for the latest source files."
      }
      continue
    }

    break
  }

  $BuildId = [string]$Status.buildId
  $BuildFingerprint = [string]$Status.sourceFingerprint

  if (-not $OutputDirectory) {
    $OutputDirectory = Join-Path $VerificationOutputPath (Join-Path "agents" (Join-Path $SafeAgentId ("{0}-{1}-pid{2}" -f $BuildId, (Get-Date -Format "yyyyMMdd-HHmmssfff"), $PID)))
  }

  Write-Host "Agent $AgentId verifying shared Pages build $BuildId at $BaseUri"
  Write-Host "Verification artifacts: $OutputDirectory"

  & (Join-Path $ScriptDir "verify-pages-output.ps1") -SkipBuild
  Assert-SharedServerAvailable
  Invoke-SmokeRoutes

  if (-not $SkipBrowser) {
    $BrowserArgs = @{
      BaseUri = $BaseUri
      Browser = $Browser
      OutputDirectory = $OutputDirectory
    }

    if ($SkipScreenshots) {
      $BrowserArgs.SkipScreenshots = $true
    }
    if ($SkipVisualValidation) {
      $BrowserArgs.SkipVisualValidation = $true
    }
    if (-not $AllowMissingVisualBaselines -and -not $SkipScreenshots -and -not $SkipVisualValidation) {
      $BrowserArgs.RequireVisualBaselines = $true
    }

    & (Join-Path $ScriptDir "verify-browser-pages.ps1") @BrowserArgs
  }

  $AfterStatus = Read-PagesStatus
  if (-not $AfterStatus -or [string]$AfterStatus.buildId -ne $BuildId) {
    throw "Verification crossed a build boundary. Started on $BuildId, ended on $($AfterStatus.buildId). Treat this run as inconclusive and rerun."
  }

  $AfterFingerprint = Get-SourceFingerprint
  if ($AfterFingerprint -ne $BuildFingerprint) {
    throw "Source files changed during verification. Checks were for $BuildId, but the workspace is now newer; wait for the coordinator rebuild and rerun."
  }

  New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
  $RunMetadataPath = Join-Path $OutputDirectory "agent-run.json"
  $RunMetadata = [pscustomobject]@{
    agentId = $AgentId
    buildId = $BuildId
    sourceFingerprint = $BuildFingerprint
    baseUri = $BaseUri
    statusPath = $StatusPath
    outputDirectory = $OutputDirectory
    verifiedUtc = (Get-Date).ToUniversalTime().ToString("o")
    processId = $PID
  }
  $RunMetadata | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $RunMetadataPath -Encoding UTF8

  Write-Host "Agent $AgentId verification passed for shared build $BuildId"
  Write-Host "Agent run metadata is ready at $RunMetadataPath"
} finally {
  if ($SharedLock) {
    $SharedLock.Dispose()
  }
}
