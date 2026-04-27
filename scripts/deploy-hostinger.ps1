param(
  [string]$Output = "mini-tally-hostinger.zip",
  [switch]$IncludeLocalData,
  [switch]$OpenHostinger
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$ZipPath = Join-Path $Root $Output
$Staging = Join-Path $Root ".deploy-hostinger"

Set-Location $Root

Write-Host "Building Mini Tally..." -ForegroundColor Cyan
npm install
npm run build

if (Test-Path $ZipPath) {
  Remove-Item -LiteralPath $ZipPath -Force
}

if (Test-Path $Staging) {
  Remove-Item -LiteralPath $Staging -Recurse -Force
}

New-Item -ItemType Directory -Path $Staging | Out-Null

$Items = @(
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

foreach ($Item in $Items) {
  Copy-Item -Path (Join-Path $Root $Item) -Destination $Staging -Recurse
}

$DistServer = Join-Path $Staging "dist\server"
Copy-Item -Path (Join-Path $Root "server") -Destination $DistServer -Recurse
Copy-Item -Path (Join-Path $Root "scripts\dist-app.js") -Destination (Join-Path $Staging "dist\app.js")
Copy-Item -Path (Join-Path $Root "scripts\dist-app.js") -Destination (Join-Path $Staging "dist\index.js")
Copy-Item -Path (Join-Path $Root "scripts\dist-app.js") -Destination (Join-Path $Staging "dist\server.js")
Copy-Item -Path (Join-Path $Root "scripts\dist-package.json") -Destination (Join-Path $Staging "dist\package.json")

New-Item -ItemType Directory -Path (Join-Path $Staging "data") | Out-Null

if ($IncludeLocalData) {
  Copy-Item -Path (Join-Path $Root "data\forms.json") -Destination (Join-Path $Staging "data\forms.json")
} else {
  '{"forms":[],"responses":[],"webhookEvents":[]}' | Set-Content -Path (Join-Path $Staging "data\forms.json") -Encoding UTF8
}

Write-Host "Creating deployment zip..." -ForegroundColor Cyan
Compress-Archive -Path (Join-Path $Staging "*") -DestinationPath $ZipPath -Force
Remove-Item -LiteralPath $Staging -Recurse -Force

Write-Host ""
Write-Host "Deployment package ready:" -ForegroundColor Green
Write-Host $ZipPath
Write-Host ""
Write-Host "Hostinger Node.js settings:" -ForegroundColor Yellow
Write-Host "Startup file: app.js"
Write-Host "Install command: npm install"
Write-Host "Build command: npm run build"
Write-Host "Start command: npm start"
Write-Host "Node version: 20+"
Write-Host ""

if ($OpenHostinger) {
  Start-Process "https://hpanel.hostinger.com/"
  Start-Process "explorer.exe" "/select,`"$ZipPath`""
}
