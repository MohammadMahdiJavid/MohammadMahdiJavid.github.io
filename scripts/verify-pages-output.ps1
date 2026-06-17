param(
  [switch]$SkipBuild
)

. (Join-Path $PSScriptRoot "pages-env.ps1")

if (-not $SkipBuild) {
  & (Join-Path $ScriptDir "build-pages.ps1") -SkipSetup
}

function Assert-FileContains {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [Parameter(Mandatory = $true)]
    [string]$Pattern,
    [Parameter(Mandatory = $true)]
    [string]$Description
  )

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Missing file for check '$Description': $Path"
  }

  $Content = Get-Content -LiteralPath $Path -Raw
  if ($Content -notmatch $Pattern) {
    throw "Generated output check failed: $Description"
  }

  Write-Host "OK $Description"
}

$IndexPath = Join-Path $SitePath "index.html"
$CssPath = Join-Path $SitePath "assets\css\main.css"
$JsPath = Join-Path $SitePath "assets\js\main.min.js"
$ThemeJsPath = Join-Path $SitePath "assets\js\theme-mode.js"
$HeaderRobotBlinkJsPath = Join-Path $SitePath "assets\js\mmj\header\robot-blink.js"
$CapacitorArtJsPath = Join-Path $SitePath "assets\js\mmj\header\capacitor-art.js"
$CapacitorRendererJsPath = Join-Path $SitePath "assets\js\mmj\header\capacitor-renderer.js"
$HobbiesPath = Join-Path $SitePath "hobbies\index.html"

Assert-FileContains -Path $IndexPath -Pattern 'class="greedy-nav__toggle hidden"' -Description "masthead menu toggle exists"
Assert-FileContains -Path $IndexPath -Pattern 'class="hidden-links hidden"' -Description "generated hidden links container exists"
Assert-FileContains -Path $IndexPath -Pattern 'class="navicon"' -Description "generated menu icon exists"
Assert-FileContains -Path $IndexPath -Pattern 'data-pcb-robot="auto"' -Description "PCB robot automatic blink attribute exists"
Assert-FileContains -Path $IndexPath -Pattern 'pcb-cpu__blink-lashes' -Description "PCB robot lash markup exists"
Assert-FileContains -Path $IndexPath -Pattern 'pcb-cpu__robot-scan' -Description "PCB robot scanline markup exists"
Assert-FileContains -Path $IndexPath -Pattern '/assets/js/mmj/header/capacitor-art\.js' -Description "capacitor artwork script is loaded"
Assert-FileContains -Path $IndexPath -Pattern '/assets/js/mmj/header/capacitor-renderer\.js' -Description "capacitor renderer script is loaded"
Assert-FileContains -Path $CssPath -Pattern 'background:\s*#FFFFFF|background:\s*#fff|rgb\(255,\s*255,\s*255\)' -Description "light dropdown background exists"
Assert-FileContains -Path $CssPath -Pattern 'rgba\(255,\s*255,\s*255,\s*0\.14\)' -Description "PCB dropdown border color exists"
Assert-FileContains -Path $CssPath -Pattern '8px' -Description "dropdown radius exists"
Assert-FileContains -Path $CssPath -Pattern 'pcbCpuOpenEyeBlink' -Description "PCB robot open eye blink keyframes exist"
Assert-FileContains -Path $CssPath -Pattern 'pcbCpuLashBlink' -Description "PCB robot lash blink keyframes exist"
Assert-FileContains -Path $CssPath -Pattern 'pcbCpuTraceCharge' -Description "PCB robot trace charge keyframes exist"
Assert-FileContains -Path $CssPath -Pattern '--pcb-robot-blink-speed:\s*2' -Description "PCB robot blink speed multiplier exists"
Assert-FileContains -Path $CssPath -Pattern 'pcb-component--capacitor' -Description "capacitor component styles exist"
Assert-FileContains -Path $CssPath -Pattern 'pcbCapCurrent' -Description "capacitor current animation exists"
Assert-FileContains -Path $CssPath -Pattern 'max-width:\s*820px' -Description "deterministic masthead breakpoint exists"
Assert-FileContains -Path $JsPath -Pattern 'greedy-nav' -Description "navigation script targets greedy nav"
Assert-FileContains -Path $JsPath -Pattern 'visible-links' -Description "navigation visible links script exists"
Assert-FileContains -Path $JsPath -Pattern 'hidden-links' -Description "navigation hidden links script exists"
Assert-FileContains -Path $HeaderRobotBlinkJsPath -Pattern 'header\.robotBlink' -Description "PCB robot blink module exists"
Assert-FileContains -Path $HeaderRobotBlinkJsPath -Pattern 'DEFAULT_BLINK_SPEED\s*=\s*2' -Description "PCB robot JS blink speed multiplier exists"
Assert-FileContains -Path $CapacitorRendererJsPath -Pattern 'header\.capacitorRenderer' -Description "capacitor masthead renderer exists"
Assert-FileContains -Path $CapacitorArtJsPath -Pattern 'PCB_CAPACITOR_SVG_CONTENT' -Description "capacitor SVG content exists"
Assert-FileContains -Path $HobbiesPath -Pattern '@media\s*\(max-width:\s*560px\)' -Description "hobbies mobile controls rule exists"
Assert-FileContains -Path $IndexPath -Pattern 'data-theme' -Description "theme attribute boot script exists"
Assert-FileContains -Path $IndexPath -Pattern 'mmj-theme-mode' -Description "theme storage key exists"
Assert-FileContains -Path $IndexPath -Pattern 'colorScheme' -Description "theme browser color scheme script exists"
Assert-FileContains -Path $CssPath -Pattern '--mmj-bg' -Description "theme CSS tokens exist"
Assert-FileContains -Path $ThemeJsPath -Pattern 'data-theme-toggle' -Description "theme toggle script exists"
Assert-FileContains -Path $HobbiesPath -Pattern 'html\[data-theme="night"\]' -Description "hobbies uses resolved theme selector"

Write-Host "Generated Pages output checks passed"
