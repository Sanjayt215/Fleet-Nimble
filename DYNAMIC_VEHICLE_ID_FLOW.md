# FleetNimble Dynamic VehicleId Flow - Professional Implementation

## Overview
This document describes the complete dynamic vehicle ID flow where every VIN/car gets its own unique vehicle entry in the database, and all telemetry flows correctly to that specific vehicle.

---

## Backend Flow

### 1. Vehicle Setup Flow

**Endpoint:** `POST /api/mobile/vehicles/setup`

**Request Body:**
```json
{
  "vehicleName": "My Car",
  "registrationNumber": "ABC123",
  "make": "Toyota",
  "model": "Camry",
  "year": 2020,
  "fuelType": "Petrol",
  "vin": "1HGBH41JXMN109186",
  "manufacturer": "Toyota Motor Corporation",
  "bodyClass": "Sedan",
  "engineModel": "2.5L I4",
  "vinDecodeSource": "NHTSA",
  "vinDecodeType": "FULL_DECODE",
  "vinCountry": "United States",
  "vinConfidence": "HIGH",
  "isPartialDecode": false,
  "obdDeviceName": "ELM327",
  "bluetoothAddress": "00:1D:A5:68:98:8B"
}
```

**Processing Logic:**
1. ✅ Authenticates user via JWT token
2. ✅ Validates required fields (vehicleName, registrationNumber)
3. ✅ **PRIORITY 1:** Checks if vehicle exists by VIN (if provided)
4. ✅ **PRIORITY 2:** Checks if vehicle exists by registrationNumber (if VIN not found)
5. ✅ **CREATE:** If no match found, creates new vehicle with new UUID
6. ✅ **UPDATE:** If match found, updates existing vehicle
7. ✅ Links OBD device to vehicle (if provided)
8. ✅ Returns `vehicleId` in response

**Response:**
```json
{
  "success": true,
  "data": {
    "vehicleId": "550e8400-e29b-41d4-a716-446655440000",
    "vehicleName": "My Car",
    "registrationNumber": "ABC123",
    "make": "Toyota",
    "model": "Camry",
    "year": 2020,
    "fuelType": "Petrol",
    "vin": "1HGBH41JXMN109186",
    "manufacturer": "Toyota Motor Corporation",
    "bodyClass": "Sedan",
    "engineModel": "2.5L I4",
    "vinDecodeSource": "NHTSA",
    "vinDecodeType": "FULL_DECODE",
    "vinCountry": "United States",
    "vinConfidence": "HIGH",
    "isPartialDecode": false,
    "obdDeviceId": "660e8400-e29b-41d4-a716-446655440001",
    "isNew": true
  }
}
```

**Backend Logs:**
```
🚗 Vehicle setup request START
🔍 VIN not found in database / ✅ Found existing vehicle by VIN
🆕 No existing vehicle found / 🔄 Updating existing vehicle
✨ Creating new vehicle / ✅ Vehicle updated successfully
🔌 Setting up OBD device
✅ OBD device linked to vehicle
📡 Socket.IO vehicle-registered event emitted
✅ Vehicle setup complete - RESPONSE
```

---

### 2. Telemetry Submission Flow

**Endpoint:** `POST /api/mobile/telemetry/live`

**Request Body:**
```json
{
  "vehicleId": "550e8400-e29b-41d4-a716-446655440000",
  "mode": "LIVE",
  "rpm": 1500,
  "speed": 45,
  "fuelLevel": 75,
  "coolantTemp": 90,
  "batteryVoltage": 13.8,
  "engineLoad": 25,
  "maf": 3.2,
  "throttlePosition": 15,
  "intakeTemp": 28,
  "latitude": 40.7128,
  "longitude": -74.0060,
  "gpsAccuracy": 5.0,
  "gpsAltitude": 10.5,
  "gpsHeading": 180.0,
  "gpsTimestamp": "2026-06-23T10:30:00Z",
  "vin": "1HGBH41JXMN109186",
  "odometer": 50000,
  "timestamp": "2026-06-23T10:30:00Z"
}
```

**Processing Logic:**
1. ✅ Authenticates user via JWT token
2. ✅ Normalizes field names (supports alternate names like `fuel` → `fuelLevel`)
3. ✅ **VALIDATES vehicleId is provided** (returns 400 if missing)
4. ✅ **VERIFIES vehicle exists** (returns 404 if not found)
5. ✅ **VERIFIES vehicle belongs to authenticated user** (returns 403 if unauthorized)
6. ✅ Sanitizes all numeric values
7. ✅ Saves telemetry to database with correct vehicleId
8. ✅ Updates vehicle status (MOVING, IDLING, PARKED, OFFLINE)
9. ✅ Updates vehicle GPS location (if provided)
10. ✅ Updates VehicleLiveState table
11. ✅ Emits Socket.IO events with vehicleId:
    - `live-telemetry-update`
    - `live-gps-update` (if GPS data provided)
    - `vehicle-online`

**Response:**
```json
{
  "success": true,
  "data": {
    "vehicleId": "550e8400-e29b-41d4-a716-446655440000",
    "saved": true,
    "telemetryId": "770e8400-e29b-41d4-a716-446655440002",
    "savedValues": {
      "rpm": 1500,
      "speed": 45,
      "fuelLevel": 75,
      "coolantTemp": 90,
      "engineLoad": 25,
      "batteryVoltage": 13.8,
      "maf": 3.2,
      "throttle": 15,
      "intakeTemp": 28,
      "latitude": 40.7128,
      "longitude": -74.0060
    }
  }
}
```

**Backend Logs:**
```
📥 Incoming mobile telemetry - RAW BODY
📥 Incoming mobile telemetry - NORMALIZED
🔍 Verifying vehicle ownership
✅ Vehicle ownership verified
💾 Telemetry saved to database
🚗 Vehicle status updated
🔊 Socket.IO live-telemetry-update
🔊 Socket.IO live-gps-update
🔊 Socket.IO vehicle-online
✅ Telemetry saved successfully
```

---

### 3. Latest Telemetry API

**Endpoint:** `GET /api/mobile/telemetry/latest?vehicleId={vehicleId}`

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "770e8400-e29b-41d4-a716-446655440002",
    "vehicleId": "550e8400-e29b-41d4-a716-446655440000",
    "userId": "880e8400-e29b-41d4-a716-446655440003",
    "mode": "LIVE",
    "rpm": 1500,
    "speed": 45,
    "fuelLevel": 75,
    "fuel": 75,
    "coolantTemp": 90,
    "coolant": 90,
    "engineLoad": 25,
    "load": 25,
    "batteryVoltage": 13.8,
    "voltage": 13.8,
    "maf": 3.2,
    "throttlePosition": 15,
    "throttle": 15,
    "intakeTemp": 28,
    "intake": 28,
    "latitude": 40.7128,
    "longitude": -74.0060,
    "timestamp": "2026-06-23T10:30:00Z",
    "vehicle": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "vehicleName": "My Car",
      "make": "Toyota",
      "model": "Camry",
      "vin": "1HGBH41JXMN109186",
      "status": "MOVING"
    }
  }
}
```

---

## Frontend Integration

### Vehicle Selection
```javascript
// Vehicle dropdown automatically populated from backend
const [vehicles, setVehicles] = useState([]);
const [vehicleId, setVehicleId] = useState('');

useEffect(() => {
  api.get('/mobile/vehicles/my').then((r) => {
    setVehicles(r.data.data || []);
    if (!vehicleId && r.data.data?.[0]) {
      setVehicleId(r.data.data[0].id); // Auto-select first vehicle
    }
  });
}, []);
```

### Live Telemetry Updates

**Socket.IO Subscription:**
```javascript
useSocket({
  'live-telemetry-update': (data) => {
    if (data.vehicleId === vehicleId) {
      setLive({
        rpm: data.rpm ?? 0,
        speed: data.speed ?? 0,
        fuelLevel: data.fuelLevel ?? data.fuel ?? 0,
        coolantTemp: data.coolantTemp ?? data.coolant ?? 0,
        engineLoad: data.engineLoad ?? data.load ?? 0,
        batteryVoltage: data.batteryVoltage ?? data.voltage ?? 0,
        maf: data.maf ?? 0,
        throttle: data.throttle ?? data.throttlePosition ?? 0,
        intakeTemp: data.intakeTemp ?? data.intake ?? 0
      });
      setStreamStatus('live');
    }
  }
}, vehicleId);
```

**Polling Backup (every 2 seconds):**
```javascript
useEffect(() => {
  if (!vehicleId) return;
  
  const fetchLatest = async () => {
    const res = await api.get('/mobile/telemetry/latest', { 
      params: { vehicleId } 
    });
    
    if (res.data.data) {
      const latest = res.data.data;
      setLive({
        rpm: latest.rpm ?? 0,
        speed: latest.speed ?? 0,
        fuelLevel: latest.fuelLevel ?? latest.fuel ?? 0,
        // ... normalize all fields
      });
      
      // Determine status based on timestamp age
      const age = Date.now() - new Date(latest.timestamp).getTime();
      if (age < 30000) setStreamStatus('live');
      else if (age < 120000) setStreamStatus('stale');
      else setStreamStatus('offline');
    }
  };
  
  fetchLatest();
  const interval = setInterval(fetchLatest, 2000);
  return () => clearInterval(interval);
}, [vehicleId]);
```

### Status Logic
```javascript
const statusBadge = {
  live: 'bg-green-900/50 text-green-100',    // < 30 seconds
  stale: 'bg-yellow-900/50 text-yellow-100', // 30s - 2 min
  offline: 'bg-slate-800 text-slate-300',    // > 2 min or no data
};
```

---

## Mobile App Integration

### 1. VIN Detection Flow
```kotlin
// Read VIN from OBD
val vin = VinService.readVin()

// Decode VIN
val decodeResult = api.decodeVin(vin)

// Setup vehicle
val setupResult = api.setupVehicle(
    vehicleName = decodeResult.vehicleName,
    registrationNumber = userInput,
    make = decodeResult.make,
    model = decodeResult.model,
    year = decodeResult.year,
    vin = vin,
    vinDecodeSource = decodeResult.source,
    vinDecodeType = decodeResult.type,
    vinCountry = decodeResult.country,
    vinConfidence = decodeResult.confidence
)

// Save vehicleId to SharedPreferences
prefs.putString("vehicleId", setupResult.vehicleId)
```

### 2. Telemetry Upload
```kotlin
// Get vehicleId from SharedPreferences
val vehicleId = prefs.getString("vehicleId")

if (vehicleId == null) {
    // Vehicle not setup - show setup screen
    return
}

// Upload telemetry with dynamic vehicleId
val telemetry = TelemetryData(
    vehicleId = vehicleId, // DYNAMIC, not hardcoded
    rpm = obdData.rpm,
    speed = obdData.speed,
    fuelLevel = obdData.fuelLevel,
    coolantTemp = obdData.coolantTemp,
    batteryVoltage = obdData.batteryVoltage,
    engineLoad = obdData.engineLoad,
    maf = obdData.maf,
    throttlePosition = obdData.throttlePosition,
    intakeTemp = obdData.intakeTemp,
    latitude = gps.latitude,
    longitude = gps.longitude,
    vin = vin
)

api.submitLiveTelemetry(telemetry)
```

---

## Key Features

### ✅ No Hardcoded Vehicle IDs
- Backend never uses fixed vehicle UUIDs
- Every vehicle gets unique UUID on creation
- VehicleId is determined by VIN or registration lookup

### ✅ VIN-Based Vehicle Matching
- If VIN exists: Updates existing vehicle
- If VIN new: Creates new vehicle
- Fallback to registration number if VIN not available

### ✅ User Authorization
- Telemetry endpoint validates vehicleId belongs to authenticated user
- Returns 403 Forbidden if unauthorized
- Supports company-level vehicles

### ✅ Comprehensive Logging
- Vehicle setup: Request, lookup method, create/update decision, response
- Telemetry: Raw body, normalized values, vehicle verification, save confirmation, Socket emission
- All logs include userId, vehicleId, and relevant context

### ✅ Real-Time Updates
- Socket.IO emits to specific user room: `user:${userId}`
- Frontend filters by vehicleId for selected vehicle
- 2-second polling backup ensures updates even if Socket.IO fails

### ✅ Field Name Normalization
- Backend accepts alternate field names: `fuel` → `fuelLevel`, `coolant` → `coolantTemp`
- Frontend receives both field names for compatibility
- No crashes on missing or alternate field names

### ✅ Status Management
- Vehicle status: MOVING (speed > 1), IDLING (rpm > 200), PARKED (ignition on but stationary), OFFLINE (no telemetry)
- Frontend status: live (< 30s), stale (30s-2min), offline (> 2min or no data)
- Vehicle automatically marked ONLINE when telemetry received

---

## Error Handling

### Missing vehicleId
```json
{
  "success": false,
  "error": {
    "code": "MISSING_VEHICLE_ID",
    "message": "vehicleId is required. Please setup vehicle first using /api/mobile/vehicles/setup"
  }
}
```

### Vehicle Not Found
```json
{
  "success": false,
  "error": {
    "code": "VEHICLE_NOT_FOUND",
    "message": "Vehicle not found. The vehicleId may be invalid or vehicle may have been deleted."
  }
}
```

### Unauthorized Vehicle
```json
{
  "success": false,
  "error": {
    "code": "VEHICLE_NOT_AUTHORIZED",
    "message": "Vehicle not authorized for this user"
  }
}
```

---

## Testing Checklist

### Backend Testing
- [ ] POST /api/mobile/vehicles/setup creates new vehicle with unique UUID
- [ ] POST /api/mobile/vehicles/setup updates existing vehicle by VIN
- [ ] POST /api/mobile/vehicles/setup updates existing vehicle by registration
- [ ] POST /api/mobile/vehicles/setup returns correct vehicleId in response
- [ ] POST /api/mobile/telemetry/live requires vehicleId
- [ ] POST /api/mobile/telemetry/live validates vehicle ownership
- [ ] POST /api/mobile/telemetry/live saves to correct vehicleId
- [ ] POST /api/mobile/telemetry/live updates vehicle status
- [ ] GET /api/mobile/telemetry/latest returns correct vehicle data
- [ ] Logs show complete vehicle setup flow
- [ ] Logs show complete telemetry flow with vehicleId

### Frontend Testing
- [ ] Vehicle dropdown shows all user vehicles
- [ ] Selecting vehicle updates Live OBD page
- [ ] Socket.IO updates only for selected vehicle
- [ ] Polling fetches latest telemetry for selected vehicle
- [ ] Status badge updates correctly (live/stale/offline)
- [ ] All 9 gauges show correct values
- [ ] GPS location updates for selected vehicle
- [ ] New vehicle appears automatically after app registration

### Mobile App Testing
- [ ] App reads VIN from OBD successfully
- [ ] App decodes VIN (full or partial)
- [ ] App calls /api/mobile/vehicles/setup
- [ ] App receives and saves vehicleId
- [ ] App includes vehicleId in all telemetry uploads
- [ ] App never sends hardcoded vehicleId
- [ ] Different cars get different vehicleIds
- [ ] Re-connecting to same car uses existing vehicleId

---

## Production Deployment

### Database Migration
```bash
# Already completed - Prisma schema has all required fields
cd backend
npx prisma migrate deploy
npx prisma generate
```

### Restart Services
```bash
# Backend service restart on Render
# Frontend redeploy (no changes needed - already compatible)
```

### Verification
1. Check logs for "Vehicle setup request START"
2. Check logs for "Telemetry saved to database"
3. Verify vehicleId in logs matches database
4. Verify Live OBD page updates with correct vehicle
5. Test multiple vehicles/VINs get separate entries

---

## Summary

The dynamic vehicleId flow is now **production-ready** with:
- ✅ VIN-based vehicle matching and creation
- ✅ User authorization and ownership verification
- ✅ Comprehensive logging at every step
- ✅ Real-time Socket.IO updates with vehicleId filtering
- ✅ Polling backup for reliability
- ✅ Field name normalization for compatibility
- ✅ Professional error handling with descriptive codes
- ✅ No hardcoded vehicle IDs anywhere in the system

Every new VIN/car gets its own vehicle entry. All telemetry flows to the correct vehicle. Website shows live data for the selected vehicle.
