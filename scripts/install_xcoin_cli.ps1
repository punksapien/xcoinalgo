# xcoin CLI installer for Windows (PowerShell)
# - Installs uv if missing
# - Creates isolated venv at %USERPROFILE%\.xcoin-cli\venv
# - Installs xcoin CLI (editable) into that venv via uv
# - Creates shim at %USERPROFILE%\.local\bin\xcoin.cmd so activation isn't required

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Write-Host '[xcoin-installer] starting (Windows)'

# Resolve repo root from this script's location (.. from scripts/)
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $ScriptDir
$CliPath = Join-Path $RepoRoot 'cli'
if (-not (Test-Path (Join-Path $CliPath 'pyproject.toml'))) {
  Write-Error "[xcoin-installer] ERROR: could not find CLI at $CliPath"
}

$HomeDir = [Environment]::GetFolderPath('UserProfile')
$LocalBin = Join-Path $HomeDir '.local\bin'
if (-not (Test-Path $LocalBin)) { New-Item -ItemType Directory -Force -Path $LocalBin | Out-Null }

# Ensure uv exists
function Ensure-Uv {
  $uv = Get-Command uv -ErrorAction SilentlyContinue
  if (-not $uv) {
    Write-Host '[xcoin-installer] installing uv'
    Invoke-Expression (Invoke-WebRequest -UseBasicParsing https://astral.sh/uv/install.ps1).Content
    # Update PATH for current session
    $env:PATH = "$LocalBin;$env:USERPROFILE\.cargo\bin;$env:PATH"
  }
}

Ensure-Uv

$VenvDir = Join-Path $HomeDir '.xcoin-cli\venv'
if (-not (Test-Path $VenvDir)) {
  Write-Host "[xcoin-installer] creating venv at $VenvDir"
  uv venv "$VenvDir"
}

$Py = Join-Path $VenvDir 'Scripts\python.exe'

# Bootstrap pip if missing
try {
  & $Py -m pip --version | Out-Null
} catch {
  Write-Host '[xcoin-installer] bootstrapping pip'
  $getpip = Join-Path $HomeDir '.xcoin-cli\get-pip.py'
  Invoke-WebRequest -UseBasicParsing -Uri https://bootstrap.pypa.io/get-pip.py -OutFile $getpip
  & $Py $getpip
}

& $Py -m pip install -U pip setuptools wheel | Out-Null

Write-Host "[xcoin-installer] installing xcoin CLI (editable) from $CliPath"
uv pip install --python "$Py" -e "$CliPath"

# Create shim so `xcoin` is on PATH without activating venv
$Shim = Join-Path $LocalBin 'xcoin.cmd'
@"
@echo off
"%USERPROFILE%\.xcoin-cli\venv\Scripts\xcoin.exe" %*
"@ | Set-Content -Encoding ASCII -NoNewline $Shim

Write-Host "[xcoin-installer] binary shim: $Shim"

# Suggest PATH update if LocalBin not in PATH
if (-not ($env:PATH -split ';' | Where-Object { $_ -eq $LocalBin })) {
  Write-Host "[xcoin-installer] NOTICE: add to PATH (User) so xcoin is available in new shells:"
  Write-Host "  setx PATH \"$LocalBin;%PATH%\""
}

Write-Host '[xcoin-installer] verifying...'
& (Join-Path $VenvDir 'Scripts\xcoin.exe') --version
Write-Host '[xcoin-installer] done'


