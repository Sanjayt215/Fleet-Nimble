# Start FleetNimble (local PostgreSQL on 5433 + API + Dashboard)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$pg = "C:\Program Files\PostgreSQL\18\bin"
$dataDir = "$root\.pgdata"

if (Test-Path "$pg\pg_ctl.exe") {
  $status = & "$pg\pg_ctl.exe" -D $dataDir status 2>&1
  if ($status -match "no server running") {
    Write-Host "Starting PostgreSQL on port 5433..." -ForegroundColor Yellow
    & "$pg\pg_ctl.exe" -D $dataDir -l "$dataDir\server.log" -o "-p 5433" start
    Start-Sleep -Seconds 2
  }
} else {
  Write-Host "PostgreSQL bin not found. Ensure DATABASE_URL in backend/.env is valid." -ForegroundColor Red
}

Write-Host "Backend:  http://localhost:5000" -ForegroundColor Cyan
Write-Host "Dashboard: http://localhost:3000" -ForegroundColor Cyan
Write-Host "Login: admin@fleetnimble.com / Admin123!" -ForegroundColor Gray
Write-Host ""
Write-Host "Open two terminals and run:" -ForegroundColor Yellow
Write-Host "  cd backend && npm run dev"
Write-Host "  cd frontend && npm run dev"
