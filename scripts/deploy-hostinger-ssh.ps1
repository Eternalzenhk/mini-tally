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
$PackageName = ".hostinger-release.tar.gz"
$PackagePath = Join-Path $Root $PackageName

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

Write-Host "Building Mini Tally..." -ForegroundColor Cyan
npm install
if ($LASTEXITCODE -ne 0) {
  throw "npm install failed."
}
npm run build
if ($LASTEXITCODE -ne 0) {
  throw "npm run build failed."
}

if (Test-Path -LiteralPath $PackagePath) {
  Remove-Item -LiteralPath $PackagePath -Force
}

$packageItems = @(
  "server",
  "src",
  "dist",
  "app.js",
  "index.js",
  "server.js",
  "index.html",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "vite.config.ts",
  "README.md"
)

if ($IncludeLocalData) {
  $packageItems += "data"
}

Write-Host "Creating deployment package..." -ForegroundColor Cyan
tar --format=ustar -czf $PackagePath @packageItems
if ($LASTEXITCODE -ne 0) {
  throw "Failed to create deployment package."
}

$sshIdentityArgs = @()
$scpIdentityArgs = @()
if ($KeyPath) {
  $sshIdentityArgs += @("-i", $KeyPath)
  $scpIdentityArgs += @("-i", $KeyPath)
}

$RemoteTarget = "${User}@${SshHost}"
$RemotePackage = "$RemotePath/$PackageName"
$RemotePathQuoted = Escape-ShellSingleQuote $RemotePath
$RemotePackageQuoted = Escape-ShellSingleQuote $RemotePackage

Write-Host "Uploading package to Hostinger..." -ForegroundColor Cyan
& scp @scpIdentityArgs -P $Port $PackagePath "${RemoteTarget}:$RemotePackage"
if ($LASTEXITCODE -ne 0) {
  throw "Failed to upload deployment package with SCP."
}

$RemoteScript = @"
set -e
APP=$RemotePathQuoted
PACKAGE=$RemotePackageQuoted
STAMP=`$(date +%Y%m%d%H%M%S)
BACKUP="`$APP/.deploy-backup-`$STAMP"

mkdir -p "`$BACKUP" "`$APP/data" "`$APP/tmp"
if [ -d "`$APP/data" ]; then
  cp -a "`$APP/data" "`$BACKUP/data"
fi

tar -xzf "`$PACKAGE" -C "`$APP"

if [ -d "`$BACKUP/data" ] && [ "$IncludeLocalData" != "True" ]; then
  rm -rf "`$APP/data"
  cp -a "`$BACKUP/data" "`$APP/data"
fi

mkdir -p "`$APP/data" "`$APP/tmp"
if [ ! -f "`$APP/data/forms.json" ]; then
  printf '{"forms":[],"responses":[],"webhookEvents":[]}' > "`$APP/data/forms.json"
fi

touch "`$APP/tmp/restart.txt"
find "`$APP" -maxdepth 1 -type d -name '.deploy-backup-*' | sort | head -n -5 | xargs -r rm -rf
"@

Write-Host "Installing release and restarting Hostinger Node app..." -ForegroundColor Cyan
& ssh @sshIdentityArgs -p $Port $RemoteTarget $RemoteScript
if ($LASTEXITCODE -ne 0) {
  throw "Failed to install release on remote host."
}

if ($AppUrl) {
  Write-Host "Checking app URL..." -ForegroundColor Cyan
  Start-Sleep -Seconds 2
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
