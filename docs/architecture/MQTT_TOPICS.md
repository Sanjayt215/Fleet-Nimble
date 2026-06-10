# MQTT Topic Structure

## Hierarchy

```
fleet/{tenantId}/{vehicleId}/{channel}/{type}
```

| Segment | Format | Example |
|---------|--------|---------|
| `tenantId` | Company UUID or slug | `acme-logistics` |
| `vehicleId` | Vehicle UUID | `00000000-0000-0000-0000-000000000001` |
| `channel` | telemetry \| status \| cmd \| ack | `telemetry` |
| `type` | obd \| gps \| dtc \| behavior \| trip | `obd` |

## Publish Topics (Device → Cloud)

| Topic | QoS | Rate | Payload |
|-------|-----|------|---------|
| `fleet/{tenant}/{vehicle}/telemetry/obd` | 1 | 1–2 Hz | OBD PID bundle |
| `fleet/{tenant}/{vehicle}/telemetry/gps` | 1 | 0.5–1 Hz | GPS fix |
| `fleet/{tenant}/{vehicle}/telemetry/dtc` | 1 | On event | DTC array |
| `fleet/{tenant}/{vehicle}/telemetry/behavior` | 1 | On event | Harsh brake/accel |
| `fleet/{tenant}/{vehicle}/status/online` | 1 | On connect | `{ "status": "online" }` |
| `fleet/{tenant}/{vehicle}/status/offline` | 1 | Will message | LWT offline |

## Subscribe Topics (Cloud → Device)

| Topic | QoS | Purpose |
|-------|-----|---------|
| `fleet/{tenant}/{vehicle}/cmd/config` | 1 | Poll interval, PID list |
| `fleet/{tenant}/{vehicle}/cmd/diagnostic` | 1 | UDS remote session |
| `fleet/{tenant}/{vehicle}/cmd/ota` | 1 | Firmware update URL |

## Backend Consumer Subscriptions

```
fleet/+/+/telemetry/obd      # Primary OBD ingest
fleet/+/+/telemetry/gps        # GPS-only updates
fleet/+/+/telemetry/dtc        # Fault codes
fleet/+/+/telemetry/behavior   # Driver events
fleet/+/+/status/#             # Online/offline
```

## Sample OBD Payload (JSON)

```json
{
  "messageId": "550e8400-e29b-41d4-a716-446655440000",
  "sequence": 1842,
  "deviceId": "elm-ble-a1b2c3",
  "timestamp": "2026-05-29T12:00:00.000Z",
  "source": "mqtt",
  "rpm": 1450,
  "speed": 62,
  "coolantTemp": 91.5,
  "fuelLevel": 74.2,
  "batteryVoltage": 14.1,
  "throttle": 18.4,
  "engineLoad": 32.1,
  "latitude": 13.0827,
  "longitude": 80.2707,
  "heading": 180,
  "gpsAccuracy": 5.2
}
```

## Sample Behavior Payload

```json
{
  "messageId": "uuid",
  "type": "HARSH_BRAKE",
  "severity": "MEDIUM",
  "speedBefore": 65,
  "speedAfter": 42,
  "gForce": -0.45,
  "latitude": 13.08,
  "longitude": 80.27,
  "timestamp": "2026-05-29T12:00:00.000Z"
}
```

## ACL Rules (EMQX)

| Client | Publish | Subscribe |
|--------|---------|-----------|
| Device `{deviceUid}` | `fleet/{ownTenant}/{ownVehicle}/telemetry/#`, `.../status/#` | `fleet/{ownTenant}/{ownVehicle}/cmd/#` |
| Backend ingest | — | `fleet/+/+/telemetry/#`, `fleet/+/+/status/#` |
| Backend command | `fleet/+/+/cmd/#` | — |
| Dashboard (optional) | — | `fleet/{tenant}/+/telemetry/#` (read-only bridge) |

## QoS Strategy

- **QoS 0:** Debug CAN dumps, high-frequency raw frames
- **QoS 1:** All production telemetry (at-least-once)
- **QoS 2:** Not recommended (latency cost); use idempotent consumers instead

## Offline / Retry (Mobile)

1. Publish fails → SQLite queue (`offline_cache` table, existing)
2. Exponential backoff: 1s, 2s, 4s … max 60s
3. On reconnect → drain queue oldest-first
4. Include monotonic `sequence` for server-side ordering

## TLS

- **Port 8883:** MQTTS (production)
- **Port 1883:** Plain MQTT (dev/docker internal only)
- **Port 8084:** WSS (web clients, if needed)

Certificate: Let's Encrypt wildcard `*.fleet.example.com` or self-signed for dev (`infra/certs/`).
