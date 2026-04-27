param(
  [string]$SshHost = $env:HOSTINGER_HOST,
  [string]$User = $env:HOSTINGER_USER,
  [int]$Port = $(if ($env:HOSTINGER_PORT) { [int]$env:HOSTINGER_PORT } else { 65002 }),
  [string]$RemotePath = $env:HOSTINGER_PATH,
  [string]$AppUrl = $env:HOSTINGER_APP_URL,
  [string]$KeyPath = $env:HOSTINGER_SSH_KEY,
  [switch]$IncludeLocalData
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$PackageScript = Join-Path $Root "scripts\deploy-hostinger.ps1"
$PackageName = ".hostinger-release.zip"
$ZipPath = Join-Path $Root $PackageName

function Assert-Value($Name, $Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) {
    throw "Missing $Name. Set it as a parameter or environment variable."
  }
}

function Escape-ShellSingleQuote($Value) {
  return "'" + [string]($Value).Replace("'", "'`"`"'`"") + "'"
}

Assert-Value "HOSTINGER_HOST" $SshHost
Assert-Value "HOSTINGER_USER" $User
Assert-Value "HOSTINGER_PATH" $RemotePath

if ($KeyPath -and -not (Test-Path -LiteralPath $KeyPath)) {
  throw "HOSTINGER_SSH_KEY was provided, but the file does not exist: $KeyPath"
}

Set-Location $Root

$packageArgs = @("-Output", $PackageName)
if ($IncludeLocalData) {
  $packageArgs += "-IncludeLocalData"
}

Write-Host "Preparing deployment package..." -ForegroundColor Cyan
& $PackageScript @packageArgs

$sshIdentityArgs = @()
$scpIdentityArgs = @()
if ($KeyPath) {
  $sshIdentityArgs += @("-i", $KeyPath)
  $scpIdentityArgs += @("-i", $KeyPath)
}

$RemoteRoot = Escape-ShellSingleQuote $RemotePath
$RemoteZip = "$RemotePath/$PackageName"
$RemoteZipQuoted = Escape-ShellSingleQuote $RemoteZip
$RemoteTarget = "${User}@${SshHost}"

Write-Host "Creating remote directories..." -ForegroundColor Cyan
& ssh @sshIdentityArgs -p $Port $RemoteTarget "mkdir -p $RemoteRoot/releases $RemoteRoot/shared/data"

Write-Host "Uploading package to Hostinger..." -ForegroundColor Cyan
& scp @scpIdentityArgs -P $Port $ZipPath "${RemoteTarget}:$RemoteZip"

$RemoteScript = @"
set -e
ROOT=$RemoteRoot
PACKAGE=$RemoteZipQuoted
STAMP=`$(date +%Y%m%d%H%M%S)
RELEASE="`$ROOT/releases/`$STAMP"

mkdir -p "`$ROOT/releases" "`$ROOT/shared/data"
unzip -oq "`$PACKAGE" -d "`$RELEASE"

if [ ! -f "`$ROOT/shared/data/forms.json" ]; then
  if [ -f "`$RELEASE/data/forms.json" ]; then
    cp "`$RELEASE/data/forms.json" "`$ROOT/shared/data/forms.json"
  else
    printf '{"forms":[],"responses":[],"webhookEvents":[]}' > "`$ROOT/shared/data/forms.json"
  fi
fi

rm -rf "`$RELEASE/data"
ln -s "`$ROOT/shared/data" "`$RELEASE/data"

cd "`$RELEASE"
npm install --omit=optional
npm run build

ln -sfn "`$RELEASE" "`$ROOT/current"

if command -v pm2 >/dev/null 2>&1; then
  cd "`$ROOT/current"
  if pm2 describe mini-tally >/dev/null 2>&1; then
    pm2 restart mini-tally --update-env
  else
    pm2 start server/index.js --name mini-tally --update-env
  fi
  pm2 save || true
else
  echo "pm2 not found. Release is ready at `$ROOT/current"
  echo "Start command: cd `$ROOT/current && npm start"
fi

find "`$ROOT/releases" -mindepth 1 -maxdepth 1 -type d | sort | head -n -5 | xargs -r rm -rf
"@

Write-Host "Installing and activating release..." -ForegroundColor Cyan
& ssh @sshIdentityArgs -p $Port $RemoteTarget $RemoteScript

if ($AppUrl) {
  Write-Host "Checking app URL..." -ForegroundColor Cyan
  $response = Invoke-WebRequest -Uri $AppUrl -UseBasicParsing -TimeoutSec 30
  if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 400) {
    throw "Health check failed with status $($response.StatusCode): $AppUrl"
  }
}

Write-Host ""
Write-Host "Hostinger deployment complete." -ForegroundColor Green
if ($AppUrl) {
  Write-Host $AppUrl
}
