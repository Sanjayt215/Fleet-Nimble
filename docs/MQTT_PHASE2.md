# MQTT Phase 2 — Mobile Cloud Connectivity

Dual-write from Flutter: **MQTT + HTTP** in parallel.

## What Changed

| File | Why |
|------|-----|
| `mobile/lib/services/mqtt_service.dart` | Full `mqtt_client` implementation, reconnect, heartbeat |
| `mobile/lib/services/telemetry_publisher.dart` | Dual-write orchestrator |
| `mobile/lib/services/sync_service.dart` | Offline queue drains via MQTT + HTTP batch |
| `mobile/lib/services/api_service.dart` | `provisionMqttDevice`, `postLiveDataBatch` |
| `mobile/lib/screens/gauges_screen.dart` | Uses `TelemetryPublisher` |
| `mobile/lib/screens/settings_screen.dart` | Provision & connect UI |
| `mobile/lib/utils/config.dart` | `MQTT_BROKER`, `MQTT_PORT` dart-defines |
| `backend/.../deviceRoutes.js` | `POST /api/v1/devices/provision-mobile` |

## Mobile Setup (Physical Device or Emulator)

### 1. Start backend + MQTT

```powershell
# PostgreSQL + backend
cd backend
npm run dev

# EMQX (Docker)
docker compose -f docker-compose.yml -f docker-compose.telemetry.yml up -d emqx
```

`backend/.env`:
```
MQTT_ENABLED=true
MQTT_URL=mqtt://localhost:1883
MQTT_PUBLIC_URL=mqtt://<YOUR_PC_LAN_IP>:1883
```

### 2. Run Flutter app

```powershell
cd mobile
flutter pub get
flutter run --dart-define=API_URL=http://<PC_IP>:5000/api --dart-define=SOCKET_URL=http://<PC_IP>:5000 --dart-define=MQTT_BROKER=<PC_IP> --dart-define=MQTT_PORT=1883
```

Emulator defaults: `10.0.2.2`

### 3. In app

1. Login `admin@fleetnimble.com` / `Admin123!`
2. Select vehicle **FLT-001**
3. **Settings** → Enable MQTT → **Provision & Connect MQTT**
4. Connect OBD → **Gauges** tab
5. Status shows `Cloud MQTT + HTTP` or `Cloud MQTT`

### 4. Verify dashboard

Open http://localhost:3000/vehicles/{id}/live — gauges update via Socket.IO from MQTT ingest.

## Verification

```powershell
cd backend
npm run mqtt:test
curl http://localhost:5000/api/health/mqtt
```

## Rollback

- Disable MQTT in app Settings toggle
- HTTP-only mode resumes automatically
- `MQTT_ENABLED=false` on backend stops consumer

## Known: Re-provision

If device already provisioned, secret is shown **once**. Save credentials from first provision or revoke from DB and re-provision.
