param(
  [string]$OutputDirectory = "",
  [string]$ArchiveName = "",
  [switch]$Force,
  [switch]$IncludeArchiveAssets,
  [switch]$ListOnly
)

. (Join-Path $PSScriptRoot "pages-env.ps1")

if (-not $OutputDirectory) {
  $OutputDirectory = Join-Path $RepoRootPath "source-packages"
}

if (-not $ArchiveName) {
  $ArchiveName = "MohammadMahdiJavid.github.io-source-{0}.zip" -f (Get-Date -Format "yyyyMMdd-HHmmss")
}

if (-not $ArchiveName.EndsWith(".zip", [System.StringComparison]::OrdinalIgnoreCase)) {
  $ArchiveName = "$ArchiveName.zip"
}

if ([System.IO.Path]::IsPathRooted($OutputDirectory)) {
  $OutputDirectoryPath = [System.IO.Path]::GetFullPath($OutputDirectory)
} else {
  $OutputDirectoryPath = [System.IO.Path]::GetFullPath((Join-Path $RepoRootPath $OutputDirectory))
}
$ArchivePath = [System.IO.Path]::GetFullPath((Join-Path $OutputDirectoryPath $ArchiveName))

function Invoke-Git {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments
  )

  $Output = & git @Arguments
  $ExitCode = $LASTEXITCODE
  if ($null -ne $ExitCode -and $ExitCode -ne 0) {
    throw "git command failed with exit code $ExitCode"
  }
  return $Output
}

function Test-ExcludedSourcePath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RelativePath
  )

  $Path = ($RelativePath -replace "\\", "/").TrimStart("/")
  $TopLevel = ($Path -split "/")[0]
  $FileName = [System.IO.Path]::GetFileName($Path)
  $Extension = [System.IO.Path]::GetExtension($Path).ToLowerInvariant()

  $ExcludedTopLevel = @(
    ".git",
    ".bundle",
    ".sass-cache",
    "_asset_bundler_cache",
    "_site",
    "node_modules",
    "source-packages",
    "verification-artifacts",
    "vendor"
  )

  if ($ExcludedTopLevel -contains $TopLevel) {
    return $true
  }

  $ExcludedFiles = @(
    ".DS_Store",
    ".jekyll-metadata",
    "Gemfile.lock",
    "npm-debug.log"
  )

  if ($ExcludedFiles -contains $FileName) {
    return $true
  }

  if ($FileName -like "npm-debug.log*") {
    return $true
  }

  if ($FileName -like "*.gem" -or
      $FileName -like "*.sublime-project" -or
      $FileName -like "*.sublime-workspace") {
    return $true
  }

  if (-not $IncludeArchiveAssets) {
    $ArchiveExtensions = @(".7z", ".gz", ".rar", ".tar", ".tgz", ".zip")
    if ($ArchiveExtensions -contains $Extension) {
      return $true
    }
  }

  return $false
}

$GitFiles = Invoke-Git -Arguments @("-C", $RepoRootPath, "-c", "core.quotepath=false", "ls-files", "--cached", "--others", "--exclude-standard")
$SelectedFiles = New-Object System.Collections.Generic.List[string]
$ExcludedFiles = New-Object System.Collections.Generic.List[string]
$MissingFiles = New-Object System.Collections.Generic.List[string]

foreach ($RelativePath in $GitFiles) {
  if (-not $RelativePath) {
    continue
  }

  $NormalizedPath = ($RelativePath -replace "\\", "/")

  if (Test-ExcludedSourcePath -RelativePath $NormalizedPath) {
    $ExcludedFiles.Add($NormalizedPath)
    continue
  }

  $FullPath = Join-Path $RepoRootPath ($NormalizedPath -replace "/", [System.IO.Path]::DirectorySeparatorChar)

  if (Test-Path -LiteralPath $FullPath -PathType Leaf) {
    $SelectedFiles.Add($NormalizedPath)
  } else {
    $MissingFiles.Add($NormalizedPath)
  }
}

$SelectedFiles = @($SelectedFiles | Sort-Object -Unique)

if ($ListOnly) {
  $SelectedFiles
  Write-Host "Selected files: $($SelectedFiles.Count)"
  Write-Host "Excluded files: $($ExcludedFiles.Count)"
  Write-Host "Missing tracked files skipped: $($MissingFiles.Count)"
  return
}

if ($SelectedFiles.Count -eq 0) {
  throw "No source files were selected for packaging."
}

New-Item -ItemType Directory -Force -Path $OutputDirectoryPath | Out-Null

if ((Test-Path -LiteralPath $ArchivePath) -and -not $Force) {
  throw "Archive already exists at $ArchivePath. Use -Force to replace it."
}

$TempArchivePath = "$ArchivePath.tmp"
if (Test-Path -LiteralPath $TempArchivePath) {
  Remove-Item -LiteralPath $TempArchivePath -Force
}

if (Test-Path -LiteralPath $ArchivePath) {
  Remove-Item -LiteralPath $ArchivePath -Force
}

Add-Type -AssemblyName System.IO.Compression.FileSystem

$Zip = [System.IO.Compression.ZipFile]::Open($TempArchivePath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($RelativePath in $SelectedFiles) {
    $FullPath = Join-Path $RepoRootPath ($RelativePath -replace "/", [System.IO.Path]::DirectorySeparatorChar)
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
      $Zip,
      $FullPath,
      $RelativePath,
      [System.IO.Compression.CompressionLevel]::Optimal
    ) | Out-Null
  }

  $Instructions = @"
MohammadMahdiJavid.github.io source transfer package

Build and run on Windows PowerShell

1. Install Ruby, Bundler, and Python 3
2. Run .\scripts\setup-pages.ps1
3. Run .\scripts\pages-local.ps1 -Mode Smoke -Port 4000
4. Run .\scripts\pages-local.ps1 -Mode Serve -Port 4000

Generated folders such as _site, vendor, node_modules, and .bundle are intentionally not included.
"@

  $Entry = $Zip.CreateEntry("TRANSFER_INSTRUCTIONS.txt")
  $Writer = New-Object System.IO.StreamWriter($Entry.Open())
  try {
    $Writer.Write($Instructions)
  } finally {
    $Writer.Dispose()
  }
} finally {
  $Zip.Dispose()
}

Move-Item -LiteralPath $TempArchivePath -Destination $ArchivePath -Force

Write-Host "Archive created: $ArchivePath"
Write-Host "Selected files: $($SelectedFiles.Count)"
Write-Host "Excluded files: $($ExcludedFiles.Count)"
Write-Host "Missing tracked files skipped: $($MissingFiles.Count)"

if ($MissingFiles.Count -gt 0) {
  Write-Host "Some tracked files were skipped because they are missing in the current worktree."
}
