param(
  [string]$BundlePath = "vendor/bundle"
)

. (Join-Path $PSScriptRoot "pages-env.ps1")

if (-not (Test-Path (Join-Path $RepoRootPath "Gemfile"))) {
  throw "Gemfile was not found at $RepoRootPath"
}

Require-Command -Name "ruby" -InstallHint "Install Ruby for Windows and reopen PowerShell." | Out-Null
Require-Command -Name "bundle" -InstallHint "Install Bundler with 'gem install bundler'." | Out-Null

$Python = Get-PythonInvocation
$PythonCommand = $Python.Command
$PythonArgs = @($Python.Arguments)

Write-Host "Ruby"
Invoke-Native { ruby -v }
Write-Host "Bundler"
Invoke-Native { bundle -v }
Write-Host "Python"
Invoke-Native { & $PythonCommand @PythonArgs --version }

Write-Host "Configuring Bundler path $BundlePath"
Invoke-Native { bundle config set --local path $BundlePath }
Invoke-Native { bundle config set --local clean true }

Write-Host "Installing GitHub Pages bundle"
Invoke-Native { bundle install }

Write-Host "Jekyll"
Invoke-Native { bundle exec jekyll --version }
