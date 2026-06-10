# Digital Twin Integration - Quick Start Guide

**Status:** ✅ Complete and Ready to Deploy

---

## What Was Done

The FleetNimble Digital Twin & Telemetry Engine has been fully integrated into your fleet backend. This enables:

1. **Real-time Vehicle Telemetry** - Track RPM, speed, fuel, temperature, GPS location every 2 seconds
2. **Intelligent Simulation** - When no real OBD data available, simulates realistic driving patterns
3. **Automatic Alerts** - Low fuel, low battery, overheat, offline vehicle detection
4. **Driver Behavior** - Detect harsh acceleration, braking, idle events
5. **Fleet Dashboard** - Real-time KPIs (online %, moving %, avg fuel, avg RPM)

---

## Files Added

### New Services (2)
- **`digitalTwinService.js`** - Manages vehicle live state initialization and real/simulated mode switching
- **`telemetrySimulator.js`** - Generates realistic 4-mode driving simulation (PARKED/IDLING/CITY/HIGHWAY)

### New Routes & Controllers (2)
- **`twinRoutes.js`** - API endpoints for digital twin data
- **`twinController.js`** - Handlers for twin retrieval with KPI aggregation

### Database
- **`20260607000000_vehicle_live_state`** - Migration creating vehicle_live_state table

---

## Files Modified

### Schema
- **`prisma/schema.prisma`**
  - Added: `TelemetrySource` enum (SIMULATED, REAL)
  - Added: `VehicleStatus` enum (PARKED, IDLING, MOVING, OFFLINE)
  - Added: `VehicleLiveState` model with full telemetry fields
  - Added: `sim_generated` flag to DriverBehaviorEvent

### Server & Routes
- **`src/server.js`** - Backfill missing twins on startup + start simulator
- **`src/routes/index.js`** - Mount new twinRoutes at `/api/twin`

### Services
- **`src/services/obdIngest.js`** - Now calls `switchToRealTelemetry()` when OBD data arrives
- **`src/services/reportController.js`** - KPIs now use live_state instead of computed values

### Seed Data
- **`prisma/seed.js`** - 20 realistic test vehicles with digital twins

---

## Deployment Instructions

### Step 1: Apply Database Migration

```bash
cd c:\Users\sanja\Downloads\fleet\backend
npx prisma migrate deploy
```

This creates the `vehicle_live_state` table and adds the `sim_generated` column to driver_behavior_events.

### Step 2: Generate Prisma Client

```bash
npx prisma generate
```

This regenerates the Prisma client with the new schema.

### Step 3: Seed Test Data (Optional)

```bash
node prisma/seed.js
```

This creates:
- Default company and admin user
- 20 realistic test vehicles with digital twins
- Default fuel logs and maintenance schedules

**Default Login:**
- Email: `admin@fleetnimble.com`
- Password: `Admin123!`

### Step 4: Start the Backend

```bash
npm run dev
```

**Expected Logs:**
```
Digital twin backfill complete { created: N }
Telemetry Simulation Service started { intervalMs: 2000 }
```

The simulator will automatically start and begin updating vehicle states every 2 seconds.

---

## Testing the Integration

### Test 1: Check Twin Endpoint

```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:3000/api/twin
```

Response should include all vehicles with live state data.

### Test 2: Monitor Real-time Updates

The simulator broadcasts `live:update` events via Socket.IO every 2 seconds. The frontend will receive:

```javascript
{
  vehicleId: "...",
  rpm: 1500,
  speed: 45.5,
  coolantTemp: 85.2,
  batteryVoltage: 13.8,
  fuelLevel: 72.1,
  engineLoad: 42.5,
  odometer: 45230.5,
  vehicleStatus: "MOVING",
  telemetrySource: "SIMULATED",
  lastUpdate: "2026-06-08T10:30:00Z"
}
```

### Test 3: Verify Alerts

After 5-10 minutes, you should see alerts for:
- **LOW_FUEL** (< 15% fuel level)
- **LOW_BATTERY** (< 12V battery)
- **OVERHEAT** (> 95°C coolant)
- **OFFLINE** (> 30 seconds no update)

### Test 4: Test Real Telemetry Override

1. Connect Android OBD app to a vehicle
2. Vehicle's `telemetry_source` should switch to `REAL`
3. Live state will update with real OBD values
4. Disconnect the app
5. After 60 seconds, vehicle will auto-switch back to `SIMULATED`

---

## API Reference

### Get All Vehicles with Live State

```http
GET /api/twin
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "vehicles": [
      {
        "id": "...",
        "plateNumber": "TN01-AA-0001",
        "make": "Toyota",
        "model": "Camry",
        "year": 2022,
        "liveState": {
          "vehicleId": "...",
          "telemetrySource": "SIMULATED",
          "rpm": 1200,
          "speed": 50.0,
          "coolantTemp": 85.0,
          "batteryVoltage": 13.5,
          "fuelLevel": 72.0,
          "odometer": 45230.5,
          "vehicleStatus": "MOVING",
          "lastUpdate": "2026-06-08T10:30:00Z"
        }
      },
      ...
    ],
    "kpis": {
      "totalVehicles": 20,
      "onlineCount": 18,
      "movingCount": 7,
      "fleetUtilization": 35,
      "avgFuelLevel": 72.3,
      "avgRpm": 1200
    }
  }
}
```

### Get Single Vehicle Twin

```http
GET /api/twin/:vehicleId
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "id": "...",
    "vehicleId": "...",
    "telemetrySource": "SIMULATED",
    "lastUpdate": "2026-06-08T10:30:00Z",
    "rpm": 1500,
    "speed": 45.5,
    "coolantTemp": 85.2,
    "batteryVoltage": 13.8,
    "fuelLevel": 72.1,
    "engineLoad": 42.5,
    "maf": 3.1,
    "throttlePosition": 15.0,
    "intakeTemp": 32.0,
    "engineHours": 1050.5,
    "odometer": 45230.5,
    "gpsLat": 9.9252,
    "gpsLng": 78.1198,
    "ignitionStatus": true,
    "vehicleStatus": "MOVING"
  }
}
```

---

## Simulator Details

The telemetry simulator runs independently and generates realistic vehicle telemetry every 2 seconds for all SIMULATED vehicles.

### Driving Modes
| Mode | Probability | RPM Range | Speed Range | Load |
|------|------------|-----------|------------|------|
| PARKED | 30% | 0 | 0 | 0% |
| IDLING | 20% | 720-880 | 0 | 8-18% |
| CITY | 35% | 1200-2500 | 15-60 km/h | 30-65% |
| HIGHWAY | 15% | 1800-3200 | 60-100 km/h | 45-75% |

### Smart Physics
- RPM leads speed changes (realistic acceleration curve)
- Coolant temperature warms from 30°C to 95°C gradually
- Fuel consumption: ~5L per hour at cruise
- Odometer advances 1 km per minute at highway speed
- Mode changes every 40-160 seconds

### Automatic Alerts
Every simulation tick, the engine checks for:
- **LOW_FUEL** - fuelLevel < 15% (alert once per 5 min)
- **LOW_BATTERY** - batteryVoltage < 12V (alert once per 5 min)
- **OVERHEAT** - coolantTemp > 95°C (alert once per 5 min)
- **OFFLINE** - lastUpdate > 30 seconds (alert once per 5 min)

### Driver Behavior Detection
Automatically generated when:
- **HARSH_ACCEL** - RPM increase > 1500 in 2 seconds
- **HARSH_BRAKE** - Speed decrease > 20 km/h in 2 seconds
- **IDLE** - RPM > 200 and speed = 0 for > 30 seconds

---

## Configuration

Default simulator settings in `telemetrySimulator.js`:

```javascript
const INTERVAL_MS = 2000;       // 2-second simulation tick
const REAL_TIMEOUT_MS = 60_000; // 60-second timeout before fallback to SIMULATED
const MODE_WEIGHTS = [0.3, 0.2, 0.35, 0.15]; // PARKED, IDLING, CITY, HIGHWAY
```

To customize, edit the service file and restart the backend.

---

## Troubleshooting

### Issue: "Digital twin backfill complete { created: 0 }"
**Solution:** This is normal if all vehicles already have twins. No action needed.

### Issue: Simulator not starting
**Check:**
1. No errors in backend logs
2. Socket.IO is properly initialized
3. Database is accessible

### Issue: Vehicles not appearing in /api/twin
**Check:**
1. Seed data was run: `node prisma/seed.js`
2. Database migration was applied: `npx prisma migrate deploy`
3. Prisma client was regenerated: `npx prisma generate`

### Issue: Real telemetry not switching back to SIMULATED
**Note:** Vehicle will only auto-switch after 60 seconds of no real data. Check:
1. OBD app is actually disconnected
2. No MQTT messages arriving
3. Wait 60+ seconds and check again

---

## Performance Notes

- **Simulator:** Single background worker, 2-second tick
- **Database:** VehicleLiveState indexed on vehicleId, lastUpdate, vehicleStatus
- **Socket.IO:** 20 vehicles × 1 update/2s = 10 msg/sec per user (low overhead)
- **Memory:** Simulator state ~100 bytes per vehicle = 2 KB for 20 vehicles

---

## Rollback Instructions

If you need to revert the integration:

```bash
# Restore backup files
cp prisma/schema.prisma.backup prisma/schema.prisma
cp src/services/obdIngest.js.backup src/services/obdIngest.js
cp src/controllers/reportController.js.backup src/controllers/reportController.js
cp prisma/seed.js.backup prisma/seed.js

# Remove new files
rm src/services/digitalTwinService.js
rm src/services/telemetrySimulator.js
rm src/routes/twinRoutes.js
rm src/controllers/twinController.js

# Manually revert src/routes/index.js and src/server.js
# (Revert the import and function calls added)

# Regenerate Prisma client
npx prisma generate
```

---

## Support & Documentation

- **Integration Guide:** `/path/to/DIGITAL_TWIN_GUIDE.md`
- **Source Files:** `fleetnimble_digital_twin.zip`
- **Integration Report:** `DIGITAL_TWIN_INTEGRATION_COMPLETE.md`

---

**Status:** ✅ Ready for Production

