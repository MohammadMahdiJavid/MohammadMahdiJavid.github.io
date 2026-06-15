param(
  [string]$Environment = "production",
  [int]$DebounceMilliseconds = 750,
  [int]$PollMilliseconds = 750,
  [switch]$SkipSetup,
  [switch]$NoInitialBuild,
  [string]$StatusPath = ""
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot "pages-env.ps1")
. (Join-Path $PSScriptRoot "pages-server.ps1")

$Port = 4000
$BindAddress = "127.0.0.1"
$BaseUri = "http://127.0.0.1:4000"
$RuntimeDirectory = Join-Path $RepoRootPath ".agent-runtime"
New-Item -ItemType Directory -Force -Path $RuntimeDirectory | Out-Null

if (-not $StatusPath) {
  $StatusPath = Join-Path $RuntimeDirectory "pages-shared-server-status.json"
}
if (-not [System.IO.Path]::IsPathRooted($StatusPath)) {
  $StatusPath = Join-Path $RepoRootPath $StatusPath
}
$StatusPath = [System.IO.Path]::GetFullPath($StatusPath)
$StatusDirectory = Split-Path -Parent $StatusPath
New-Item -ItemType Directory -Force -Path $StatusDirectory | Out-Null

$LockPath = Join-Path $RuntimeDirectory "site-read-write.lock"
if (-not (Test-Path -LiteralPath $LockPath -PathType Leaf)) {
  Set-Content -LiteralPath $LockPath -Value "shared Pages read/write lock" -Encoding ASCII
}

function Get-StableName {
  param([Parameter(Mandatory = $true)][string]$Value)

  $Sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $Bytes = [System.Text.Encoding]::UTF8.GetBytes($Value)
    $Hash = $Sha.ComputeHash($Bytes)
    return ([Convert]::ToBase64String($Hash) -replace '[^A-Za-z0-9]', '').Substring(0, 16)
  } finally {
    $Sha.Dispose()
  }
}

$RepoKey = Get-StableName -Value $RepoRootPath
$CoordinatorMutexName = "Local\MMJPagesSharedCoordinator_$RepoKey"
$CoordinatorMutex = [System.Threading.Mutex]::new($false, $CoordinatorMutexName)
$HasCoordinatorMutex = $false

function Write-PagesStatus {
  param(
    [Parameter(Mandatory = $true)][string]$State,
    [string]$BuildId = "",
    [string]$SourceFingerprint = "",
    [string]$Reason = "",
    [string]$ErrorMessage = ""
  )

  $Status = [pscustomobject]@{
    state = $State
    buildId = $BuildId
    sourceFingerprint = $SourceFingerprint
    reason = $Reason
    error = $ErrorMessage
    port = $Port
    bindAddress = $BindAddress
    baseUri = $BaseUri
    repoRoot = $RepoRootPath
    sitePath = $SitePath
    statusPath = $StatusPath
    processId = $PID
    updatedUtc = (Get-Date).ToUniversalTime().ToString("o")
  }

  $TempStatusPath = "$StatusPath.$PID.tmp"
  $Status | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $TempStatusPath -Encoding UTF8
  Move-Item -LiteralPath $TempStatusPath -Destination $StatusPath -Force
}

function Open-SiteReadWriteLock {
  param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("Shared", "Exclusive")]
    [string]$Mode,
    [int]$TimeoutSeconds = 3600
  )

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

function Wait-StableSourceFingerprint {
  param([string]$StartingFingerprint = "")

  if (-not $StartingFingerprint) {
    $StartingFingerprint = Get-SourceFingerprint
  }

  $Last = $StartingFingerprint
  $StableSince = Get-Date
  while ($true) {
    Start-Sleep -Milliseconds $PollMilliseconds
    $Current = Get-SourceFingerprint
    if ($Current -ne $Last) {
      $Last = $Current
      $StableSince = Get-Date
      continue
    }

    if (((Get-Date) - $StableSince).TotalMilliseconds -ge $DebounceMilliseconds) {
      return $Current
    }
  }
}

function Sync-DirectoryTree {
  param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Destination
  )

  New-Item -ItemType Directory -Force -Path $Destination | Out-Null
  $SourceRoot = [System.IO.Path]::GetFullPath($Source).TrimEnd('\')
  $DestinationRoot = [System.IO.Path]::GetFullPath($Destination).TrimEnd('\')

  $SourceFiles = @{}
  Get-ChildItem -LiteralPath $SourceRoot -File -Recurse -Force | ForEach-Object {
    $Relative = $_.FullName.Substring($SourceRoot.Length).TrimStart([char[]]@([char]92, [char]47))
    $SourceFiles[$Relative.ToLowerInvariant()] = $_
  }

  Get-ChildItem -LiteralPath $DestinationRoot -File -Recurse -Force -ErrorAction SilentlyContinue | ForEach-Object {
    $Relative = $_.FullName.Substring($DestinationRoot.Length).TrimStart([char[]]@([char]92, [char]47))
    if ($Relative -ine ".pages-build-manifest.json" -and -not $SourceFiles.ContainsKey($Relative.ToLowerInvariant())) {
      Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue
    }
  }

  Get-ChildItem -LiteralPath $SourceRoot -Directory -Recurse -Force | ForEach-Object {
    $Relative = $_.FullName.Substring($SourceRoot.Length).TrimStart([char[]]@([char]92, [char]47))
    New-Item -ItemType Directory -Force -Path (Join-Path $DestinationRoot $Relative) | Out-Null
  }

  foreach ($SourceFile in $SourceFiles.Values) {
    if (-not (Test-Path -LiteralPath $SourceFile.FullName -PathType Leaf)) {
      continue
    }

    $Relative = $SourceFile.FullName.Substring($SourceRoot.Length).TrimStart([char[]]@([char]92, [char]47))
    $DestinationFile = Join-Path $DestinationRoot $Relative
    $DestinationDirectory = Split-Path -Parent $DestinationFile
    New-Item -ItemType Directory -Force -Path $DestinationDirectory | Out-Null
    Copy-Item -LiteralPath $SourceFile.FullName -Destination $DestinationFile -Force
  }

  Get-ChildItem -LiteralPath $DestinationRoot -Directory -Recurse -Force -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending |
    ForEach-Object {
      if (-not (Get-ChildItem -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue | Select-Object -First 1)) {
        Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue
      }
    }
}

$SetupAlreadyRun = $false
$StagePath = Join-Path $ToolCachePath "site-stage-$RepoKey"
$ManifestPath = Join-Path $SitePath ".pages-build-manifest.json"

function Invoke-StagedJekyllBuild {
  if (-not $SkipSetup -and -not $script:SetupAlreadyRun) {
    & (Join-Path $ScriptDir "setup-pages.ps1") | ForEach-Object { Write-Host $_ }
    $script:SetupAlreadyRun = $true
  }

  if (Test-Path -LiteralPath $StagePath) {
    Remove-Item -LiteralPath $StagePath -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path $StagePath | Out-Null

  $env:JEKYLL_ENV = $Environment
  $ConfigFiles = @(
    (Join-Path $RepoRootPath "_config.yml"),
    (Join-Path $RepoRootPath "_config.local.yml")
  ) | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf }

  $JekyllArgs = @("exec", "jekyll", "build", "--safe", "--trace", "--destination", $StagePath)
  if ($ConfigFiles.Count -gt 0) {
    $JekyllArgs += @("--config", ($ConfigFiles -join ","))
  }

  Write-Host "Building staged Pages output into $StagePath"
  Invoke-Native { & bundle @JekyllArgs | ForEach-Object { Write-Host $_ } }

  $StageIndex = Join-Path $StagePath "index.html"
  if (-not (Test-Path -LiteralPath $StageIndex -PathType Leaf)) {
    throw "Staged build completed but index.html was not created at $StageIndex"
  }
}

function Invoke-CoordinatedBuild {
  param([string]$Reason = "watch")

  Write-PagesStatus -State "waiting_for_verification" -Reason $Reason
  $Lock = Open-SiteReadWriteLock -Mode Exclusive -TimeoutSeconds 3600
  try {
    while ($true) {
      $SourceFingerprint = Wait-StableSourceFingerprint
      $BuildId = "build-{0}-{1}" -f (Get-Date -Format "yyyyMMdd-HHmmssfff"), $SourceFingerprint.Substring(0, 12)
      Write-PagesStatus -State "building" -BuildId $BuildId -SourceFingerprint $SourceFingerprint -Reason $Reason

      Invoke-StagedJekyllBuild

      $AfterBuildFingerprint = Get-SourceFingerprint
      if ($AfterBuildFingerprint -ne $SourceFingerprint) {
        Write-Host "Source files changed while Jekyll was building; discarding staged output and rebuilding latest source."
        continue
      }

      Sync-DirectoryTree -Source $StagePath -Destination $SitePath

      $Manifest = [pscustomobject]@{
        buildId = $BuildId
        sourceFingerprint = $SourceFingerprint
        environment = $Environment
        builtUtc = (Get-Date).ToUniversalTime().ToString("o")
        repoRoot = $RepoRootPath
        processId = $PID
      }
      $Manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $ManifestPath -Encoding UTF8
      Write-PagesStatus -State "ready" -BuildId $BuildId -SourceFingerprint $SourceFingerprint -Reason $Reason
      Write-Host "Pages build is ready: $BuildId"
      return [pscustomobject]@{
        buildId = $BuildId
        sourceFingerprint = $SourceFingerprint
      }
    }
  } catch {
    Write-PagesStatus -State "failed" -Reason $Reason -ErrorMessage ($_.Exception.Message)
    throw
  } finally {
    $Lock.Dispose()
  }
}

$Server = $null
try {
  $HasCoordinatorMutex = $CoordinatorMutex.WaitOne(0)
  if (-not $HasCoordinatorMutex) {
    throw "Another shared Pages coordinator is already running for this repository. Use the existing server at $BaseUri."
  }

  Write-Host "Shared Pages coordinator status: $StatusPath"
  Write-Host "Fixed serving endpoint: $BaseUri"
  Write-PagesStatus -State "starting" -Reason "startup"

  $InitialBuild = $null
  if (-not $NoInitialBuild) {
    $InitialBuild = Invoke-CoordinatedBuild -Reason "initial"
  } else {
    if (-not (Test-Path -LiteralPath (Join-Path $SitePath "index.html") -PathType Leaf)) {
      throw "-NoInitialBuild was used, but _site/index.html does not exist. Run without -NoInitialBuild once."
    }
    $InitialFingerprint = Get-SourceFingerprint
    $InitialBuild = [pscustomobject]@{
      buildId = "existing-{0}-{1}" -f (Get-Date -Format "yyyyMMdd-HHmmssfff"), $InitialFingerprint.Substring(0, 12)
      sourceFingerprint = $InitialFingerprint
    }
  }

  $Server = Start-PagesServer -Port $Port -BindAddress $BindAddress
  Write-PagesStatus -State "ready" -BuildId $InitialBuild.buildId -SourceFingerprint $InitialBuild.sourceFingerprint -Reason "server-ready"

  Write-Host "Persistent shared Pages server is ready at $BaseUri"
  Write-Host "Watching one shared project. Agents should use scripts\agent-verify-shared-pages.ps1. Press Ctrl+C to stop."

  $LastReadyFingerprint = [string]$InitialBuild.sourceFingerprint
  while ($true) {
    Start-Sleep -Milliseconds $PollMilliseconds
    $CurrentFingerprint = Get-SourceFingerprint
    if ($CurrentFingerprint -eq $LastReadyFingerprint) {
      continue
    }

    Write-Host "Source change detected; waiting for a stable source set..."
    $StableFingerprint = Wait-StableSourceFingerprint -StartingFingerprint $CurrentFingerprint
    if ($StableFingerprint -ne $LastReadyFingerprint) {
      $BuildResult = Invoke-CoordinatedBuild -Reason "watch"
      $LastReadyFingerprint = [string]$BuildResult.sourceFingerprint
    }
  }
} finally {
  if ($HasCoordinatorMutex) {
    if ($Server) {
      Stop-PagesServer -Server $Server
    }

    Write-PagesStatus -State "stopped" -Reason "coordinator-exit"
    $CoordinatorMutex.ReleaseMutex()
  }

  $CoordinatorMutex.Dispose()
}
