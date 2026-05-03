param(
  [string]$SshHost = $env:HOSTINGER_HOST,
  [string]$User = $env:HOSTINGER_USER,
  [int]$Port = $(if ($env:HOSTINGER_PORT) { [int]$env:HOSTINGER_PORT } else { 65002 }),
  [string]$RemotePath = $env:HOSTINGER_PATH,
  [string]$AppUrl = $env:HOSTINGER_APP_URL,
  [string]$KeyPath = $env:HOSTINGER_SSH_KEY,
  [string]$AdminPassword = $env:HOSTINGER_ADMIN_PASSWORD,
  [string]$PublicFormKey = $env:HOSTINGER_PUBLIC_FORM_KEY,
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

for item in server src dist app.js index.js server.js index.html package.json package-lock.json tsconfig.json vite.config.ts README.md; do
  if [ -e "`$APP/`$item" ]; then
    chmod -R u+w "`$APP/`$item" 2>/dev/null || true
  fi
done

tar -xzf "`$PACKAGE" -C "`$APP"
chmod -R u+rwX "`$APP/server" "`$APP/src" "`$APP/dist" "`$APP/tmp" 2>/dev/null || true

if [ -d "`$BACKUP/data" ] && [ "$IncludeLocalData" != "True" ]; then
  rm -rf "`$APP/data"
  cp -a "`$BACKUP/data" "`$APP/data"
fi

mkdir -p "`$APP/data" "`$APP/tmp"
if [ ! -f "`$APP/data/forms.json" ]; then
  printf '{"forms":[],"responses":[],"webhookEvents":[]}' > "`$APP/data/forms.json"
fi
if [ -f "`$APP/data/mini-tally.sqlite" ]; then
  cp -a "`$APP/data/mini-tally.sqlite" "`$BACKUP/mini-tally.sqlite"
fi
if [ -d "`$APP/data/uploads" ]; then
  mkdir -p "`$BACKUP/uploads"
  cp -a "`$APP/data/uploads/." "`$BACKUP/uploads/"
fi

touch "`$APP/tmp/restart.txt"
find "`$APP" -maxdepth 1 -type d -name '.deploy-backup-*' | sort | head -n -7 | xargs -r rm -rf
"@

Write-Host "Installing release and restarting Hostinger Node app..." -ForegroundColor Cyan
& ssh @sshIdentityArgs -p $Port $RemoteTarget $RemoteScript
if ($LASTEXITCODE -ne 0) {
  throw "Failed to install release on remote host."
}

if ($AppUrl) {
  $BaseUrl = $AppUrl.TrimEnd("/")
  $HealthUrl = $BaseUrl
  if ($BaseUrl -match "/healthz$") {
    $BaseUrl = $BaseUrl -replace "/healthz$", ""
  } else {
    $HealthUrl = "$BaseUrl/healthz"
  }

  Write-Host "Checking health URL..." -ForegroundColor Cyan
  Start-Sleep -Seconds 2
  $response = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 30
  if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 400) {
    throw "Health check failed with status $($response.StatusCode): $HealthUrl"
  }

  $authUrl = "$BaseUrl/api/auth/me"
  try {
    $authResponse = Invoke-WebRequest -Uri $authUrl -UseBasicParsing -TimeoutSec 30
    if ($authResponse.StatusCode -lt 200 -or $authResponse.StatusCode -ge 400) {
      throw "Auth check failed with status $($authResponse.StatusCode): $authUrl"
    }
  } catch {
    Write-Warning "Auth check did not complete: $($_.Exception.Message)"
  }

  if ($AdminPassword) {
    Write-Host "Checking admin login and forms API..." -ForegroundColor Cyan
    $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    $loginBody = @{ password = $AdminPassword } | ConvertTo-Json -Compress
    $loginResponse = Invoke-WebRequest -Uri "$BaseUrl/api/auth/login" -Method Post -Body $loginBody -ContentType "application/json" -WebSession $session -UseBasicParsing -TimeoutSec 30
    if ($loginResponse.StatusCode -lt 200 -or $loginResponse.StatusCode -ge 400) {
      throw "Admin login check failed with status $($loginResponse.StatusCode)."
    }
    $formsResponse = Invoke-WebRequest -Uri "$BaseUrl/api/forms" -WebSession $session -UseBasicParsing -TimeoutSec 30
    if ($formsResponse.StatusCode -lt 200 -or $formsResponse.StatusCode -ge 400) {
      throw "Admin forms check failed with status $($formsResponse.StatusCode)."
    }
  } else {
    Write-Warning "Skipping admin forms check because HOSTINGER_ADMIN_PASSWORD is not set."
  }

  if ($PublicFormKey) {
    Write-Host "Checking public form..." -ForegroundColor Cyan
    $encodedFormKey = [uri]::EscapeDataString($PublicFormKey)
    $publicApiResponse = Invoke-WebRequest -Uri "$BaseUrl/api/public/forms/$encodedFormKey" -UseBasicParsing -TimeoutSec 30
    if ($publicApiResponse.StatusCode -lt 200 -or $publicApiResponse.StatusCode -ge 400) {
      throw "Public form API check failed with status $($publicApiResponse.StatusCode)."
    }
    $publicPageResponse = Invoke-WebRequest -Uri "$BaseUrl/form/$encodedFormKey" -UseBasicParsing -TimeoutSec 30
    if ($publicPageResponse.StatusCode -lt 200 -or $publicPageResponse.StatusCode -ge 400) {
      throw "Public form page check failed with status $($publicPageResponse.StatusCode)."
    }
  } else {
    Write-Warning "Skipping public form check because HOSTINGER_PUBLIC_FORM_KEY is not set."
  }
}

Write-Host ""
Write-Host "Hostinger deployment complete." -ForegroundColor Green
if ($AppUrl) {
  Write-Host $AppUrl
}
