param(
  [ValidateSet("Auto", "Chrome", "Edge", "Chromium")]
  [string]$Browser = "Auto",
  [switch]$ListAll,
  [switch]$Json
)

. (Join-Path $PSScriptRoot "pages-env.ps1")

if ($ListAll) {
  $Result = @(Get-BrowserCandidates)
} else {
  $Result = Get-BrowserInvocation -Browser $Browser
}

if ($Json) {
  $Result | ConvertTo-Json -Depth 4
  return
}

if ($ListAll) {
  $Result | Format-Table Name, Source, Path -AutoSize
  return
}

Write-Host "Browser: $($Result.Name)"
Write-Host "Source: $($Result.Source)"
Write-Host "Path: $($Result.Path)"
