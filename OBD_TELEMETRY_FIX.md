# FleetNimble - OBD Telemetry Fix Implementation

## Problem Statement
Live Diagnostics OBD gauges showed 0/offline while vehicle details and GPS were updating correctly.

**Root Cause:** Inconsistent field name mapping between mobile app payload, backend storage, Socket.IO events, and frontend display.

---

## Solution Implemented

### 1. Backend Field Normalization

**File:** `backend/src/controllers/mobileTelemetryController.js`

#### Changes Made:

**A. Enhanced Request Logging**
```javascript
// Log full raw request body
logger.info("📥 Incoming mobile telemetry - RAW BODY", {
  fullBody: req.body
});
```

**B. Field Name Normalization**
Supports alternate field names from mobile app:

```javascript
const normalizedRpm = req.body.rpm;
const normalizedSpeed = req.body.speed;
const normalizedFuelLevel = req.body.fuelLevel ?? req.body.fuel;
const normalizedCoolantTemp = req.body.coolantTemp ?? req.body.coolant;
const normalizedEngineLoad = req.body.engineLoad ?? req.body.load;
const normalizedBatteryVoltage = req.body.batteryVoltage ?? req.body.voltage;
const normalizedMaf = req.body.maf;
const normalizedThrottle = req.body.throttle ?? req.body.throttlePosition;
const normalizedIntakeTemp = req.body.intakeTemp ?? req.body.intake;
```

**Supported Field Name Aliases:**
| Standard Field | Alternate Names |
|---------------|----------------|
| fuelLevel | fuel |
| coolantTemp | coolant |
| engineLoad | load |
| batteryVoltage | voltage |
| throttle | throttlePosition |
| intakeTemp | intake |

**C. Enhanced OBD Data Logging**
```javascript
logger.info("📥 Incoming mobile telemetry - NORMALIZED", {
  userId,
  vehicleId,
  rpm: normalizedRpm,
  speed: normalizedSpeed,
  fuelLevel: normalizedFuelLevel,
  coolantTemp: normalizedCoolantTemp,
  engineLoad: normalizedEngineLoad,
  batteryVoltage: normalizedBatteryVoltage,
  maf: normalizedMaf,
  throttle: normalizedThrottle,
  intakeTemp: normalizedIntakeTemp
});
```

**D. Database Storage**
All normalized fields saved to `Telemetry` table:
- rpm, speed, fuelLevel, coolantTemp
- batteryVoltage, engineLoad
- maf, throttlePosition, intakeTemp
- latitude, longitude, gpsAccuracy, gpsAltitude, gpsHeading

**E. Socket.IO Event with All Fields**
```javascript
const telemetryPayload = {
  id: telemetry.id,
  vehicleId: telemetry.vehicleId,
  mode: "LIVE",
  rpm: sanitizedRpm,
  speed: sanitizedSpeed,
  fuelLevel: sanitizedFuelLevel,
  coolantTemp: sanitizedCoolantTemp,
  engineLoad: sanitizedEngineLoad,
  batteryVoltage: sanitizedBatteryVoltage,
  maf: sanitizedMaf,
  throttle: sanitizedThrottle,
  throttlePosition: sanitizedThrottle,
  intakeTemp: sanitizedIntakeTemp,
  latitude: sanitizedLatitude,
  longitude: sanitizedLongitude,
  timestamp: telemetry.timestamp,
  vehicle: { ...vehicleData }
};

io.to(`user:${userId}`).emit('live-telemetry-update', telemetryPayload);
```

**F. Response Verification**
API response now includes saved values for debugging:
```json
{
  "success": true,
  "data": {
    "vehicleId": "...",
    "saved": true,
    "telemetryId": "...",
    "savedValues": {
      "rpm": 1312,
      "speed": 0,
      "fuelLevel": null,
      "coolantTemp": 75,
      "engineLoad": 34,
      "batteryVoltage": 13.47,
      "maf": null,
      "throttle": null,
      "intakeTemp": null
    }
  }
}
```

---

### 2. GET /api/mobile/telemetry/latest Enhancement

**Changes:**
- Added logging for fetch requests
- Returns normalized fields with aliases for compatibility:

```javascript
const response = {
  ...telemetry,
  // Ensure compatibility with alternate field names
  fuel: telemetry.fuelLevel,
  coolant: telemetry.coolantTemp,
  load: telemetry.engineLoad,
  voltage: telemetry.batteryVoltage,
  throttle: telemetry.throttlePosition,
  intake: telemetry.intakeTemp
};
```

**Logging:**
```javascript
logger.info("✅ Latest telemetry found", {
  telemetryId: telemetry.id,
  vehicleId: telemetry.vehicleId,
  rpm: telemetry.rpm,
  speed: telemetry.speed,
  fuelLevel: telemetry.fuelLevel,
  coolantTemp: telemetry.coolantTemp
});
```

---

### 3. Frontend Live Diagnostics Updates

**File:** `frontend/src/pages/Diagnostics.jsx`

#### Changes Made:

**A. Socket.IO Event Handler with Normalization**
```javascript
'live-telemetry-update': (d) => {
  console.log('🔔 Socket telemetry received:', {
    vehicleId: d.vehicleId,
    rpm: d.rpm,
    speed: d.speed,
    fuelLevel: d.fuelLevel ?? d.fuel,
    coolantTemp: d.coolantTemp ?? d.coolant,
    engineLoad: d.engineLoad ?? d.load,
    batteryVoltage: d.batteryVoltage ?? d.voltage
  });
  
  // Normalize field names
  const normalized = {
    ...d,
    rpm: d.rpm ?? 0,
    speed: d.speed ?? 0,
    fuelLevel: d.fuelLevel ?? d.fuel ?? 0,
    coolantTemp: d.coolantTemp ?? d.coolant ?? 0,
    engineLoad: d.engineLoad ?? d.load ?? 0,
    batteryVoltage: d.batteryVoltage ?? d.voltage ?? 0,
    maf: d.maf ?? 0,
    throttle: d.throttle ?? d.throttlePosition ?? 0,
    intakeTemp: d.intakeTemp ?? d.intake ?? 0
  };
  
  setLive(normalized);
  setStreamStatus('live');
}
```

**B. API Polling with Normalization**
```javascript
const fetchLatest = async () => {
  console.log('🔍 Fetching latest telemetry for vehicle:', vehicleId);
  const res = await api.get('/mobile/telemetry/latest', { params: { vehicleId } });
  console.log('📥 Latest telemetry received:', res.data.data);
  
  const latest = res.data.data;
  const normalized = {
    ...latest,
    rpm: latest.rpm ?? 0,
    speed: latest.speed ?? 0,
    fuelLevel: latest.fuelLevel ?? latest.fuel ?? 0,
    coolantTemp: latest.coolantTemp ?? latest.coolant ?? 0,
    engineLoad: latest.engineLoad ?? latest.load ?? 0,
    batteryVoltage: latest.batteryVoltage ?? latest.voltage ?? 0,
    maf: latest.maf ?? 0,
    throttle: latest.throttle ?? latest.throttlePosition ?? 0,
    intakeTemp: latest.intakeTemp ?? latest.intake ?? 0
  };
  
  console.log('✅ Normalized telemetry:', normalized);
  setLive(normalized);
};
```

**C. Status Logic - Partial Data Support**
```javascript
const age = Date.now() - new Date(latest.timestamp).getTime();

// Show LIVE if recent, even if some OBD fields are missing but GPS is updating
if (age < 30000) {
  setStreamStatus('live');
} else if (age < 120000) {
  setStreamStatus('stale');
} else {
  setStreamStatus('offline');
}
```

**D. Enhanced Detail Display**
Shows all OBD fields with fallback values:
```javascript
<div>
  <span className="text-slate-500">RPM:</span>
  <span className="ml-2 text-cyan-400 font-semibold">{live.rpm ?? '—'}</span>
</div>
<div>
  <span className="text-slate-500">Coolant:</span>
  <span className="ml-2 text-cyan-400 font-semibold">
    {live.coolantTemp ?? live.coolant ?? '—'}°C
  </span>
</div>
<div>
  <span className="text-slate-500">Engine Load:</span>
  <span className="ml-2 text-cyan-400 font-semibold">
    {live.engineLoad ?? live.load ?? '—'}%
  </span>
</div>
<div>
  <span className="text-slate-500">Battery:</span>
  <span className="ml-2 text-cyan-400 font-semibold">
    {live.batteryVoltage ?? live.voltage ?? '—'}V
  </span>
</div>
```

---

## Testing & Verification

### Expected Mobile App Payload

If mobile app sends:
```json
{
  "vehicleId": "00000000-0000-0000-0000-000000000125",
  "rpm": 1312,
  "coolant": 75,
  "load": 34,
  "voltage": 13.47,
  "speed": 0,
  "latitude": 28.6139,
  "longitude": 77.2090
}
```

### Backend Logs (Expected Output)

**1. RAW BODY Log:**
```
📥 Incoming mobile telemetry - RAW BODY
{
  fullBody: {
    vehicleId: "00000000-0000-0000-0000-000000000125",
    rpm: 1312,
    coolant: 75,
    load: 34,
    voltage: 13.47,
    speed: 0,
    latitude: 28.6139,
    longitude: 77.2090
  }
}
```

**2. NORMALIZED Log:**
```
📥 Incoming mobile telemetry - NORMALIZED
{
  userId: "...",
  vehicleId: "00000000-0000-0000-0000-000000000125",
  mode: "LIVE",
  rpm: 1312,
  speed: 0,
  fuelLevel: null,
  coolantTemp: 75,
  engineLoad: 34,
  batteryVoltage: 13.47,
  maf: null,
  throttle: null,
  intakeTemp: null
}
```

**3. Socket Emission Log:**
```
🔊 Emitting Socket.IO event
{
  event: "live-telemetry-update",
  vehicleId: "00000000-0000-0000-0000-000000000125",
  rpm: 1312,
  speed: 0,
  coolantTemp: 75,
  engineLoad: 34,
  batteryVoltage: 13.47
}
```

**4. Success Log:**
```
✅ Telemetry saved successfully
{
  vehicleId: "00000000-0000-0000-0000-000000000125",
  telemetryId: "...",
  vehicleStatus: "PARKED",
  obdData: {
    rpm: 1312,
    speed: 0,
    coolantTemp: 75,
    engineLoad: 34,
    batteryVoltage: 13.47
  },
  hasGPS: true,
  socketEmitted: true
}
```

### Frontend Console Logs (Expected Output)

**1. Socket Event:**
```
🔔 Socket telemetry received:
{
  vehicleId: "00000000-0000-0000-0000-000000000125",
  rpm: 1312,
  speed: 0,
  fuelLevel: null,
  coolantTemp: 75,
  engineLoad: 34,
  batteryVoltage: 13.47
}
```

**2. API Poll:**
```
🔍 Fetching latest telemetry for vehicle: 00000000-0000-0000-0000-000000000125

📥 Latest telemetry received:
{
  id: "...",
  vehicleId: "00000000-0000-0000-0000-000000000125",
  rpm: 1312,
  speed: 0,
  coolantTemp: 75,
  engineLoad: 34,
  batteryVoltage: 13.47
}

✅ Normalized telemetry:
{
  rpm: 1312,
  speed: 0,
  fuelLevel: 0,
  coolantTemp: 75,
  engineLoad: 34,
  batteryVoltage: 13.47,
  maf: 0,
  throttle: 0,
  intakeTemp: 0
}
```

### Website Display (Expected Result)

**Live Diagnostics Page:**
- RPM gauge: **1312**
- Speed gauge: **0 km/h**
- Coolant gauge: **75°C**
- Engine Load gauge: **34%**
- Battery gauge: **13.47V**
- Status badge: **LIVE** (green)

**Telemetry Stream Section:**
```
RPM: 1312
Speed: 0 km/h
Fuel: — %
Coolant: 75°C
Battery: 13.47V
Engine Load: 34%
MAF: — g/s
Throttle: — %
Intake Temp: — °C
GPS: Active
Location: 28.6139, 77.2090
```

---

## Troubleshooting Guide

### Issue 1: Gauges still show 0

**Check Backend Logs:**
```bash
# Look for RAW BODY log
grep "RAW BODY" backend.log

# Verify field names being sent by mobile app
# If app sends "coolant" instead of "coolantTemp", normalization should handle it
```

**Check if data is being saved:**
```bash
# Look for success log
grep "Telemetry saved successfully" backend.log

# Verify obdData contains non-zero values
```

**Check Frontend Console:**
```bash
# Open browser DevTools (F12)
# Look for logs:
🔔 Socket telemetry received
📥 Latest telemetry received
✅ Normalized telemetry
```

### Issue 2: Vehicle ID Mismatch

**Verify Fixed Vehicle ID:**
If using fixed vehicle ID `00000000-0000-0000-0000-000000000125`:

1. Backend should receive this exact ID
2. Frontend should fetch telemetry for this exact ID
3. Socket.IO should emit to user room containing this vehicle

**Check:**
```javascript
// Frontend Diagnostics - vehicleId state should match
console.log('Selected vehicleId:', vehicleId);
// Should output: "00000000-0000-0000-0000-000000000125"
```

### Issue 3: Socket.IO Not Connecting

**Check Connection:**
```javascript
// Frontend console should show:
Connected to Socket.IO
```

**Verify Authentication:**
```bash
# Backend logs should show:
Socket connected { userId: "..." }
```

### Issue 4: Demo Mode Interference

**Verify Mode:**
```javascript
// Frontend Diagnostics
console.log('Is Demo?', isDemo);
console.log('Is Live?', isLive);

// Should output:
// Is Demo? false
// Is Live? true (for Start Analysis mode)
```

**Check telemetry mode:**
```bash
# Backend NORMALIZED log should show:
mode: "LIVE"

# NOT "DEMO"
```

---

## API Response Verification

### Test Endpoint Directly

```bash
# Get latest telemetry
curl -H "Authorization: Bearer <token>" \
  "http://localhost:5000/api/mobile/telemetry/latest?vehicleId=00000000-0000-0000-0000-000000000125"
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "id": "...",
    "vehicleId": "00000000-0000-0000-0000-000000000125",
    "mode": "LIVE",
    "rpm": 1312,
    "speed": 0,
    "fuelLevel": null,
    "coolantTemp": 75,
    "coolant": 75,
    "engineLoad": 34,
    "load": 34,
    "batteryVoltage": 13.47,
    "voltage": 13.47,
    "timestamp": "2026-06-20T10:30:00Z"
  }
}
```

---

## Field Mapping Reference

### Mobile App → Backend

| Mobile App Field | Backend Normalized | Database Column | Socket.IO Field |
|-----------------|-------------------|----------------|----------------|
| rpm | rpm | rpm | rpm |
| speed | speed | speed | speed |
| fuel | fuelLevel | fuelLevel | fuelLevel |
| fuelLevel | fuelLevel | fuelLevel | fuelLevel |
| coolant | coolantTemp | coolantTemp | coolantTemp |
| coolantTemp | coolantTemp | coolantTemp | coolantTemp |
| load | engineLoad | engineLoad | engineLoad |
| engineLoad | engineLoad | engineLoad | engineLoad |
| voltage | batteryVoltage | batteryVoltage | batteryVoltage |
| batteryVoltage | batteryVoltage | batteryVoltage | batteryVoltage |
| maf | maf | maf | maf |
| throttle | throttle | throttlePosition | throttle |
| throttlePosition | throttle | throttlePosition | throttlePosition |
| intake | intakeTemp | intakeTemp | intakeTemp |
| intakeTemp | intakeTemp | intakeTemp | intakeTemp |

### Backend → Frontend

Frontend safely accesses both field names:

```javascript
rpm: data.rpm ?? 0
speed: data.speed ?? 0
fuelLevel: data.fuelLevel ?? data.fuel ?? 0
coolantTemp: data.coolantTemp ?? data.coolant ?? 0
engineLoad: data.engineLoad ?? data.load ?? 0
batteryVoltage: data.batteryVoltage ?? data.voltage ?? 0
maf: data.maf ?? 0
throttle: data.throttle ?? data.throttlePosition ?? 0
intakeTemp: data.intakeTemp ?? data.intake ?? 0
```

---

## Success Criteria

✅ **Backend Logs Show:**
- RAW BODY with all incoming fields
- NORMALIZED values mapped correctly
- Socket emission with all OBD fields
- Success log with obdData containing actual values

✅ **Frontend Console Shows:**
- Socket telemetry received with non-zero values
- Latest telemetry received with non-zero values
- Normalized telemetry with all fields populated
- Status: 'live'

✅ **Website Displays:**
- Gauges show actual values (matching mobile app)
- LIVE status badge (green)
- Telemetry stream shows all OBD values
- Updates every 2 seconds

✅ **Mobile App Shows:**
- HTTP OK
- Values match website within 2-3 seconds

---

## Files Modified

### Backend:
- `backend/src/controllers/mobileTelemetryController.js`
  - Enhanced logging (RAW BODY, NORMALIZED, Socket emission)
  - Field normalization (support alternate names)
  - Response includes savedValues
  - GET /latest returns normalized fields with aliases

### Frontend:
- `frontend/src/pages/Diagnostics.jsx`
  - Socket handler with field normalization
  - API polling with field normalization
  - Console logging for debugging
  - Enhanced detail display with all OBD fields
  - Status logic supports partial data

---

## Next Steps

1. **Restart backend server** to load updated controller
2. **Refresh frontend** (hard refresh: Ctrl+Shift+R)
3. **Start mobile app** and send OBD telemetry
4. **Check backend console** for logs
5. **Check browser console** (F12) for frontend logs
6. **Verify gauges update** with actual values

The fix is now complete. OBD telemetry should display correctly on the website! 🚀
