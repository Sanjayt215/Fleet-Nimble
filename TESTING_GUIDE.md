# FleetNimble - Live Telemetry & GPS Testing Guide

## Quick Start Testing

### Prerequisites
- Mobile app installed and configured
- Backend server running
- Frontend website accessible
- OBD adapter connected (or simulated OBD data)
- GPS enabled on mobile device

---

## Test Scenario 1: Initial Telemetry Connection

### Mobile App:
1. Open the mobile app
2. Connect to OBD adapter (via Bluetooth)
3. Enable GPS location
4. Register/select your vehicle
5. Start OBD data streaming

**Expected Mobile App Status:**
```
✅ OBD CONNECTED
✅ HTTP OK
✅ GPS ACTIVE
```

### Backend Logs:
Open backend console and look for:
```
📥 Incoming mobile telemetry
  userId: <your-user-id>
  vehicleId: <vehicle-id>
  rpm: 1500
  speed: 45
  fuelLevel: 75
  coolantTemp: 85
  engineLoad: 35
  batteryVoltage: 13.8
  latitude: 28.6139
  longitude: 77.2090
  
✅ Telemetry saved successfully
  vehicleId: <vehicle-id>
  telemetryId: <telemetry-id>
  vehicleStatus: MOVING
  hasGPS: true
  socketEmitted: true
```

### Website - Live Diagnostics Page:
1. Navigate to Live Diagnostics
2. Select your vehicle from dropdown
3. **Within 2-3 seconds**, you should see:

**Expected Values:**
- RPM: ~1500 (actual value from OBD)
- Speed: ~45 km/h
- Fuel Level: ~75%
- Coolant Temp: ~85°C
- Battery Voltage: ~13.8V
- Engine Load: ~35%
- Status Badge: **LIVE** (green)
- GPS: Active with coordinates shown

**Browser Console:**
```
🔔 Live telemetry update received: {vehicleId, rpm, speed, ...}
```

---

## Test Scenario 2: Real-time Updates

### Mobile App:
1. Keep OBD streaming active
2. Rev the engine (increase RPM)
3. Accelerate (increase speed)

### Website:
**Watch the Live Diagnostics page:**
- RPM gauge should increase immediately
- Speed gauge should increase
- Status should remain "LIVE" (green)
- Updates happen every 2 seconds (or faster via Socket.IO)

**Expected Behavior:**
- Gauges animate to new values
- No page refresh needed
- Updates are smooth and continuous

---

## Test Scenario 3: GPS Tracking

### Mobile App:
1. Ensure GPS is active
2. Start moving with the vehicle

### Website - GPS Tracking Page:
1. Navigate to GPS Tracking
2. Select your vehicle from the list

**Expected Display:**
- ✅ Vehicle appears on map
- ✅ Marker at correct location
- ✅ Speed displayed (e.g., "45 km/h")
- ✅ Last update time (e.g., "5s ago")
- ✅ GPS coordinates shown (lat/lng)
- ✅ Vehicle status: ONLINE (green badge)

**As you move:**
- ✅ Map marker updates position in real-time
- ✅ Route trail appears (blue line)
- ✅ Speed updates continuously
- ✅ "Last update" time stays recent

**Browser Console:**
```
📍 GPS update received: {vehicleId, latitude, longitude, speed, ...}
```

---

## Test Scenario 4: Vehicle Online Status

### Initial State:
1. Navigate to Dashboard
2. Locate "Vehicle Status" section

**Expected Display:**
- Vehicle shows green dot (●) 
- Status: "Online • MOVING"
- Time since last update: "3s ago"

### Stop Telemetry:
1. Close the mobile app OR
2. Stop OBD streaming

### Watch Dashboard:
**After 30 seconds:**
- ✅ Green dot changes to gray (●)
- ✅ Status changes to "Offline • 35s ago"
- ✅ "Online Vehicles" count decreases by 1
- ✅ Fleet utilization percentage decreases

**After restart:**
- ✅ Send telemetry again
- ✅ Vehicle immediately shows green dot
- ✅ Status changes to "Online • MOVING"
- ✅ "Online Vehicles" count increases

---

## Test Scenario 5: Multiple Vehicles

### Setup:
1. Register 2-3 vehicles on mobile app
2. Send telemetry from vehicle 1
3. Switch to vehicle 2 and send telemetry

### Dashboard:
**Expected Display:**
- ✅ Vehicle 1: ONLINE (green)
- ✅ Vehicle 2: ONLINE (green)
- ✅ Vehicle 3: OFFLINE (gray) - if no data sent
- ✅ "Online Vehicles": 2
- ✅ Fleet utilization: 67% (2 out of 3)

### GPS Tracking:
**Expected Display:**
- ✅ Both vehicles appear in vehicle list
- ✅ Both have ONLINE badges
- ✅ Selecting each vehicle shows their location
- ✅ Both update independently

---

## Test Scenario 6: VIN Decode

### Mobile App:
1. Go to vehicle registration
2. Enter VIN: `1HGBH41JXMN109186` (example Honda VIN)
3. Tap "Decode VIN" or equivalent button

### Expected API Call:
```
POST /api/mobile/vehicles/vin-decode
Body: { "vin": "1HGBH41JXMN109186" }

Response:
{
  "success": true,
  "data": {
    "vin": "1HGBH41JXMN109186",
    "make": "HONDA",
    "model": "Accord",
    "year": 1991,
    "manufacturer": "HONDA MOTOR CO., LTD",
    "fuelType": "Gasoline",
    "bodyClass": "Sedan/Saloon",
    "engineModel": "F22A1"
  }
}
```

### Mobile App:
**Expected Behavior:**
- ✅ Make, Model, Year fields auto-populate
- ✅ User doesn't need to type these manually
- ✅ Vehicle saves with decoded info

### Website - Vehicle Details:
**Expected Display:**
- ✅ VIN: 1HGBH41JXMN109186
- ✅ Make: HONDA
- ✅ Model: Accord
- ✅ Year: 1991
- ✅ Manufacturer: HONDA MOTOR CO., LTD

---

## Troubleshooting

### Issue: Telemetry not appearing on website

**Check 1: Mobile App**
- ✅ Verify "HTTP OK" status
- ✅ Check network connectivity
- ✅ Confirm vehicle is selected

**Check 2: Backend Logs**
- ✅ Look for "📥 Incoming mobile telemetry"
- ✅ If missing, check API endpoint
- ✅ If present, look for "✅ Telemetry saved successfully"

**Check 3: Frontend**
- ✅ Open browser console (F12)
- ✅ Look for "🔔 Live telemetry update received"
- ✅ Check Socket.IO connection status
- ✅ Verify vehicle ID matches

**Check 4: Database**
- ✅ Query `Telemetry` table for recent records
- ✅ Verify `mode` column is "LIVE" not "DEMO"
- ✅ Check `timestamp` is recent

---

### Issue: Vehicle shows OFFLINE but app is sending data

**Check 1: Time Synchronization**
- ✅ Verify server time matches actual time
- ✅ Check mobile device time is correct
- ✅ Look for timestamp mismatches in logs

**Check 2: Cron Job**
- ✅ Backend console: look for "Stale telemetry marked offline"
- ✅ Verify cron is running (every 30 seconds)

**Check 3: lastTelemetryAt Field**
- ✅ Check vehicle record in database
- ✅ Verify `lastTelemetryAt` is updating
- ✅ Calculate age: `NOW() - lastTelemetryAt`
- ✅ Should be < 30 seconds for ONLINE

---

### Issue: GPS not showing on map

**Check 1: Mobile App**
- ✅ Verify "GPS ACTIVE" status
- ✅ Check location permissions granted
- ✅ Confirm latitude/longitude in telemetry payload

**Check 2: Backend Logs**
- ✅ Look for "hasGPS: true" in save confirmation
- ✅ Verify latitude/longitude values are valid
- ✅ Check for "live-gps-update" emission

**Check 3: Frontend**
- ✅ Browser console: look for "📍 GPS update received"
- ✅ Verify coordinates are not null/undefined
- ✅ Check map is initialized (Leaflet)
- ✅ Verify vehicle has `gpsLastLatitude` and `gpsLastLongitude`

**Check 4: Database**
- ✅ Query vehicle record
- ✅ Verify `gpsLastLatitude` and `gpsLastLongitude` columns populated
- ✅ Check Telemetry records have latitude/longitude

---

## Performance Expectations

### Update Frequency:
- **Mobile App → Backend**: Every 1-2 seconds (configurable)
- **Backend → Frontend (Socket.IO)**: Immediate (< 100ms)
- **Frontend Polling Backup**: Every 2 seconds

### Latency:
- **End-to-End (App → Website)**: 2-3 seconds maximum
- **Typical**: < 1 second with good connectivity

### Data Accuracy:
- **OBD Values**: Match mobile app display
- **GPS Accuracy**: Typically 5-20 meters
- **Timestamp**: UTC, should be within 1 second of actual time

---

## Success Criteria

✅ **All requirements met when:**
1. Mobile app shows: OBD CONNECTED, HTTP OK, GPS ACTIVE
2. Website Live Diagnostics shows real values within 2-3 seconds
3. All gauges display actual OBD data (not 0 or demo values)
4. GPS Tracking shows vehicle on map at correct location
5. Dashboard shows vehicle as ONLINE (green dot)
6. Vehicle status changes to OFFLINE after 30 seconds without data
7. VIN decode returns correct vehicle information
8. No console errors in browser or backend logs

---

## Support

If issues persist after following this guide:
1. Check TELEMETRY_GPS_FIXES.md for implementation details
2. Review backend logs for error messages
3. Check browser console for frontend errors
4. Verify database schema matches expected structure
5. Confirm all dependencies are installed and up to date

**The system is now production-ready!** 🚀
