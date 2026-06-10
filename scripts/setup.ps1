# FleetNimble local setup (Windows PowerShell)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

Write-Host "=== FleetNimble Setup ===" -ForegroundColor Cyan

# Backend
Write-Host "`n[1/3] Backend..." -ForegroundColor Yellow
Set-Location "$root\backend"
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm install
npx prisma generate
Write-Host "Run migrations when PostgreSQL is up:" -ForegroundColor Gray
Write-Host "  npx prisma migrate deploy && npm run db:seed" -ForegroundColor Gray

# Frontend
Write-Host "`n[2/3] Frontend..." -ForegroundColor Yellow
Set-Location "$root\frontend"
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm install

# Mobile
Write-Host "`n[3/3] Mobile..." -ForegroundColor Yellow
Set-Location "$root\mobile"
if (Get-Command flutter -ErrorAction SilentlyContinue) {
    flutter pub get
    Write-Host "Flutter ready. Run: flutter run --dart-define=API_URL=http://10.0.2.2:5000/api" -ForegroundColor Green
} else {
    Write-Host "Flutter SDK not in PATH. Install from https://flutter.dev then run:" -ForegroundColor Yellow
    Write-Host "  cd mobile && flutter pub get && flutter run" -ForegroundColor Gray
}

Set-Location $root
Write-Host "`n=== Done ===" -ForegroundColor Green
Write-Host "Start stack (with Docker): docker compose up --build" -ForegroundColor Cyan
Write-Host "Or manually:" -ForegroundColor Cyan
Write-Host "  Terminal 1: cd backend && npm run dev" -ForegroundColor Gray
Write-Host "  Terminal 2: cd frontend && npm run dev" -ForegroundColor Gray
Write-Host "  Login: admin@fleetnimble.com / Admin123!" -ForegroundColor Gray
