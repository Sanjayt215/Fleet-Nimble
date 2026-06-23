# FleetNimble Smart Engine State + Battery Protection

## Overview
Complete support for intelligent OBD polling management based on engine state, preventing battery drain while maintaining GPS tracking.

---

## 🎯 Features

### Engine States
- **ENGINE_ON**: Full live OBD telemetry (RPM, speed, coolant, etc.)
- **ENGINE_OFF**: OBD polling paused, GPS + standby heartbeat only
- **STANDBY**: Battery protection active, minimal power usage

### Battery Protection Modes
- **LOW_BATTERY**: Detected low battery voltage (< 11.8V)
- **DEEP_SLEEP_PROTECTION**: Extended standby to prevent deep discharge
- **OBD_POLLING_PAUSED**: Intelligent polling pause

### Vehicle Status
- **ONLINE / ENGINE_ON**: Green - Full telemetry active
- **STANDBY / ENGINE_OFF**: Yellow - GPS tracking only
- **LOW_BATTERY**: Red - Battery protection active
- **OFFLINE**: Gray - No connection

---

## 📊 Database Schema Changes

### Telemetry Model
```prisma
model Telemetry {
  // ... existing fields
  
  // NEW: Engine state fields
  engineState           String?  @map("engine_state")
  ignitionStatus        String?  @map("ignition_status")
  standbyReason         String?  @map("standby_reason")
  batteryProtectionMode String?  @map("battery_protection_mode")
  obdPollingActive      Boolean? @map("obd_polling_active")
  standbyHeartbeat      Boolean? @map("standby_heartbeat")
}
```

### Vehicle Model
```prisma
model Vehicle {
  // ... existing fields
  
  // NEW: Engine state tracking
  engineState           String?   @map("engine_state")
  ignitionStatus        String?   @map("ignition_status")
  batteryProtectionMode String?   @map("battery_protection_mode")
  obdPollingActive      Boolean?  @map("obd_polling_active")
  lastStandbyAt         DateTime? @map("last_standby_at")
  lastEngineOnAt        DateTime? @map("last_engine_on_at")
  lastEngineOffAt       DateTime? @map("last_engine_off_at")
}
```

### VehicleStatus Enum
```prisma
enum VehicleStatus {
  PARKED
  IDLING
  MOVING
  OFFLINE
  STANDBY       // NEW
  ENGINE_OFF    // NEW
  LOW_BATTERY   // NEW
}
```

### Migration
```bash
npx prisma migrate dev --name add_engine_state_battery_protection
```

---

## 🔌 API Endpoints

### 1. Submit Live Telemetry (Enhanced)
```
POST /api/mobile/telemetry/live
```

**Request Body (ENGINE_ON):**
```json
{
  "vehicleId": "550e8400-...",
  "mode": "LIVE",
  "engineState": "ENGINE_ON",
  "ignitionStatus": "ON",
  "obdPollingActive": true,
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
  "timestamp": "2026-06-23T10:30:00Z"
}
```

**Request Body (ENGINE_OFF / STANDBY):**
```json
{
  "vehicleId": "550e8400-...",
  "mode": "STANDBY",
  "engineState": "ENGINE_OFF",
  "ignitionStatus": "OFF",
  "standbyReason": "BATTERY_PROTECTION",
  "obdPollingActive": false,
  "standbyHeartbeat": true,
  "batteryVoltage": 12.3,
  "latitude": 40.7128,
  "longitude": -74.0060,
  "timestamp": "2026-06-23T10:30:00Z"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "vehicleId": "550e8400-...",
    "saved": true,
    "telemetryId": "770e8400-...",
    "savedValues": {
      "engineState": "ENGINE_OFF",
      "obdPollingActive": false,
      "batteryVoltage": 12.3,
      "latitude": 40.7128,
      "longitude": -74.0060
    }
  }
}
```

---

### 2. Submit Alert
```
POST /api/mobile/alerts
```

**Request Body:**
```json
{
  "vehicleId": "550e8400-...",
  "alertType": "LOW_BATTERY",
  "message": "Battery voltage below 11.8V. OBD polling paused.",
  "severity": "HIGH",
  "metadata": {
    "batteryVoltage": 11.5,
    "threshold": 11.8
  }
}
```

**Alert Types:**
- `LOW_BATTERY`
- `DEEP_SLEEP_PROTECTION`
- `OBD_POLLING_PAUSED`

**Response:**
```json
{
  "success": true,
  "data": {
    "alertId": "880e8400-...",
    "vehicleId": "550e8400-...",
    "alertType": "LOW_BATTERY",
    "message": "Battery voltage below 11.8V",
    "severity": "HIGH",
    "createdAt": "2026-06-23T10:30:00Z"
  }
}
```

---

### 3. Get Vehicle Alerts
```
GET /api/mobile/alerts/:vehicleId?limit=50&unreadOnly=true
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "880e8400-...",
      "vehicleId": "550e8400-...",
      "alertType": "LOW BATTERY",
      "message": "Battery voltage below 11.8V",
      "severity": "HIGH",
      "read": false,
      "createdAt": "2026-06-23T10:30:00Z"
    }
  ]
}
```

---

### 4. Get Latest Telemetry (Enhanced)
```
GET /api/mobile/telemetry/latest?vehicleId=550e8400-...
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "770e8400-...",
    "vehicleId": "550e8400-...",
    "mode": "STANDBY",
    "engineState": "ENGINE_OFF",
    "ignitionStatus": "OFF",
    "obdPollingActive": false,
    "batteryProtectionMode": null,
    "standbyHeartbeat": true,
    "isStandbyMode": true,
    "isEngineOn": false,
    "isBatteryProtection": false,
    "rpm": 0,
    "speed": 0,
    "batteryVoltage": 12.3,
    "latitude": 40.7128,
    "longitude": -74.0060,
    "timestamp": "2026-06-23T10:30:00Z"
  }
}
```

---

## 🔊 Socket.IO Events

### Emitted by Backend

**1. live-telemetry-update**
```javascript
{
  vehicleId: "550e8400-...",
  mode: "LIVE" | "STANDBY",
  engineState: "ENGINE_ON" | "ENGINE_OFF" | "STANDBY",
  obdPollingActive: true | false,
  batteryProtectionMode: "LOW_BATTERY" | null,
  rpm: 1500,
  speed: 45,
  batteryVoltage: 13.8,
  // ... all OBD fields
}
```

**2. vehicle-standby**
```javascript
{
  vehicleId: "550e8400-...",
  status: "STANDBY" | "ENGINE_OFF",
  engineState: "ENGINE_OFF",
  standbyReason: "BATTERY_PROTECTION",
  online: true,
  standbyHeartbeat: true,
  timestamp: "2026-06-23T10:30:00Z"
}
```

**3. vehicle-engine-off**
```javascript
{
  vehicleId: "550e8400-...",
  engineState: "ENGINE_OFF",
  ignitionStatus: "OFF",
  timestamp: "2026-06-23T10:30:00Z"
}
```

**4. vehicle-alert**
```javascript
{
  vehicleId: "550e8400-...",
  alertType: "LOW_BATTERY",
  batteryProtectionMode: "LOW_BATTERY",
  batteryVoltage: 11.5,
  message: "Low battery detected. OBD polling paused.",
  timestamp: "2026-06-23T10:30:00Z"
}
```

**5. vehicle-online**
```javascript
{
  vehicleId: "550e8400-...",
  status: "MOVING" | "IDLING" | "PARKED",
  engineState: "ENGINE_ON",
  online: true,
  timestamp: "2026-06-23T10:30:00Z"
}
```

**6. live-gps-update** (Enhanced)
```javascript
{
  vehicleId: "550e8400-...",
  latitude: 40.7128,
  longitude: -74.0060,
  engineState: "ENGINE_OFF",
  isStandbyMode: true,
  timestamp: "2026-06-23T10:30:00Z"
}
```

---

## 💻 Backend Implementation

### Telemetry Controller Logic

```javascript
// Determine if this is a STANDBY heartbeat
const isStandbyMode = 
  mode === "STANDBY" || 
  engineState === "ENGINE_OFF" || 
  engineState === "STANDBY" || 
  standbyHeartbeat === true;

// Determine vehicle status
let vehicleStatus = "OFFLINE";

if (isStandbyMode) {
  // Engine off - battery protection
  if (batteryProtectionMode === "LOW_BATTERY" || 
      batteryProtectionMode === "DEEP_SLEEP") {
    vehicleStatus = "LOW_BATTERY";
  } else if (engineState === "ENGINE_OFF" || ignitionStatus === "OFF") {
    vehicleStatus = "ENGINE_OFF";
  } else {
    vehicleStatus = "STANDBY";
  }
} else {
  // Engine on - normal OBD telemetry
  if (speed > 1) vehicleStatus = "MOVING";
  else if (rpm > 200) vehicleStatus = "IDLING";
  else vehicleStatus = "PARKED";
}

// Update vehicle
await prisma.vehicle.update({
  where: { id: vehicleId },
  data: {
    status: vehicleStatus,
    telemetryOnline: !isStandbyMode,
    engineState,
    ignitionStatus,
    batteryProtectionMode,
    obdPollingActive: !isStandbyMode,
    lastStandbyAt: isStandbyMode ? new Date() : undefined,
    lastEngineOnAt: engineState === "ENGINE_ON" ? new Date() : undefined,
    lastEngineOffAt: engineState === "ENGINE_OFF" ? new Date() : undefined
  }
});

// Emit appropriate Socket.IO events
if (vehicleStatus === "LOW_BATTERY") {
  io.emit('vehicle-alert', { vehicleId, alertType: 'LOW_BATTERY' });
} else if (isStandbyMode) {
  io.emit('vehicle-standby', { vehicleId, engineState });
  if (engineState === "ENGINE_OFF") {
    io.emit('vehicle-engine-off', { vehicleId });
  }
} else {
  io.emit('vehicle-online', { vehicleId, status: vehicleStatus });
}
```

---

## 🌐 Frontend Implementation

### Status Badge
```javascript
const statusBadge = {
  live: 'bg-green-900/50 text-green-100',           // ENGINE_ON
  standby: 'bg-yellow-900/50 text-yellow-100',      // ENGINE_OFF
  'low-battery': 'bg-red-900/50 text-red-100',      // LOW_BATTERY
  stale: 'bg-orange-900/50 text-orange-100',        // Stale data
  offline: 'bg-slate-800 text-slate-300'            // Offline
};

const statusLabel = {
  live: 'LIVE - ENGINE ON',
  standby: 'STANDBY - ENGINE OFF',
  'low-battery': 'LOW BATTERY PROTECTION',
  stale: 'STALE',
  offline: 'OFFLINE'
};
```

### Socket.IO Listeners
```javascript
useSocket({
  'live-telemetry-update': (d) => {
    setEngineState(d.engineState);
    setBatteryProtection(d.batteryProtectionMode);
    
    if (d.mode === 'STANDBY' || d.engineState === 'ENGINE_OFF') {
      setStreamStatus('standby');
    } else {
      setStreamStatus('live');
    }
  },
  'vehicle-standby': (d) => {
    setStreamStatus('standby');
    setEngineState(d.engineState);
  },
  'vehicle-alert': (d) => {
    if (d.alertType === 'LOW_BATTERY') {
      setStreamStatus('low-battery');
      setBatteryProtection(d.batteryProtectionMode);
    }
  },
  'vehicle-online': (d) => {
    if (d.engineState === 'ENGINE_ON') {
      setStreamStatus('live');
      setEngineState('ENGINE_ON');
    }
  }
});
```

### UI Components

**Battery Protection Alert:**
```jsx
{isLowBattery && (
  <div className="bg-red-950/20 border border-red-500/30 px-6 py-4">
    <h3 className="text-red-200">🔋 Low Battery Protection Active</h3>
    <p className="text-red-300">
      OBD polling paused to protect battery. GPS tracking active.
    </p>
  </div>
)}
```

**Engine Off Alert:**
```jsx
{isEngineOff && !isLowBattery && (
  <div className="bg-yellow-950/20 border border-yellow-500/30 px-6 py-4">
    <h3 className="text-yellow-200">🛑 Engine Off - Standby Mode</h3>
    <p className="text-yellow-300">
      OBD polling paused. GPS standby tracking active.
      Last known OBD values shown below (faded).
    </p>
  </div>
)}
```

**Faded Gauges (Engine Off):**
```jsx
<div className={`grid gap-4 ${isEngineOff ? 'opacity-50' : ''}`}>
  {LIVE_GAUGE_FIELDS.map((g) => (
    <GaugeChart key={g.field} label={g.label} value={live?.[g.field]} />
  ))}
</div>

{isEngineOff && (
  <div className="text-center text-slate-400 italic">
    ↑ Last known values (engine off, OBD polling paused)
  </div>
)}
```

---

## 📱 Mobile App Integration

### Engine State Detection
```kotlin
// Monitor ignition status
val ignitionStatus = when {
    obdAdapter.getRPM() > 200 -> "ON"
    obdAdapter.getBatteryVoltage() > 13.0 -> "ON"
    else -> "OFF"
}

val engineState = if (ignitionStatus == "ON") "ENGINE_ON" else "ENGINE_OFF"
```

### Battery Protection Logic
```kotlin
val batteryVoltage = obdAdapter.getBatteryVoltage()

val batteryProtectionMode = when {
    batteryVoltage < 11.5 -> "DEEP_SLEEP_PROTECTION"
    batteryVoltage < 11.8 -> "LOW_BATTERY"
    else -> null
}

val obdPollingActive = batteryProtectionMode == null && engineState == "ENGINE_ON"
```

### Telemetry Submission
```kotlin
if (engineState == "ENGINE_ON" && obdPollingActive) {
    // FULL TELEMETRY
    api.submitLiveTelemetry(
        vehicleId = vehicleId,
        mode = "LIVE",
        engineState = "ENGINE_ON",
        ignitionStatus = "ON",
        obdPollingActive = true,
        rpm = obdAdapter.getRPM(),
        speed = obdAdapter.getSpeed(),
        coolantTemp = obdAdapter.getCoolantTemp(),
        batteryVoltage = batteryVoltage,
        // ... all OBD fields
        latitude = gps.latitude,
        longitude = gps.longitude
    )
} else {
    // STANDBY HEARTBEAT (GPS + Battery only)
    api.submitLiveTelemetry(
        vehicleId = vehicleId,
        mode = "STANDBY",
        engineState = "ENGINE_OFF",
        ignitionStatus = "OFF",
        standbyReason = "BATTERY_PROTECTION",
        obdPollingActive = false,
        standbyHeartbeat = true,
        batteryVoltage = batteryVoltage,
        latitude = gps.latitude,
        longitude = gps.longitude
    )
}
```

### Alert Submission
```kotlin
if (batteryProtectionMode != null) {
    api.submitAlert(
        vehicleId = vehicleId,
        alertType = batteryProtectionMode,
        message = "Battery protection activated: $batteryVoltage V",
        severity = "HIGH",
        metadata = mapOf(
            "batteryVoltage" to batteryVoltage,
            "threshold" to 11.8
        )
    )
}
```

---

## ✅ Expected Behavior

### ENGINE_ON → ENGINE_OFF Transition
1. App detects ignition OFF (RPM = 0, voltage < 13V)
2. App sends STANDBY telemetry with `engineState: "ENGINE_OFF"`
3. Backend updates vehicle status to "ENGINE_OFF"
4. Backend emits `vehicle-standby` and `vehicle-engine-off` events
5. Frontend shows yellow "STANDBY - ENGINE OFF" badge
6. Frontend shows alert: "Engine is off. OBD polling paused."
7. Frontend fades OBD gauges (shows last known values)
8. GPS continues updating location

### LOW_BATTERY Detection
1. App detects battery voltage < 11.8V
2. App sends STANDBY telemetry with `batteryProtectionMode: "LOW_BATTERY"`
3. App sends alert: `alertType: "LOW_BATTERY"`
4. Backend updates vehicle status to "LOW_BATTERY"
5. Backend emits `vehicle-alert` event
6. Frontend shows red "LOW BATTERY PROTECTION" badge
7. Frontend shows battery protection alert banner
8. OBD polling completely paused

### ENGINE_OFF → ENGINE_ON Transition
1. App detects ignition ON (RPM > 200)
2. App sends LIVE telemetry with `engineState: "ENGINE_ON"`
3. Backend updates vehicle status to "IDLING" or "MOVING"
4. Backend emits `vehicle-online` event
5. Frontend shows green "LIVE - ENGINE ON" badge
6. Frontend removes standby alert
7. Frontend restores full opacity to OBD gauges
8. OBD polling resumes

---

## 🧪 Testing

### Test Scenarios

**1. Engine Running (Normal)**
- Send LIVE telemetry with `engineState: "ENGINE_ON"`
- Verify status badge shows green "LIVE - ENGINE ON"
- Verify all OBD gauges update
- Verify GPS updates

**2. Engine Off (Standby)**
- Send STANDBY telemetry with `engineState: "ENGINE_OFF"`
- Verify status badge shows yellow "STANDBY - ENGINE OFF"
- Verify standby alert appears
- Verify OBD gauges fade (opacity 50%)
- Verify GPS still updates
- Verify "Last known values" message appears

**3. Low Battery Protection**
- Send telemetry with `batteryProtectionMode: "LOW_BATTERY"`
- Send LOW_BATTERY alert
- Verify status badge shows red "LOW BATTERY PROTECTION"
- Verify battery protection alert appears
- Verify vehicle status in database = "LOW_BATTERY"

**4. Engine Restart**
- Transition from ENGINE_OFF to ENGINE_ON
- Verify status changes to green "LIVE"
- Verify gauges restore full opacity
- Verify alerts disappear

---

## 📋 Backend Logs

```
📥 Incoming mobile telemetry - NORMALIZED
  engineState: ENGINE_OFF
  obdPollingActive: false
  isStandbyMode: true

🔍 Verifying vehicle ownership
✅ Vehicle ownership verified

💾 Telemetry saved to database
  engineState: ENGINE_OFF
  isStandbyMode: true

🛑 Engine stopped

🚗 Vehicle status updated
  status: ENGINE_OFF
  engineState: ENGINE_OFF
  obdPollingActive: false
  isStandbyMode: true

🔊 Socket.IO vehicle-standby
  engineState: ENGINE_OFF

✅ Telemetry saved successfully
```

---

## 🎉 Summary

Smart Engine State + Battery Protection is now **fully implemented** with:

✅ **Engine state tracking** - ENGINE_ON, ENGINE_OFF, STANDBY  
✅ **Battery protection** - LOW_BATTERY, DEEP_SLEEP_PROTECTION  
✅ **Intelligent OBD polling** - Paused when engine off  
✅ **GPS standby tracking** - Continues during engine off  
✅ **Real-time alerts** - LOW_BATTERY, OBD_POLLING_PAUSED  
✅ **Smart UI states** - Green (live), Yellow (standby), Red (low battery)  
✅ **Faded gauges** - Shows last known values when engine off  
✅ **Database migration** - Complete schema update  
✅ **Socket.IO events** - vehicle-standby, vehicle-engine-off, vehicle-alert  
✅ **Comprehensive logging** - Every state transition tracked  

**The system now intelligently manages OBD polling to protect vehicle batteries while maintaining GPS tracking capabilities.**
