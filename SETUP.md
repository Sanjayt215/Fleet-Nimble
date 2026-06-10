# OBD ↔ FleetNimble — Integration Setup Guide

End-to-end guide for **openobd-android** → **fleet/backend** → **fleet/frontend**.

## Architecture

```
ELM327 (Bluetooth) → openobd-android (OBDBluetoothService)
  → POST /api/obd/live-data → PostgreSQL (obd_live_data, obd_raw_backup, gps_locations)
  → Socket.IO room vehicle:{id} → React LiveOBD.jsx
```

## 1. Local stack

### PostgreSQL (port 5433)

```powershell
& "C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe" -D "c:\Users\sanja\Downloads\fleet\.pgdata" -o "-p 5433" start
```

Or Docker: `docker compose up postgres redis -d`

### Backend

```powershell
cd c:\Users\sanja\Downloads\fleet\backend
npx prisma migrate deploy
npx prisma generate
npm run db:seed
npm run dev
```

API: http://localhost:5000/api/health

### Frontend

```powershell
cd c:\Users\sanja\Downloads\fleet\frontend
npm run dev
```

Dashboard: http://localhost:3000  
Login: `admin@fleetnimble.com` / `Admin123!`

### CORS (physical device)

In `backend/.env`:

```
CORS_ORIGIN=http://localhost:3000,http://10.0.2.2:5000,http://192.168.x.x:5000
```

Replace `192.168.x.x` with your PC LAN IP.

## 2. Register vehicle & copy UUID

1. Open http://localhost:3000 → **Vehicles**
2. Note vehicle UUID (seed demo: `00000000-0000-0000-0000-000000000001` for FLT-001)
3. Open **Vehicle Details** → **Live OBD** for real-time gauges

## 3. Android app (openobd-android-master)

### Build

```powershell
cd c:\Users\sanja\Downloads\openobd-android-master\openobd-android-master
.\gradlew assembleDebug
```

Install APK on device via USB debugging.

### Settings (in app)

| Field | Emulator | Physical phone |
|--------|----------|----------------|
| FleetNimble Server URL | `http://10.0.2.2:5000` | `http://<PC_LAN_IP>:5000` |
| FleetNimble Email | `admin@fleetnimble.com` | same |
| FleetNimble Password | `Admin123!` | same |
| Vehicle ID | UUID from dashboard | same |

Tap **Test Connection** → toast should show success.

### Connect OBD

1. Pair ELM327 in Android Bluetooth settings
2. Open app → **CONNECT NOW** → select adapter
3. Go to **Live** tab — gauges show real PIDs; green dot = Fleet upload OK

## 4. Verify data in PostgreSQL

```sql
SELECT v.plate_number, o.rpm, o.speed, o.coolant_temp, o.recorded_at
FROM obd_live_data o
JOIN vehicles v ON v.id = o.vehicle_id
ORDER BY o.recorded_at DESC
LIMIT 20;

SELECT vehicle_id, source, created_at, raw_payload->>'rpm' AS rpm_raw
FROM obd_raw_backup
ORDER BY created_at DESC
LIMIT 10;
```

Connect:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U fleet -h localhost -p 5433 -d fleet_db
```

## 5. API endpoints (integration)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/auth/login` | Android JWT |
| POST | `/api/auth/refresh` | Token refresh |
| POST | `/api/obd/live-data` | Telemetry upload (Zod validated) |
| POST | `/api/obd/live-data/batch` | Offline batch sync (up to 100 readings) |
| POST | `/api/dtc/read` | DTC upload from Android (`03` response) |
| GET | `/api/obd/latest/:vehicleId` | Dashboard poll + `telemetryOnline` |
| GET | `/api/backup/obd/:vehicleId` | Raw backup history |
| POST | `/api/backup/obd/bulk` | Offline sync batch |

### Sample payload

```json
{
  "vehicleId": "00000000-0000-0000-0000-000000000001",
  "rpm": 1450,
  "speed": 62,
  "coolantTemp": 91.5,
  "fuelLevel": 74.2,
  "batteryVoltage": 14.1,
  "throttle": 18.4,
  "engineLoad": 32.1,
  "latitude": 13.0827,
  "longitude": 80.2707,
  "source": "android"
}
```

## 6. Database backup

```powershell
cd backend
npm run backup
```

Requires `pg_dump` on PATH. Keeps last 30 gzip dumps in `backend/backups/`.

## Environment (optional)

```env
OBD_RATE_LIMIT_MAX=180
OBD_RETENTION_DAYS=90
RATE_LIMIT_MAX=1000
HOST=0.0.0.0
```

Socket events: `live:update`, `vehicle:status`, `dtc:new`, `alert:new`. Frontend reconnects and re-joins rooms on connect.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Android can't reach API | Use LAN IP, not `localhost`; enable `usesCleartextTraffic`; widen `CORS_ORIGIN` |
| Bluetooth won't connect | Pair ELM327 first; grant Bluetooth + Location permissions |
| JWT 401 | Re-run **Test Connection** in Settings; check email/password |
| `obd_raw_backup` missing | Run `npx prisma migrate deploy` in backend |
| Dashboard not live | Confirm Socket.IO; open `/vehicles/{id}/live`; mobile must upload with same `vehicleId` |
| No paired OBD devices | Rename contains OBD/ELM/V-LINK/OBDII |

## Security hardening (production)

- Rotate `JWT_SECRET` and `JWT_REFRESH_SECRET`
- HTTPS via Nginx or Let's Encrypt
- Rate limit on `/api/obd/live-data` (see `rateLimiter.js`)
- Restrict `DATABASE_URL` to non-superuser DB role
- Review `obd_raw_backup.raw_payload` for PII retention policy

## Key ports

| Service | Port |
|---------|------|
| Backend | 5000 |
| Frontend | 3000 |
| PostgreSQL | 5433 |
| Android emulator API | 10.0.2.2:5000 |
