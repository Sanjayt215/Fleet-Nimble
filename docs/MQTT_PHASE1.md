# MQTT Phase 1 — Implementation Guide

Dual-write architecture: **HTTP + Socket.IO unchanged**, MQTT ingest runs in parallel.

## Telemetry Ingestion Points (Existing)

| Path | File | Method |
|------|------|--------|
| HTTP single | `backend/src/controllers/obdController.js` | `POST /api/obd/live-data` |
| HTTP batch | `backend/src/controllers/obdController.js` | `POST /api/obd/live-data/batch` |
| Socket.IO | `backend/src/sockets/index.js` | `vehicle:liveData` event |
| **MQTT (new)** | `backend/src/mqtt/handlers/telemetryHandler.js` | EMQX topics |

All paths converge on `ingestObdReading()` → PostgreSQL → `broadcastLiveUpdate()` → Socket.IO.

## Files Changed (Phase 1)

### Backend — MQTT Core

| File | Why |
|------|-----|
| `backend/src/mqtt/connectionManager.js` | Connection state, metrics, resubscribe on reconnect |
| `backend/src/mqtt/consumer.js` | MQTT client, queue, DLQ integration |
| `backend/src/mqtt/messageQueue.js` | Bounded concurrency during bursts |
| `backend/src/mqtt/deduplication.js` | QoS 1 idempotency (`messageId`) |
| `backend/src/mqtt/deadLetter.js` | Failed message storage + retry |
| `backend/src/mqtt/topics.js` | Topic parse/validate + heartbeat topic |
| `backend/src/mqtt/handlers/telemetryHandler.js` | Route OBD/GPS/DTC/behavior/heartbeat |

### Backend — Services & API

| File | Why |
|------|-----|
| `backend/src/services/deviceAuthService.js` | Device UID validation, heartbeat tracking |
| `backend/src/services/vehicleTelemetryStatus.js` | `telemetryHealth` for dashboard |
| `backend/src/services/telemetryBroadcast.js` | Shared Socket.IO fan-out (HTTP + MQTT) |
| `backend/src/services/deviceProvisioningService.js` | Device registration + MQTT topics |
| `backend/src/controllers/obdController.js` | Uses shared broadcast (HTTP unchanged) |
| `backend/src/controllers/vehicleController.js` | Returns `telemetryHealth` |
| `backend/src/routes/v1/*` | Device provisioning + fleet map API |
| `backend/src/routes/index.js` | `GET /api/health/mqtt` |
| `backend/src/cron/index.js` | DLQ retry, heartbeat stale check |
| `backend/src/config/index.js` | MQTT env configuration |

### Database

| Migration | Adds |
|-----------|------|
| `20260529180000_enterprise_telematics` | Company, TelematicsDevice, Geofence, etc. |
| `20260529200000_mqtt_deadletter_heartbeat` | `mqtt_dead_letters`, `last_heartbeat_at` |

### Frontend

| File | Why |
|------|-----|
| `frontend/src/components/VehicleStatusBadge.jsx` | Online/offline + MQTT status |
| `frontend/src/pages/Vehicles.jsx` | Status column |
| `frontend/src/pages/VehicleDetails.jsx` | Telemetry health card |
| `frontend/src/pages/LiveOBD.jsx` | MQTT heartbeat + health |
| `frontend/src/pages/Dashboard.jsx` | Uses `telemetryHealth` when available |

### Scripts

| File | Why |
|------|-----|
| `backend/scripts/mqtt-e2e-test.js` | MQTT → API validation |

## Verification Steps

### 1. Start PostgreSQL

```powershell
& "C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe" -D "c:\Users\sanja\Downloads\fleet\.pgdata" -o "-p 5433" start
cd backend
npx prisma migrate deploy
npm run dev
```

### 2. Start EMQX (optional for MQTT test)

```powershell
docker compose -f docker-compose.yml -f docker-compose.telemetry.yml up -d emqx
```

Set in `backend/.env`:
```
MQTT_ENABLED=true
MQTT_URL=mqtt://localhost:1883
```

### 3. Check MQTT health

```powershell
curl http://localhost:5000/api/health/mqtt
```

Expect `"connected": true` when broker is running.

### 4. Run E2E test

```powershell
cd backend
npm run mqtt:test
```

Expect: `PASS: MQTT → PostgreSQL → REST API`

### 5. Verify HTTP still works

```powershell
# Login + POST /api/obd/live-data (existing mobile flow)
```

Dashboard Live OBD should update via Socket.IO for both HTTP and MQTT.

### 6. Verify dashboard badges

Open http://localhost:3000/vehicles — status dots should reflect `telemetryHealth.streamStatus`.

## Rollback Steps

### Disable MQTT only (keep HTTP)

```env
MQTT_ENABLED=false
```

Restart backend. HTTP + Socket.IO continue unchanged.

### Revert database migration

```powershell
# Only if needed — backup first
npx prisma migrate resolve --rolled-back 20260529200000_mqtt_deadletter_heartbeat
```

Or restore from `backend/backups/` pg_dump.

### Full git rollback

```powershell
git checkout -- backend/src/mqtt backend/src/services/deviceAuthService.js
git checkout -- frontend/src/components/VehicleStatusBadge.jsx
```

## Topic Reference

```
fleet/{tenantId}/{vehicleId}/telemetry/obd
fleet/{tenantId}/{vehicleId}/telemetry/gps
fleet/{tenantId}/{vehicleId}/telemetry/dtc
fleet/{tenantId}/{vehicleId}/telemetry/behavior
fleet/{tenantId}/{vehicleId}/heartbeat
```

Tenant for seed data: `default`  
Demo vehicle: `00000000-0000-0000-0000-000000000001`
