# Database Schema — Enterprise Extensions

## Existing Core (Prisma)

Already implemented in `backend/prisma/schema.prisma`:
- `users`, `roles`, `vehicles`, `obd_live_data`, `obd_raw_backup`
- `gps_locations`, `dtc_codes`, `trip_logs`, `gps_history`
- `alerts`, `driver_scores`, `maintenance_logs`, `work_orders`

## Phase 1 Additions (Migration `20260529180000_enterprise_telematics`)

### Multi-Tenant

```prisma
model Company {
  id        String   @id @default(uuid())
  name      String
  slug      String   @unique   // MQTT tenant segment
  plan      String   @default("standard")
  settings  Json     @default("{}")
  createdAt DateTime @default(now())
  users     User[]
  vehicles  Vehicle[]
  devices   TelematicsDevice[]
  geofences Geofence[]
}
```

- `User.companyId` — nullable during migration
- `Vehicle.companyId` — nullable during migration

### Device Registry

```prisma
model TelematicsDevice {
  id              String   @id @default(uuid())
  companyId       String
  vehicleId       String?
  deviceUid       String   @unique
  mqttClientId    String   @unique
  deviceSecretHash String
  deviceType      DeviceType  // MOBILE_APP | OBD_GATEWAY | CAN_LOGGER
  status          DeviceStatus // PROVISIONED | ACTIVE | REVOKED
  firmwareVersion String?
  lastSeenAt      DateTime?
  provisionedAt   DateTime @default(now())
}
```

### Driver Behavior Events

```prisma
model DriverBehaviorEvent {
  id         String   @id @default(uuid())
  vehicleId  String
  driverId   String?
  eventType  BehaviorEventType  // HARSH_BRAKE | HARSH_ACCEL | IDLE | SPEEDING
  severity   AlertSeverity
  metadata   Json
  latitude   Float?
  longitude  Float?
  recordedAt DateTime @default(now())
}
```

### Geofencing

```prisma
model Geofence {
  id          String   @id @default(uuid())
  companyId   String
  name        String
  geometry    Json     // GeoJSON polygon
  alertOnEnter Boolean @default(true)
  alertOnExit  Boolean @default(true)
}

model GeofenceEvent {
  id          String   @id @default(uuid())
  geofenceId  String
  vehicleId   String
  eventType   String   // ENTER | EXIT
  recordedAt  DateTime @default(now())
}
```

### Audit & Idempotency

```prisma
model AuditLog {
  id         String   @id @default(uuid())
  companyId  String?
  userId     String?
  action     String
  resource   String
  metadata   Json?
  ipAddress  String?
  createdAt  DateTime @default(now())
}

model TelemetryDedup {
  messageId  String   @id
  vehicleId  String
  receivedAt DateTime @default(now())
  expiresAt  DateTime  // TTL 24h via cron
}
```

## TimescaleDB (Phase 2)

Convert hot tables to hypertables:

```sql
SELECT create_hypertable('obd_live_data', 'recorded_at');
SELECT create_hypertable('gps_history', 'recorded_at');
SELECT create_hypertable('driver_behavior_events', 'recorded_at');
```

Retention policy:
- Hot: 90 days in TimescaleDB
- Warm: S3 Parquet archive
- Cold: Glacier after 2 years

## Index Strategy

```sql
CREATE INDEX idx_obd_vehicle_time ON obd_live_data (vehicle_id, recorded_at DESC);
CREATE INDEX idx_gps_history_trip ON gps_history (trip_id, recorded_at);
CREATE INDEX idx_behavior_vehicle ON driver_behavior_events (vehicle_id, recorded_at DESC);
CREATE INDEX idx_devices_company ON telematics_devices (company_id, status);
```

## Vehicle State Machine

| State | Trigger |
|-------|---------|
| `OFFLINE` | No telemetry > 30s |
| `IDLE` | Engine on, speed = 0 > 5min |
| `MOVING` | speed > 5 km/h |
| `MAINTENANCE` | Manual flag |
| `FAULT` | Active critical DTC |

Store in Redis: `vehicle:state:{vehicleId}` with TTL.

## Seed Migration

Default company for existing data:

```sql
INSERT INTO companies (id, name, slug) VALUES
  ('00000000-0000-0000-0000-000000000010', 'Default Fleet', 'default');
UPDATE users SET company_id = '00000000-0000-0000-0000-000000000010' WHERE company_id IS NULL;
UPDATE vehicles SET company_id = '00000000-0000-0000-0000-000000000010' WHERE company_id IS NULL;
```
