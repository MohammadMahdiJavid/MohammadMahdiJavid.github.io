param(
  [Parameter(Mandatory = $true)]
  [string]$ArtifactDirectory,
  [string]$BaselineDirectory = "",
  [decimal]$MaxPixelDiffPercent = 0.3,
  [int]$PixelDifferenceThreshold = 12,
  [int]$SampleStride = 4,
  [switch]$UpdateBaselines,
  [switch]$UpdateMissingBaselines,
  [switch]$RequireBaselines
)

. (Join-Path $PSScriptRoot "pages-env.ps1")

Add-Type -AssemblyName System.Drawing

function Resolve-RepoPath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  if ([System.IO.Path]::IsPathRooted($Path)) {
    return [System.IO.Path]::GetFullPath($Path)
  }

  return [System.IO.Path]::GetFullPath((Join-Path $RepoRootPath $Path))
}

function Get-ScreenshotStats {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [int]$Stride = 4
  )

  $Bitmap = [System.Drawing.Bitmap]::new($Path)
  try {
    $SampleCount = 0
    $MinLuminance = 255
    $MaxLuminance = 0
    $TotalLuminance = 0.0
    $FirstColor = $null
    $DifferentSamples = 0

    for ($Y = 0; $Y -lt $Bitmap.Height; $Y += $Stride) {
      for ($X = 0; $X -lt $Bitmap.Width; $X += $Stride) {
        $Color = $Bitmap.GetPixel($X, $Y)
        $Luminance = (0.2126 * $Color.R) + (0.7152 * $Color.G) + (0.0722 * $Color.B)

        if ($Luminance -lt $MinLuminance) {
          $MinLuminance = $Luminance
        }

        if ($Luminance -gt $MaxLuminance) {
          $MaxLuminance = $Luminance
        }

        $TotalLuminance += $Luminance
        $SampleCount++

        if ($null -eq $FirstColor) {
          $FirstColor = $Color
        } elseif ([Math]::Abs($Color.R - $FirstColor.R) -gt 3 -or
                  [Math]::Abs($Color.G - $FirstColor.G) -gt 3 -or
                  [Math]::Abs($Color.B - $FirstColor.B) -gt 3) {
          $DifferentSamples++
        }
      }
    }

    return [pscustomobject]@{
      width = $Bitmap.Width
      height = $Bitmap.Height
      samples = $SampleCount
      luminanceMin = [Math]::Round($MinLuminance, 2)
      luminanceMax = [Math]::Round($MaxLuminance, 2)
      luminanceRange = [Math]::Round(($MaxLuminance - $MinLuminance), 2)
      luminanceAverage = [Math]::Round(($TotalLuminance / [Math]::Max($SampleCount, 1)), 2)
      variedSamplePercent = [Math]::Round(($DifferentSamples / [Math]::Max($SampleCount, 1)) * 100, 4)
    }
  } finally {
    $Bitmap.Dispose()
  }
}

function Compare-Screenshots {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ActualPath,
    [Parameter(Mandatory = $true)]
    [string]$BaselinePath,
    [int]$Threshold = 12,
    [int]$Stride = 4
  )

  $Actual = [System.Drawing.Bitmap]::new($ActualPath)
  $Baseline = [System.Drawing.Bitmap]::new($BaselinePath)

  try {
    if ($Actual.Width -ne $Baseline.Width -or $Actual.Height -ne $Baseline.Height) {
      return [pscustomobject]@{
        comparable = $false
        reason = "dimension-mismatch"
        actualSize = @($Actual.Width, $Actual.Height)
        baselineSize = @($Baseline.Width, $Baseline.Height)
        changedPixelPercent = 100.0
        maxChannelDelta = $null
      }
    }

    $SampleCount = 0
    $ChangedCount = 0
    $MaxDelta = 0

    for ($Y = 0; $Y -lt $Actual.Height; $Y += $Stride) {
      for ($X = 0; $X -lt $Actual.Width; $X += $Stride) {
        $ActualColor = $Actual.GetPixel($X, $Y)
        $BaselineColor = $Baseline.GetPixel($X, $Y)
        $Delta = [Math]::Max(
          [Math]::Abs($ActualColor.R - $BaselineColor.R),
          [Math]::Max(
            [Math]::Abs($ActualColor.G - $BaselineColor.G),
            [Math]::Abs($ActualColor.B - $BaselineColor.B)
          )
        )

        if ($Delta -gt $MaxDelta) {
          $MaxDelta = $Delta
        }

        if ($Delta -gt $Threshold) {
          $ChangedCount++
        }

        $SampleCount++
      }
    }

    return [pscustomobject]@{
      comparable = $true
      reason = ""
      actualSize = @($Actual.Width, $Actual.Height)
      baselineSize = @($Baseline.Width, $Baseline.Height)
      changedPixelPercent = [Math]::Round(($ChangedCount / [Math]::Max($SampleCount, 1)) * 100, 4)
      maxChannelDelta = $MaxDelta
      sampledPixels = $SampleCount
    }
  } finally {
    $Actual.Dispose()
    $Baseline.Dispose()
  }
}

$ArtifactPath = Resolve-RepoPath -Path $ArtifactDirectory
if (-not (Test-Path -LiteralPath $ArtifactPath -PathType Container)) {
  throw "Visual artifact directory was not found: $ArtifactPath"
}

if (-not $BaselineDirectory) {
  $BaselineDirectory = Join-Path $VerificationOutputPath "visual-baselines"
}

$BaselinePath = Resolve-RepoPath -Path $BaselineDirectory
New-Item -ItemType Directory -Force -Path $BaselinePath | Out-Null

$Screenshots = @(Get-ChildItem -LiteralPath $ArtifactPath -Filter "*.png" -File | Sort-Object Name)
if ($Screenshots.Count -eq 0) {
  throw "No PNG screenshots were found in $ArtifactPath"
}

$DiffPath = Join-Path $ArtifactPath "visual-diffs"
New-Item -ItemType Directory -Force -Path $DiffPath | Out-Null

$Failures = New-Object System.Collections.Generic.List[string]
$Results = New-Object System.Collections.Generic.List[object]

foreach ($Screenshot in $Screenshots) {
  $RelativeName = $Screenshot.Name
  $BaselineFile = Join-Path $BaselinePath $RelativeName
  $Stats = Get-ScreenshotStats -Path $Screenshot.FullName -Stride $SampleStride
  $Status = "compared"
  $Comparison = $null

  if ($Stats.luminanceRange -lt 12 -or $Stats.variedSamplePercent -lt 1) {
    $Failures.Add("Screenshot $RelativeName appears blank or visually flat")
  }

  if ($UpdateBaselines) {
    Copy-Item -LiteralPath $Screenshot.FullName -Destination $BaselineFile -Force
    $Status = "updated-baseline"
  } elseif (-not (Test-Path -LiteralPath $BaselineFile -PathType Leaf)) {
    if ($RequireBaselines) {
      $Failures.Add("Missing visual baseline for $RelativeName")
      $Status = "missing-baseline"
    } elseif ($UpdateMissingBaselines) {
      Copy-Item -LiteralPath $Screenshot.FullName -Destination $BaselineFile -Force
      $Status = "new-baseline"
    } else {
      $Status = "missing-baseline"
    }
  } else {
    $Comparison = Compare-Screenshots -ActualPath $Screenshot.FullName -BaselinePath $BaselineFile -Threshold $PixelDifferenceThreshold -Stride $SampleStride
    if (-not $Comparison.comparable) {
      $Failures.Add("Screenshot $RelativeName is not comparable to baseline because $($Comparison.reason)")
    } elseif ([decimal]$Comparison.changedPixelPercent -gt $MaxPixelDiffPercent) {
      $Failures.Add("Screenshot $RelativeName changed by $($Comparison.changedPixelPercent) percent")
    }
  }

  $Results.Add([pscustomobject]@{
    screenshot = $Screenshot.FullName
    baseline = $BaselineFile
    status = $Status
    stats = $Stats
    comparison = $Comparison
  })
}

$NewBaselineCount = (@($Results.ToArray() | Where-Object { $_.status -eq "new-baseline" })).Count
$UpdatedBaselineCount = (@($Results.ToArray() | Where-Object { $_.status -eq "updated-baseline" })).Count
$ComparedCount = (@($Results.ToArray() | Where-Object { $_.status -eq "compared" })).Count

$Report = [pscustomobject]@{
  artifactDirectory = $ArtifactPath
  baselineDirectory = $BaselinePath
  maxPixelDiffPercent = $MaxPixelDiffPercent
  pixelDifferenceThreshold = $PixelDifferenceThreshold
  sampleStride = $SampleStride
  screenshotCount = $Screenshots.Count
  newBaselines = $NewBaselineCount
  updatedBaselines = $UpdatedBaselineCount
  compared = $ComparedCount
  failures = @($Failures.ToArray())
  results = @($Results.ToArray())
}

$ReportPath = Join-Path $ArtifactPath "visual-validation.json"
$Report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $ReportPath -Encoding UTF8

Write-Host "Visual validation report is ready at $ReportPath"
Write-Host "Visual screenshots checked: $($Screenshots.Count)"
Write-Host "Visual baselines created: $($Report.newBaselines)"
Write-Host "Visual baselines compared: $($Report.compared)"

if ($Failures.Count -gt 0) {
  foreach ($Failure in $Failures) {
    Write-Error $Failure
  }
  throw "Visual validation failed with $($Failures.Count) failure(s)."
}

Write-Host "Visual validation passed"
