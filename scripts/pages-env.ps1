$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ScriptDir = $PSScriptRoot
$RepoRoot = Resolve-Path (Join-Path $ScriptDir "..")
$RepoRootPath = $RepoRoot.Path
$SitePath = Join-Path $RepoRootPath "_site"
$VerificationOutputPath = Join-Path $RepoRootPath "verification-artifacts"
$ToolCachePath = Join-Path $env:TEMP "mohammadmahdi-pages-tools"

function Add-PathEntry {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  if (-not $Path) {
    return
  }

  $ResolvedPath = $null
  try {
    $ResolvedPath = [System.IO.Path]::GetFullPath($Path)
  } catch {
    return
  }

  if (-not (Test-Path -LiteralPath $ResolvedPath -PathType Container)) {
    return
  }

  $CurrentEntries = @($env:PATH -split [System.IO.Path]::PathSeparator | Where-Object { $_ })
  foreach ($Entry in $CurrentEntries) {
    try {
      if ([System.IO.Path]::GetFullPath($Entry).TrimEnd("\") -ieq $ResolvedPath.TrimEnd("\")) {
        return
      }
    } catch {
      continue
    }
  }

  $env:PATH = $ResolvedPath + [System.IO.Path]::PathSeparator + $env:PATH
}

function Add-PathPattern {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Pattern
  )

  if (-not $Pattern) {
    return
  }

  Get-Item -Path $Pattern -ErrorAction SilentlyContinue |
    Where-Object { $_.PSIsContainer } |
    Sort-Object FullName -Descending |
    ForEach-Object { Add-PathEntry -Path $_.FullName }
}

function Initialize-ToolPaths {
  $PathPatterns = @(
    "$env:USERPROFILE\scoop\shims",
    "$env:ProgramData\scoop\shims",
    "$env:ChocolateyInstall\bin",
    "$env:LOCALAPPDATA\Programs\Ruby*\bin",
    "$env:ProgramFiles\Ruby*\bin",
    "${env:ProgramFiles(x86)}\Ruby*\bin",
    "C:\Ruby*\bin",
    "C:\tools\ruby*\bin",
    "$env:LOCALAPPDATA\Programs\Python\Launcher",
    "$env:LOCALAPPDATA\Programs\Python\Python*",
    "$env:ProgramFiles\Python*",
    "${env:ProgramFiles(x86)}\Python*",
    "$env:ProgramFiles\nodejs",
    "${env:ProgramFiles(x86)}\nodejs",
    "C:\VSCode\nodejs",
    "$env:ProgramFiles\Google\Chrome\Application",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application",
    "$env:LOCALAPPDATA\Google\Chrome\Application",
    "$env:ProgramFiles\Microsoft\Edge\Application",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application",
    "$env:LOCALAPPDATA\Microsoft\Edge\Application",
    "$env:LOCALAPPDATA\Chromium\Application",
    "$env:LOCALAPPDATA\chromium\Application",
    "$env:LOCALAPPDATA\Microsoft\WindowsApps"
  )

  foreach ($Pattern in $PathPatterns) {
    Add-PathPattern -Pattern $Pattern
  }
}

function Require-Command {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [string]$InstallHint = ""
  )

  $Command = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $Command) {
    $Hint = ""
    if ($InstallHint) {
      $Hint = " $InstallHint"
    }
    throw "Required command '$Name' was not found after initializing common tool paths.$Hint"
  }

  return $Command
}

function Invoke-Native {
  param(
    [Parameter(Mandatory = $true)]
    [scriptblock]$Command
  )

  & $Command
  $Succeeded = $?
  $ExitCode = $LASTEXITCODE
  if (-not $Succeeded -or ($null -ne $ExitCode -and $ExitCode -ne 0)) {
    if ($null -ne $ExitCode) {
      throw "Command failed with exit code $ExitCode"
    }

    throw "Command failed."
  }
}

function Get-PythonInvocation {
  $PythonLauncher = Get-Command "py" -ErrorAction SilentlyContinue
  if ($PythonLauncher) {
    return [pscustomobject]@{
      Command = "py"
      Arguments = @("-3")
    }
  }

  Require-Command -Name "python" -InstallHint "Install Python 3 and reopen PowerShell." | Out-Null
  return [pscustomobject]@{
    Command = "python"
    Arguments = @()
  }
}

function Get-NodeInvocation {
  Require-Command -Name "node" -InstallHint "Install Node.js and reopen PowerShell." | Out-Null
  Require-Command -Name "npm" -InstallHint "Install Node.js with npm and reopen PowerShell." | Out-Null

  return [pscustomobject]@{
    Node = "node"
    Npm = "npm"
  }
}

function Get-BrowserCandidates {
  $Candidates = New-Object System.Collections.Generic.List[object]

  $CommandNames = @("chrome", "chrome.exe", "msedge", "msedge.exe", "chromium", "chromium.exe")
  foreach ($CommandName in $CommandNames) {
    $Command = Get-Command $CommandName -ErrorAction SilentlyContinue
    if ($Command -and $Command.Source) {
      $Candidates.Add([pscustomobject]@{
        Name = $Command.Name
        Path = $Command.Source
        Source = "PATH"
      })
    }
  }

  $KnownPaths = @(
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
    "C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe",
    "$env:LOCALAPPDATA\Chromium\Application\chrome.exe",
    "$env:LOCALAPPDATA\chromium\Application\chrome.exe"
  )

  foreach ($KnownPath in $KnownPaths) {
    if (Test-Path -LiteralPath $KnownPath -PathType Leaf) {
      $LeafName = [System.IO.Path]::GetFileName($KnownPath)
      $Candidates.Add([pscustomobject]@{
        Name = $LeafName
        Path = [System.IO.Path]::GetFullPath($KnownPath)
        Source = "KnownPath"
      })
    }
  }

  $RegistryPaths = @(
    "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe",
    "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe",
    "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe",
    "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe"
  )

  foreach ($RegistryPath in $RegistryPaths) {
    $Item = Get-ItemProperty -Path $RegistryPath -ErrorAction SilentlyContinue
    if ($Item) {
      $DefaultValue = $Item."(default)"
      if ($DefaultValue -and (Test-Path -LiteralPath $DefaultValue -PathType Leaf)) {
        $Candidates.Add([pscustomobject]@{
          Name = [System.IO.Path]::GetFileName($DefaultValue)
          Path = [System.IO.Path]::GetFullPath($DefaultValue)
          Source = "Registry"
        })
      }
    }
  }

  $Seen = New-Object System.Collections.Generic.HashSet[string]([System.StringComparer]::OrdinalIgnoreCase)
  foreach ($Candidate in $Candidates) {
    if ($Candidate.Path -and $Seen.Add($Candidate.Path)) {
      $Candidate
    }
  }
}

function Get-BrowserInvocation {
  param(
    [ValidateSet("Auto", "Chrome", "Edge", "Chromium")]
    [string]$Browser = "Auto"
  )

  $Candidates = @(Get-BrowserCandidates)
  if ($Candidates.Count -eq 0) {
    throw "No Chromium based browser was found after initializing browser paths."
  }

  $Preference = switch ($Browser) {
    "Chrome" { @("chrome.exe", "chrome") }
    "Edge" { @("msedge.exe", "msedge") }
    "Chromium" { @("chromium.exe", "chromium", "chrome.exe") }
    default { @("chrome.exe", "chrome", "msedge.exe", "msedge", "chromium.exe", "chromium") }
  }

  foreach ($PreferredName in $Preference) {
    $Match = $Candidates |
      Where-Object { $_.Name -ieq $PreferredName -or [System.IO.Path]::GetFileName($_.Path) -ieq $PreferredName } |
      Sort-Object @{
        Expression = {
          switch ($_.Source) {
            "Registry" { 0 }
            "KnownPath" { 1 }
            default { 2 }
          }
        }
      } |
      Select-Object -First 1
    if ($Match) {
      return $Match
    }
  }

  return $Candidates[0]
}

function ConvertTo-ProcessArgument {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Value
  )

  if ($Value -match '[\s"]') {
    return '"' + ($Value -replace '"', '\"') + '"'
  }

  return $Value
}

Initialize-ToolPaths
Set-Location $RepoRootPath
