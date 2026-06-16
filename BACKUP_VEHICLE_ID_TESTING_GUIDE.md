# Backup Manual Vehicle ID Telemetry Flow - Testing Guide

## Overview

This testing guide walks through the **backup mode** flow for the OpenOBD app and FleetNimble website when the new vehicle authentication + setup flow is unreliable. In backup mode:

- OpenOBD app **skips automatic vehicle setup**
- Any OBD device connected to the app sends telemetry to a **fixed FleetNimble vehicle ID**
- Website **Start Analysis** page shows **live real data** for that vehicle
- HTTP uploads work independently of MQTT
- Demo mode remains separate from real data

## Prerequisites

### 1. Backend Running
Start the FleetNimble backend on port **5000**:
```bash
cd fleet/backend
npm start
# Should listen on http://localhost:5000
```

### 2. Database Verification
Get a valid vehicle UUID from PostgreSQL:

#### Option A: Using Prisma Studio
```bash
cd fleet/backend
npx prisma studio
# Navigate to Vehicle table, copy any UUID
```

#### Option B: Direct SQL
```bash
psql postgresql://fleet:fleet_secret@localhost:5432/fleet_db

SELECT id, "vehicleName", "registrationNumber" 
FROM "Vehicle" 
WHERE "deletedAt" IS NULL 
LIMIT 5;
```

**Copy one valid UUID.** Example:
```
550e8400-e29b-41d4-a716-446655440000
```

### 3. Configure OpenOBD App

Open [fleet/mobile/lib/utils/config.dart](fleet/mobile/lib/utils/config.dart)

Replace:
```dart
static const String fixedFleetVehicleId = 'PASTE_VALID_FLEETNIMBLE_VEHICLE_UUID_HERE';
```

With your copied UUID:
```dart
static const String fixedFleetVehicleId = '550e8400-e29b-41d4-a716-446655440000';
```

Ensure backup mode is enabled:
```dart
static const bool useFixedFleetVehicleId = true;
```

### 4. Build & Run OpenOBD App

#### Android (Emulator)
```bash
cd fleet/mobile
flutter pub get
flutter run
```

#### Physical Device
```bash
flutter run
```

## Testing Flow

### Step 1: Start Frontend
```bash
cd fleet/frontend
npm run dev
# Should run on http://localhost:5173
```

### Step 2: Login to Website

1. Open http://localhost:5173 in browser
2. Login with:
   - **Email**: admin@fleetnimble.com
   - **Password**: Admin123!
3. Verify you can see the **Start Analysis** button on the dashboard

### Step 3: Login to OpenOBD App

1. App opens → **Login Screen**
2. Should show banner: `⚙️ Backup Mode: Fixed Vehicle ID`
3. Enter same credentials:
   - **Email**: admin@fleetnimble.com
   - **Password**: Admin123!
4. Tap **Sign In**
5. **Vehicle setup screen should be skipped** → goes directly to **Home Screen**

### Step 4: Verify Settings Screen

1. Tap **Settings** tab in OpenOBD app
2. Should show **BACKUP MODE** section with orange border
3. Verify:
   - ✅ **Vehicle Mode**: FIXED VEHICLE ID
   - ✅ **Token Status**: VALID (should turn green shortly)
   - ✅ **HTTP Status**: IDLE (initially)
   - ✅ **Last Upload**: Never (until you connect OBD)
   - ✅ **Fixed Vehicle ID**: Shows your UUID

### Step 5: Connect OBD Device

1. Tap **OBD** tab in OpenOBD app
2. Tap **Bluetooth Scan** or **Connect Device**
3. Select your ELM327 / OBD device
4. Once connected, **Live Gauges** tab shows active readings

### Step 6: Monitor Live Uploads

While OBD device is connected and sending data:

1. **Settings screen** should update:
   - **HTTP Status**: Changes from IDLE → OK → FAILED (if issues)
   - **Last Upload**: Shows current time (updates every 2-3 seconds)
   - **Token Status**: Stays VALID (auto-refreshes if expired)

2. **Live Gauges** screen shows:
   - RPM, Speed, Fuel, Coolant, Battery values
   - Upload status in top-right (e.g., "HTTP" or "Cloud MQTT + HTTP")

### Step 7: View Live Data on Website

1. Go to website http://localhost:5173
2. Click **Start Analysis** button
3. Should see the fixed vehicle in the list
4. **Live Diagnostics** should update every 2-3 seconds:
   - RPM, Speed, Fuel, Coolant, Battery gauges
   - Stream status: "live" (green)
   - Last sample time updates

### Step 8: Verify Socket.IO Real-Time Updates

Keep both OpenOBD app and website open side-by-side:

1. **Disconnect OBD** in app → Website gauges freeze
2. **Reconnect OBD** in app → Website updates within 2-3 seconds
3. **Change RPM/Speed on OBD** → Website gauges update in real-time

## Troubleshooting

### OpenOBD App Says "Vehicle Mode: FIXED VEHICLE ID" but Still Shows Vehicle Setup Screen

**Issue**: `useFixedFleetVehicleId` is not true or config wasn't rebuilt

**Fix**:
```bash
cd fleet/mobile
flutter clean
flutter pub get
flutter run
```

### "HTTP Status: FAILED" on Settings Screen

**Issue**: Backend is not running or has wrong port

**Verify**:
```bash
# Check backend is running
curl http://localhost:5000/api/auth/login -H "Content-Type: application/json"

# Should get 400 (missing body) not 404
```

**If still failing**: Check [fleet/mobile/lib/utils/config.dart](fleet/mobile/lib/utils/config.dart):
```dart
// Should match your backend port
static const String apiBaseUrl = 'http://10.196.249.225:5000/api';
```

### Website Shows "Waiting for OBD app" but App Shows Green Checkmark

**Issue**: Socket.IO connection failed or wrong room

**Fix**:
1. Open browser console (F12) → **Console** tab
2. Check for errors like: "CORS error" or "auth failed"
3. Verify backend CORS settings in [fleet/backend/src/app.js](fleet/backend/src/app.js)

### Token Status Shows "INVALID" on OpenOBD Settings

**Issue**: Token expired or login failed silently

**Fix**:
1. Logout from app (Settings → Logout)
2. Login again with correct credentials
3. Token status should show "VALID"

## Expected Results

### ✅ Success Checklist

- [ ] OpenOBD app shows backup mode banner on login screen
- [ ] App skips vehicle setup and goes to home screen
- [ ] Settings screen shows "FIXED VEHICLE ID" in orange
- [ ] Token Status changes to "VALID" shortly after login
- [ ] OBD connects and shows live gauges with values
- [ ] HTTP Status shows "OK" and Last Upload updates every 2-3s
- [ ] Website Start Analysis shows the fixed vehicle
- [ ] Live Diagnostics gauges update in real-time from app
- [ ] Stopping/starting app flow syncs with website

### ❌ Common Failures

| Issue | Cause | Fix |
|-------|-------|-----|
| Fixed Vehicle UUID not found | Database doesn't have that UUID | Copy correct UUID from Prisma Studio |
| 404 on /api/mobile/telemetry/live | Backend routes not mounted | Check app.js mounting `/api/mobile` |
| Socket.IO events not arriving | Frontend not authenticated | Check browser console for Socket.IO errors |
| CORS errors | Origins mismatch | Update [fleet/backend/src/utils/corsOrigins.js](fleet/backend/src/utils/corsOrigins.js) |
| Telemetry shows in app but not website | Wrong vehicle ID filtering | Verify vehicleId matches in logs |

## Database Verification Commands

### Check Telemetry Records Saved
```sql
SELECT * FROM "Telemetry"
WHERE "vehicleId" = '550e8400-e29b-41d4-a716-446655440000'
ORDER BY "timestamp" DESC
LIMIT 5;
```

### Check Vehicle Live State
```sql
SELECT * FROM "VehicleLiveState"
WHERE "vehicleId" = '550e8400-e29b-41d4-a716-446655440000';
```

### Check Vehicle Status
```sql
SELECT "id", "vehicleName", "status", "telemetryOnline", "lastTelemetryAt"
FROM "Vehicle"
WHERE "id" = '550e8400-e29b-41d4-a716-446655440000';
```

All three tables should update within 2-3 seconds of connecting OBD.

## Disabling Backup Mode (Return to Normal Flow)

When ready to use the **new vehicle setup flow**:

1. Open [fleet/mobile/lib/utils/config.dart](fleet/mobile/lib/utils/config.dart)
2. Change:
   ```dart
   static const bool useFixedFleetVehicleId = false;
   ```
3. Rebuild app:
   ```bash
   flutter clean && flutter pub get && flutter run
   ```

App will now show vehicle setup screen after login instead of skipping it.

## Notes

- **Backup mode is for testing only** — does not create new vehicles
- **One fixed vehicle at a time** — set `fixedFleetVehicleId` before building
- **Token auto-refresh** — app handles token expiration automatically
- **No MQTT required** — works with HTTP uploads alone (backup mode focus)
- **Debug output** — check app logs with `flutter logs` for errors

---

**Last Updated**: 2026-06-16  
**Backend Version**: Node.js + Express with Socket.IO  
**Mobile**: Flutter with Riverpod  
**Frontend**: React + Vite
