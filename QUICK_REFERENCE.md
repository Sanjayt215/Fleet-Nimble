# FleetNimble Dynamic VehicleId - Quick Reference

## 🚀 API Endpoints

### Vehicle Setup
```
POST /api/mobile/vehicles/vin-decode
Body: { "vin": "1HGBH41JXMN109186" }
Returns: Make, model, year, country, decode type

POST /api/mobile/vehicles/setup
Body: { 
  "vehicleName": "My Car",
  "registrationNumber": "ABC123",
  "vin": "1HGBH41JXMN109186",
  "make": "Toyota",
  "model": "Camry",
  "year": 2020,
  ...
}
Returns: { "vehicleId": "550e8400-...", "isNew": true }
```

### Telemetry
```
POST /api/mobile/telemetry/live
Body: { 
  "vehicleId": "550e8400-...",  // REQUIRED
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
  ...
}

GET /api/mobile/telemetry/latest?vehicleId=550e8400-...
Returns: Latest telemetry for that vehicle
```

---

## 📋 Error Codes

| Code | HTTP | Meaning |
|------|------|---------|
| `MISSING_VEHICLE_ID` | 400 | vehicleId not provided |
| `VEHICLE_NOT_FOUND` | 404 | Vehicle doesn't exist |
| `VEHICLE_NOT_AUTHORIZED` | 403 | Vehicle not owned by user |
| `INVALID_PAYLOAD` | 400 | Missing required fields |
| `UNAUTHORIZED` | 401 | User not authenticated |

---

## 🔍 Backend Logs to Watch

### Vehicle Setup Success
```
🚗 Vehicle setup request START
✅ Found existing vehicle by VIN (or) 🆕 No existing vehicle found
✨ Creating new vehicle (or) 🔄 Updating existing vehicle
✅ Vehicle setup complete - RESPONSE
```

### Telemetry Upload Success
```
📥 Incoming mobile telemetry - NORMALIZED
🔍 Verifying vehicle ownership
✅ Vehicle ownership verified
💾 Telemetry saved to database
🚗 Vehicle status updated
🔊 Socket.IO live-telemetry-update
✅ Telemetry saved successfully
```

### Error Scenarios
```
❌ Vehicle setup failed: User not authenticated
❌ Telemetry rejected: No vehicleId provided
❌ Telemetry rejected: Vehicle not found
❌ Telemetry rejected: Vehicle not authorized
```

---

## 💻 Mobile App (Kotlin) Checklist

### ✅ Vehicle Setup
```kotlin
// 1. Read VIN from OBD
val vin = VinService.readVin()

// 2. Decode VIN
val decodeResult = api.decodeVin(vin)

// 3. Setup vehicle
val setupResult = api.setupVehicle(...)

// 4. SAVE vehicleId
prefs.edit()
    .putString("vehicleId", setupResult.vehicleId)
    .apply()
```

### ✅ Telemetry Upload
```kotlin
// 1. GET vehicleId from SharedPreferences
val vehicleId = prefs.getString("vehicleId", null) ?: return

// 2. Include vehicleId in telemetry
val telemetry = TelemetryData(
    vehicleId = vehicleId,  // NOT HARDCODED
    rpm = obdData.rpm,
    ...
)

// 3. Upload
api.submitLiveTelemetry(telemetry)
```

---

## 🌐 Frontend (React) Key Points

### Vehicle Selection
```javascript
const [vehicleId, setVehicleId] = useState('');

// Load vehicles
api.get('/mobile/vehicles/my').then(r => {
  setVehicles(r.data.data);
  setVehicleId(r.data.data[0].id); // Auto-select first
});
```

### Socket.IO Listener
```javascript
useSocket({
  'live-telemetry-update': (data) => {
    if (data.vehicleId === vehicleId) {
      setLive(data);
      setStreamStatus('live');
    }
  }
}, vehicleId);
```

### Polling Backup
```javascript
useEffect(() => {
  const fetch = async () => {
    const res = await api.get('/mobile/telemetry/latest', { 
      params: { vehicleId } 
    });
    setLive(res.data.data);
  };
  
  const interval = setInterval(fetch, 2000);
  return () => clearInterval(interval);
}, [vehicleId]);
```

---

## 🎯 Vehicle Lifecycle

1. **App reads VIN** → `MAT627162HLK08178`
2. **Backend checks VIN exists** → Not found
3. **Backend creates vehicle** → `vehicleId: 550e8400-...`
4. **App saves vehicleId** → SharedPreferences
5. **App uploads telemetry** → With saved vehicleId
6. **Backend validates** → Vehicle exists + belongs to user
7. **Backend saves** → Telemetry with correct vehicleId
8. **Frontend displays** → Live OBD data for that vehicle

**Different VIN?** → New vehicle entry  
**Same VIN?** → Updates existing vehicle

---

## 📦 Production Deployment

### Backend
```bash
cd backend
npx prisma migrate deploy  # Already done
npx prisma generate
# Restart service on Render
```

### Frontend
No changes needed - already compatible

### Mobile App
1. Apply Kotlin code changes (see KOTLIN_APP_VIN_IMPLEMENTATION.md)
2. Build APK: `.\gradlew.bat assembleDebug`
3. Test with real OBD adapter

---

## ✅ Quick Test

### Test New Vehicle
1. App: Read VIN `1HGBH41JXMN109186`
2. App: Call `/api/mobile/vehicles/setup`
3. Backend: Creates vehicle → Returns `vehicleId: 550e8400-...`
4. App: Saves `vehicleId` to SharedPreferences
5. App: Uploads telemetry with `vehicleId`
6. Backend logs: ✅ Vehicle ownership verified
7. Backend logs: ✅ Telemetry saved successfully
8. Frontend: Live OBD shows RPM 1500, Speed 45, etc.

### Test Same Vehicle Again
1. App: Read VIN `1HGBH41JXMN109186` (same)
2. App: Call `/api/mobile/vehicles/setup`
3. Backend: Finds existing vehicle by VIN → Updates it
4. Backend: Returns **same** `vehicleId: 550e8400-...`
5. App: Continues using same `vehicleId`
6. No duplicate vehicles created ✅

---

## 📚 Full Documentation

- **Complete Flow:** `DYNAMIC_VEHICLE_ID_FLOW.md`
- **Implementation Details:** `IMPLEMENTATION_SUMMARY.md`
- **Kotlin Implementation:** `KOTLIN_APP_VIN_IMPLEMENTATION.md`
- **Global VIN Decoder:** `GLOBAL_VIN_DECODER.md`
- **Live OBD Fix:** `LIVE_OBD_FIX_SUMMARY.md`

---

## 🐛 Troubleshooting

### Issue: Live OBD shows OFFLINE
- Check: Is vehicleId saved in app?
- Check: Is app uploading telemetry?
- Check: Backend logs show "Telemetry saved successfully"?
- Check: Frontend using correct vehicleId?

### Issue: Multiple vehicles created for same VIN
- Check: App sending VIN in setup request?
- Check: Backend logs show "Found existing vehicle by VIN"?
- Check: VIN format correct (17 chars, uppercase)?

### Issue: Telemetry rejected with 403 Forbidden
- Check: Vehicle belongs to authenticated user?
- Check: JWT token valid?
- Check: vehicleId matches database entry?

---

## 🎉 Success Indicators

✅ Backend logs: `✅ Vehicle setup complete - RESPONSE`  
✅ Backend logs: `✅ Telemetry saved successfully`  
✅ Frontend: Vehicle appears in dropdown  
✅ Frontend: Live OBD status = `LIVE` (green)  
✅ Frontend: All 9 gauges showing values  
✅ Database: One entry per VIN  
✅ App: vehicleId saved in SharedPreferences  
✅ App: Telemetry HTTP status 200 OK
