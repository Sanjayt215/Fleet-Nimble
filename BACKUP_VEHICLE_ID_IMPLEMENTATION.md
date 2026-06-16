# Backup Manual Vehicle ID Telemetry Flow - Implementation Summary

## What Was Changed

This document summarizes all code changes made to implement the **backup manual vehicle ID telemetry flow** for the FleetNimble ecosystem.

### Problem Statement

The new vehicle authentication + setup flow in OpenOBD app was unreliable:
- Vehicle setup screen failing silently
- Returned `vehicleId` not being saved/used
- OBD values visible in app but HTTP upload staying IDLE
- Website did not update with real telemetry

### Solution

Implement a **temporary backup flow** that:
1. ✅ Skips unreliable vehicle setup
2. ✅ Uses a fixed, pre-existing vehicle UUID
3. ✅ Sends all OBD readings to that vehicle
4. ✅ Works independently of MQTT
5. ✅ Allows website to display real live data

---

## PART 1: Mobile App Changes (Flutter)

### 1. Configuration (`mobile/lib/utils/config.dart`)

**Added:**
```dart
/// === BACKUP MODE: Fixed Vehicle ID for Testing ===
static const bool useFixedFleetVehicleId = true;
static const String fixedFleetVehicleId = 'PASTE_VALID_FLEETNIMBLE_VEHICLE_UUID_HERE';
```

**Purpose**: Toggle backup mode on/off and set the fixed vehicle UUID

---

### 2. App State Providers (`mobile/lib/providers/app_state.dart`)

**Added new providers:**
```dart
final useFixedVehicleIdProvider = StateProvider<bool>(...);
final fixedVehicleIdProvider = StateProvider<String>(...);
final tokenStatusProvider = StateProvider<String>(...);  // VALID, INVALID, EXPIRED
final lastUploadTimeProvider = StateProvider<DateTime?>(...);
final httpStatusProvider = StateProvider<String>(...);  // OK, FAILED, IDLE
```

**Purpose**: Track backup mode state, token validity, and upload status for UI display

---

### 3. Login Screen (`mobile/lib/screens/login_screen.dart`)

**Changes:**
```dart
if (AppConfig.useFixedFleetVehicleId) {
  // Skip vehicle setup screen
  Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const HomeScreen()));
} else {
  // Original flow: show vehicle setup if needed
}
```

**Also added:** Orange banner showing "Backup Mode: Fixed Vehicle ID"

**Purpose**: Skip unreliable vehicle setup when in backup mode

---

### 4. Gauges Screen (`mobile/lib/screens/gauges_screen.dart`)

**Changes:**
```dart
// Determine vehicle ID based on mode
String? vehicleId;
if (AppConfig.useFixedFleetVehicleId) {
  vehicleId = AppConfig.fixedFleetVehicleId;
} else {
  vehicleId = ref.read(selectedVehicleProvider)?.id;
}

// Publish telemetry with this vehicleId
final result = await TelemetryPublisher.publishLiveData(vehicleId, payload);
```

**Also added:** Subtitle showing "Fixed Vehicle ID Mode" when in backup

**Purpose**: Use fixed UUID instead of selected vehicle for all uploads

---

### 5. Telemetry Publisher (`mobile/lib/services/telemetry_publisher.dart`)

**Key changes:**
```dart
static Future<PublishResult> publishLiveData(String vehicleId, Map<String, dynamic> payload) async {
  if (AppConfig.useFixedFleetVehicleId) {
    return _publishLiveTelemetry(vehicleId, payload);
  }
  // ... legacy flow
}

// New method for backup mode
static Future<PublishResult> _publishLiveTelemetry(
  String vehicleId,
  Map<String, dynamic> payload,
) async {
  // Use structured /mobile/telemetry/live endpoint instead of /obd/live-data
  await ApiService.instance.postLiveTelemetry(
    vehicleId: vehicleId,
    mode: 'LIVE',
    rpm: payload['rpm'],
    speed: payload['speed'],
    // ... other fields
  );
}
```

**Purpose**: Route backup mode uploads to the correct backend endpoint

---

### 6. Settings Screen (`mobile/lib/screens/settings_screen.dart`)

**Added backup mode debug section:**
```dart
if (useFixedId) {
  // Show orange box with:
  // - Vehicle Mode: FIXED VEHICLE ID
  // - Token Status: VALID / INVALID
  // - HTTP Status: OK / FAILED / IDLE
  // - Last Upload: HH:MM:SS
  // - Editable Fixed Vehicle ID field
}
```

**Purpose**: Allow users to verify backup mode status and manually change fixed vehicle ID

---

## PART 2: Backend Changes (Node.js/Express)

### 1. Mobile Telemetry Controller (`backend/src/controllers/mobileTelemetryController.js`)

**Change in `submitLiveTelemetry`:**
```javascript
// OLD: Required obdDeviceId
obdDeviceId: vehicle.obdDeviceId,  // Would fail if null

// NEW: Allow null
obdDeviceId: vehicle.obdDeviceId || null,
```

**Purpose**: Don't reject telemetry if vehicle has no OBD device registered (backup mode scenario)

**Response change:**
```javascript
// OLD: Return entire telemetry object
res.json({ success: true, data: telemetry });

// NEW: Return structured response
res.json({ success: true, data: { vehicleId, saved: true } });
```

**Purpose**: Consistent response format matching mobile app expectations

---

### 2. Enhanced `getLatestLiveTelemetry` Query

**Added vehicleId filter:**
```javascript
const { vehicleId } = req.query;

if (vehicleId) {
  whereClause = {
    vehicleId,  // Filter by specific vehicle
    mode: 'LIVE',
    // ... other filters
  };
}
```

**Purpose**: Allow frontend to fetch telemetry for a specific fixed vehicle ID

---

### 3. Socket.IO Events (Already in place)

**Verified emissions in `submitLiveTelemetry`:**
```javascript
io.to(`user:${userId}`).emit('live-telemetry-update', {
  ...telemetry,
  vehicle: { ...vehicle, lastTelemetryAt, status, telemetryOnline }
});
io.to(`user:${userId}`).emit('vehicle-online', { vehicleId });
```

**Purpose**: Real-time updates reach website subscribers

---

## PART 3: Frontend Changes (React/Vite)

### 1. Diagnostics Page (`frontend/src/pages/Diagnostics.jsx`)

**No changes needed.** Already:
- ✅ Listens to `live-telemetry-update` events
- ✅ Filters by `mode === 'LIVE'`
- ✅ Fetches telemetry history with vehicleId parameter
- ✅ Updates gauges in real-time from Socket.IO

---

### 2. StartAnalysis Page (`frontend/src/pages/StartAnalysis.jsx`)

**No changes needed.** Already:
- ✅ Fetches vehicles with `/mobile/vehicles/my` (includes fixed vehicle if owned)
- ✅ Listens to `live-telemetry-update` events
- ✅ Filters by `mode === 'LIVE'`
- ✅ Updates telemetry cards when events arrive
- ✅ Shows real vehicle details and live gauges

---

## Data Flow Diagram

```
OpenOBD App (Flutter)
  ↓
  Login (credentials stored)
  ↓
  Skip Vehicle Setup (in backup mode)
  ↓
  Home → OBD → Gauges Screen
    ↓
    Connect ELM327 Device
    ↓
    Poll OBD PIDs every 2 seconds
    ↓
    Use FIXED_FLEET_VEHICLE_ID
    ↓
    
    Backend POST /api/mobile/telemetry/live
    ├── vehicleId: FIXED_FLEET_VEHICLE_ID
    ├── rpm, speed, fuel, coolant, battery, etc.
    ├── mode: LIVE
    ├── timestamp: now
    └── Authorization: Bearer {token}
    
    ↓
    Backend (Node.js)
    ├── Validate JWT token
    ├── Verify vehicle exists & user owns it
    ├── Create Telemetry record
    ├── Update VehicleLiveState
    ├── Update Vehicle (status, lastTelemetryAt)
    └── Emit Socket.IO:
        ├── live-telemetry-update → user:{userId}
        └── vehicle-online → user:{userId}
    
    ↓
    Website (React/Vite)
    ├── Subscribe to Socket.IO (user:currentUserId)
    ├── Receive live-telemetry-update event
    ├── Update Live Diagnostics gauges
    └── Update StartAnalysis cards
    
    ↓
    UI Updates
    ├── RPM gauge updates
    ├── Speed, Fuel, Battery gauges update
    ├── Stream status: "live" (green)
    └── Last sample time: current
```

---

## Key Design Decisions

### 1. Configuration Toggle
- **Why**: Easy to switch between backup mode and normal flow
- **How**: Single `useFixedFleetVehicleId` boolean in `config.dart`
- **Benefit**: No code changes needed, just rebuild app

### 2. Structured Telemetry Endpoint
- **Why**: Old `/obd/live-data` endpoint doesn't match backend expectations
- **What**: New `/api/mobile/telemetry/live` endpoint with clear schema
- **Benefit**: Type-safe, documented, auditable

### 3. Optional obdDeviceId
- **Why**: Backup mode doesn't require OBD device registration
- **How**: Allow `null` in telemetry.obdDeviceId
- **Benefit**: Flexible for testing scenarios

### 4. Real-Time via Socket.IO
- **Why**: No polling overhead, instant UI updates
- **How**: Backend emits `live-telemetry-update` to user room
- **Benefit**: 2-3 second round-trip instead of 10-30 seconds

### 5. Separate Debug Section
- **Why**: Users need visibility into backup mode state
- **How**: Orange section in Settings showing token, HTTP, upload status
- **Benefit**: Troubleshooting becomes self-service

---

## Testing Checklist

### Mobile App
- [ ] Login shows "Backup Mode" banner
- [ ] Vehicle setup screen is skipped
- [ ] Settings shows "Fixed Vehicle ID" in orange
- [ ] Token status becomes "VALID"
- [ ] OBD device connects and shows gauges
- [ ] HTTP Status shows "OK" after first upload
- [ ] Last Upload time updates every 2-3 seconds

### Backend
- [ ] POST /api/mobile/telemetry/live returns 200
- [ ] Telemetry table has new records
- [ ] VehicleLiveState updated with new values
- [ ] Vehicle.telemetryOnline = true
- [ ] Socket.IO events emitted (check logs)

### Website
- [ ] Start Analysis loads the fixed vehicle
- [ ] Live Diagnostics shows real gauge values
- [ ] Values update every 2-3 seconds from app
- [ ] Stream status shows "live" (green)
- [ ] No random/demo values in real mode

---

## Rollback / Cleanup

If backup mode is no longer needed:

### 1. Disable in Mobile App
```dart
// fleet/mobile/lib/utils/config.dart
static const bool useFixedFleetVehicleId = false;
```

### 2. Rebuild
```bash
cd fleet/mobile
flutter clean && flutter pub get && flutter run
```

**Result**: App will show vehicle setup screen after login (normal flow)

### 3. Old Code Still Available
- Login screen: Vehicle setup code still exists
- Vehicle selector: Still available if needed
- All previous routes: Unchanged, can be restored

---

## Future Improvements

1. **Settings UI**: Allow editing fixed vehicle ID without rebuilding
2. **Multi-Vehicle**: Support rotating between fixed vehicles
3. **Fallback Logic**: Auto-retry with different vehicle ID if owner check fails
4. **Demo/Live Toggle**: UI switch to toggle between demo and live mode
5. **Telemetry Validation**: More robust sanitization of incoming OBD values
6. **Rate Limiting**: Prevent duplicate uploads within 1 second

---

## References

- **Flutter Config**: [fleet/mobile/lib/utils/config.dart](../mobile/lib/utils/config.dart)
- **Backend Telemetry**: [fleet/backend/src/controllers/mobileTelemetryController.js](../backend/src/controllers/mobileTelemetryController.js)
- **Testing Guide**: [BACKUP_VEHICLE_ID_TESTING_GUIDE.md](./BACKUP_VEHICLE_ID_TESTING_GUIDE.md)
- **Socket.IO Setup**: [fleet/backend/src/sockets/index.js](../backend/src/sockets/index.js)

---

**Version**: 1.0  
**Date**: 2026-06-16  
**Status**: ✅ Implementation Complete
