# API Structure

## Versioning

| Prefix | Status | Notes |
|--------|--------|-------|
| `/api/*` | Legacy (v0) | Existing mobile + dashboard |
| `/api/v1/*` | Current | New telematics + device APIs |

## Authentication

```
Authorization: Bearer <access_token>
X-Tenant-Id: <companyId>   # Required for v1 multi-tenant routes
```

Device provisioning uses admin JWT. Devices use MQTT credentials, not REST JWT.

---

## v1 Endpoints (New)

### Devices

| Method | Path | Role | Description |
|--------|------|------|-------------|
| POST | `/api/v1/devices/provision` | ADMIN, MANAGER | Register telematics device |
| GET | `/api/v1/devices` | ADMIN, MANAGER | List company devices |
| GET | `/api/v1/devices/:id` | ADMIN, MANAGER | Device detail + MQTT config |
| PATCH | `/api/v1/devices/:id` | ADMIN | Assign vehicle, rotate secret |
| DELETE | `/api/v1/devices/:id` | ADMIN | Revoke device |
| POST | `/api/v1/devices/:id/rotate-secret` | ADMIN | New MQTT password |

### Telemetry

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/v1/telemetry/latest/:vehicleId` | All | Latest reading + online status |
| GET | `/api/v1/telemetry/history/:vehicleId` | All | Paginated history |
| GET | `/api/v1/telemetry/stream/:vehicleId` | All | SSE fallback (no Socket.IO) |

### Fleet

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/v1/fleet/map` | All | All vehicles + last GPS for map |
| GET | `/api/v1/fleet/health` | All | Health scores per vehicle |
| GET | `/api/v1/fleet/stats` | MANAGER+ | KPI aggregates |

### Geofences

| Method | Path | Role | Description |
|--------|------|------|-------------|
| CRUD | `/api/v1/geofences` | MANAGER+ | Zone management |
| GET | `/api/v1/geofences/:id/events` | MANAGER+ | Enter/exit log |

### Driver Analytics

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/v1/drivers/scores` | MANAGER+ | Leaderboard |
| GET | `/api/v1/drivers/:id/behavior` | MANAGER+ | Harsh events timeline |

### Trips

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/v1/trips/:id/replay` | All | GPS polyline for playback |
| GET | `/api/v1/trips/active` | All | In-progress trips |

### Notifications

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/v1/notifications` | All | User inbox |
| POST | `/api/v1/notifications/register-device` | All | FCM/APNs token |

### Admin / Audit

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/v1/audit-logs` | ADMIN | Security audit trail |
| GET | `/api/v1/companies/current` | All | Tenant profile |

---

## Legacy Endpoints (Maintained)

See existing `backend/src/routes/index.js`:
- `/api/auth/*`
- `/api/obd/live-data` ← deprecate after MQTT migration
- `/api/vehicles/*`
- `/api/dtc/*`
- `/api/dashboard/stats`

---

## Response Envelope

```json
{
  "success": true,
  "data": { },
  "meta": { "page": 1, "limit": 20, "total": 142 },
  "error": null
}
```

## Rate Limits

| Route group | Limit |
|-------------|-------|
| Auth | 20/min/IP |
| OBD ingest (HTTP legacy) | 180/min/vehicle |
| MQTT | Broker-side + 500 msg/s/device cap |
| v1 REST | 1000/15min/user |

## WebSocket Events (Unchanged)

| Event | Direction |
|-------|-----------|
| `live:update` | Server → Dashboard |
| `alert:new` | Server → Dashboard |
| `vehicle:status` | Server → Dashboard |
| `dtc:new` | Server → Dashboard |
| `trip:update` | Server → Dashboard |

## Webhook Integrations (Phase 3)

```
POST https://customer.com/webhooks/fleet
X-Fleet-Signature: HMAC-SHA256
Events: alert.created, trip.completed, geofence.entered, dtc.detected
```
