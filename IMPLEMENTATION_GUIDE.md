# Fleet Nimble - Complete Implementation Guide

## Overview
This document provides a comprehensive guide to the Fleet Nimble backend and frontend implementation for live OBD vehicle telematics with mobile app integration.

---

## Architecture Changes Summary

### 1. Frontend Routes
Created separate dedicated routes for Start Analysis and Demo modes:

- **`/start-analysis`** - Live mode (Protected) - Real data only from OpenOBD mobile app
- **`/demo`** - Demo mode (Public) - Simulated vehicle data  
- **`/`** - Landing page with mode selection buttons
- **`/login`**, **`/register`** - Authentication pages
- **Other dashboard routes** - Protected with Layout component

### 2. Backend Routes
Mobile-specific endpoints at `/api/mobile/`:

```
POST   /api/mobile/vehicles/setup         - Register vehicle from mobile app
GET    /api/mobile/vehicles/my            - Get user's vehicles
POST   /api/mobile/telemetry/live         - Submit real-time telemetry
GET    /api/mobile/telemetry/latest       - Get latest telemetry record
GET    /api/mobile/telemetry/history/:vehicleId - Get telemetry history
```

All routes require JWT authentication.

### 3. Database Schema Updates

#### OBDDevice Model
- Added unique constraint: `@@unique([userId, bluetoothAddress])`
- Added inverse relation: `telemetries Telemetry[]`
- Ensures only one device per user per Bluetooth address

#### Telemetry Model
- Already has `mode` field (LIVE or DEMO)
- Supports all required OBD fields: RPM, Speed, Fuel, Coolant, Battery, Engine Load, etc.
- Includes location data: latitude, longitude
- Timestamped for 2-3 second intervals

#### Vehicle Model
- All required fields present: name, registration, make, model, year, fuel type, VIN
- Links to OBDDevice and Telemetry records
- Status tracking: ONLINE, OFFLINE, PARKED, MOVING, IDLING

---

## Implementation Details

### Frontend - Start Analysis Page (`/start-analysis`)

**File:** `frontend/src/pages/StartAnalysis.jsx`

**Features:**
- Waits for mobile app vehicle registration
- Displays live telemetry only (mode: LIVE)
- Never shows demo/seeded data
- Premium dark theme with cyan/blue gradients
- Real-time updates via Socket.IO every 2-3 seconds
- Active status banner with "Live Analysis Active" label
- Exit button to return to landing

**Key Components:**
```jsx
- Vehicle Details Card (name, registration, make, model, year, fuel type, VIN)
- Telemetry Cards (RPM, Speed, Fuel, Coolant, Battery, Engine Load)
- Location & Last Update cards
- Status banner with connection indicators
```

**Socket.IO Events Listened:**
- `vehicle-registered` - New vehicle from mobile app
- `live-telemetry-update` - New telemetry data (filters LIVE mode only)
- `vehicle-online` - Vehicle status change

### Frontend - Demo Mode Page (`/demo`)

**File:** `frontend/src/pages/DemoMode.jsx`

**Features:**
- Simulated vehicle: "Demo Tesla"
- Random telemetry updates every 2.5 seconds
- Pause/Resume simulator
- Exit Demo button to return to landing
- Purple/pink theme to distinguish from live mode
- Demo badge prominently displayed
- Progress bars for RPM, Speed, Fuel

**Simulation Logic:**
```javascript
- RPM: ±600 variation per update
- Speed: ±15 km/h variation per update
- Fuel: -0.55 bias (simulates consumption)
- Coolant: ±4°C variation
- Battery: 13-14.5V range
- Engine Load: ±20% variation
```

### Frontend - Home/Landing Page

**File:** `frontend/src/pages/Home.jsx`

**Buttons:**
- **Start Analysis** → `/start-analysis` (requires login, redirects to `/login` if not)
- **Demo Experience** → `/demo` (public, no login required)

**Theme:**
- Premium dark landing page
- Cyan/blue gradients
- Glassmorphism cards
- White text on dark backgrounds

### Backend - Mobile Vehicle Controller

**File:** `backend/src/controllers/mobileVehicleController.js`

**setupVehicle() Function:**
```javascript
POST /api/mobile/vehicles/setup
Payload: {
  vehicleName,        // Required
  registrationNumber, // Required
  make,
  model,
  year,
  fuelType,
  vin,
  obdDeviceName,
  bluetoothAddress
}

Returns: { vehicleId, ...vehicle data }
Emits Socket.IO: io.to(`user:${userId}`).emit('vehicle-registered', {...})
```

**Key Logic:**
- Creates/updates vehicle by registrationNumber
- Creates/updates OBDDevice with Bluetooth address
- Validates vehicle belongs to logged-in user
- Emits Socket.IO event to user's room immediately
- Returns vehicle and OBD device info

**getMyVehicles() Function:**
```javascript
GET /api/mobile/vehicles/my

Returns: { data: [vehicles] }
- Filters by userId
- Includes all OBDDevices for each vehicle
- Excludes soft-deleted vehicles
- Ordered by creation date (newest first)
```

### Backend - Mobile Telemetry Controller

**File:** `backend/src/controllers/mobileTelemetryController.js`

**submitLiveTelemetry() Function:**
```javascript
POST /api/mobile/telemetry/live
Payload: {
  vehicleId,
  mode: "LIVE",
  rpm,
  speed,
  fuelLevel,
  coolantTemp,
  batteryVoltage,
  engineLoad,
  latitude,
  longitude,
  odometer,
  timestamp
}

Security:
- Verifies vehicle belongs to logged-in user
- Rejects telemetry for other users' vehicles
- Sanitizes all numeric values
- Creates telemetry record with mode=LIVE

Side Effects:
- Updates VehicleLiveState (real-time snapshot)
- Updates Vehicle.lastTelemetryAt
- Updates Vehicle.telemetryOnline = true
- Updates OBDDevice.lastConnectedAt
- Emits Socket.IO events:
  * io.to(`user:${userId}`).emit('live-telemetry-update', {...})
  * io.to(`user:${userId}`).emit('vehicle-online', {...})
```

**getLatestLiveTelemetry() Function:**
```javascript
GET /api/mobile/telemetry/latest

Returns latest LIVE telemetry record for user
(only returns LIVE mode, never DEMO)
```

**getTelemetryHistory() Function:**
```javascript
GET /api/mobile/telemetry/history/:vehicleId

Returns last 100 LIVE telemetry records for vehicle
(only LIVE mode data)
```

### Socket.IO Configuration

**File:** `backend/src/sockets/index.js`

**Room Structure:**
```
- user:${userId}           - User's personal room (receives their live data)
- vehicle:${vehicleId}     - Vehicle-specific room (for multi-user access if needed)
```

**Authentication:**
- Validates JWT token on Socket connection
- Rejects connections without valid token
- Automatically joins user to `user:${userId}` room

**Events Emitted by Backend:**
```javascript
'vehicle-registered'      - After vehicle setup POST
'live-telemetry-update'   - After telemetry submission (LIVE only)
'vehicle-online'          - After telemetry update
'live:update'             - Generic update event
'alert:new'               - New alert created
'dtc:new'                 - New DTC code detected
```

**Events Received by Backend:**
```javascript
'join:vehicle'            - Join vehicle-specific room
'join:user'               - Join user-specific room
'ping:heartbeat'          - Keep-alive ping
'vehicle:liveData'        - Real-time data submission
'vehicle:alert'           - Alert creation
'vehicle:dtcDetected'     - DTC detection
'trip:gps'                - GPS location update
```

### CORS Configuration

**File:** `backend/.env`

**Updated Allowed Origins:**
```
http://localhost:3000       (Docker/WSL)
http://localhost:3001       (Vite frontend)
http://localhost:3002       (Vite frontend alternative)
http://localhost:5173       (Vite default)
http://127.0.0.1:3000
http://127.0.0.1:3001
http://127.0.0.1:3002
http://127.0.0.1:5173
http://192.168.152.225:3000 (Network access)
```

---

## Database Migration

**Migration Name:** `add_obd_device_unique_constraint`

**Changes:**
```prisma
@@unique([userId, bluetoothAddress])
```

**Purpose:**
- Ensures one device per user per Bluetooth address
- Allows upsert operations in mobile vehicle setup
- Prevents duplicate device registration

**How to Apply:**
```bash
cd backend
npx prisma migrate dev --name add_obd_device_unique_constraint
# Or manually apply to existing database:
npx prisma migrate deploy
```

---

## Data Flow Diagram

### Vehicle Registration Flow
```
OpenOBD Mobile App
        ↓
POST /api/mobile/vehicles/setup (JWT required)
        ↓
Backend: setupVehicle()
  - Create/update Vehicle record
  - Create/update OBDDevice record
  - Validate userId ownership
        ↓
Socket.IO: emit('vehicle-registered') to user:${userId}
        ↓
Website: Listen on 'vehicle-registered'
  - Update vehicles list
  - Display vehicle details
  - Update selectedVehicle state
```

### Live Telemetry Flow
```
OpenOBD Mobile App (every 2-3 seconds)
        ↓
POST /api/mobile/telemetry/live (JWT required, mode=LIVE)
        ↓
Backend: submitLiveTelemetry()
  - Verify userId owns vehicle
  - Sanitize numeric values
  - Create Telemetry record (mode=LIVE)
  - Update VehicleLiveState
  - Update Vehicle.lastTelemetryAt
  - Update OBDDevice.lastConnectedAt
        ↓
Socket.IO: emit('live-telemetry-update') to user:${userId}
        ↓
Website: Listen on 'live-telemetry-update'
  - Update telemetry state
  - Re-render cards with new values
  - Update "Last Update" timestamp
```

### Demo Mode Flow
```
Website: User clicks "Demo Experience"
        ↓
Navigate to /demo
        ↓
Frontend: DemoMode.jsx simulator
  - Generate random telemetry values
  - Update state every 2.5 seconds
  - Progress bars update
        ↓
Display demo-branded UI with purple theme
  - Never writes to database
  - Never emits Socket.IO events
  - Completely client-side
```

---

## Authentication & Authorization

### JWT Token Usage
```javascript
// Mobile App & Website both use:
const token = localStorage.getItem('accessToken');

// Socket.IO handshake:
auth: { token: localStorage.getItem('accessToken') }

// HTTP Headers:
Authorization: Bearer ${token}
```

### User Isolation
```javascript
// All backend operations filtered by userId from JWT:
where: { userId, ... }

// Socket.IO rooms ensure user-only updates:
io.to(`user:${userId}`).emit(...)

// Result: Each user only sees their own vehicles and data
```

---

## Testing Checklist

### 1. Database Setup
- [ ] Run Prisma migration: `npx prisma migrate dev`
- [ ] Verify OBDDevice unique constraint created
- [ ] Check Vehicle model has all required fields
- [ ] Verify Telemetry table exists

### 2. Backend API Testing
```bash
# 1. Start backend on localhost:5000
cd backend
npm run dev

# 2. Register a test user and get JWT token
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "password": "password123"
  }'

# Response: { accessToken, refreshToken, user }

# 3. Test vehicle setup endpoint
curl -X POST http://localhost:5000/api/mobile/vehicles/setup \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "vehicleName": "Test Vehicle",
    "registrationNumber": "ABC-123",
    "make": "Tesla",
    "model": "Model 3",
    "year": 2023,
    "fuelType": "Electric",
    "obdDeviceName": "OBD Device 1",
    "bluetoothAddress": "00:1A:7D:DA:71:13"
  }'

# Response: { vehicleId, vehicleName, ... }

# 4. Test get vehicles endpoint
curl -X GET http://localhost:5000/api/mobile/vehicles/my \
  -H "Authorization: Bearer ${TOKEN}"

# Response: { data: [vehicles] }

# 5. Test telemetry submission
curl -X POST http://localhost:5000/api/mobile/telemetry/live \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "vehicleId": "vehicle-uuid",
    "mode": "LIVE",
    "rpm": 2500,
    "speed": 65,
    "fuelLevel": 75,
    "coolantTemp": 95,
    "batteryVoltage": 13.5,
    "engineLoad": 45,
    "latitude": 40.7128,
    "longitude": -74.0060,
    "odometer": 45000,
    "timestamp": "2024-01-15T10:30:00Z"
  }'

# Response: { data: telemetry }
```

### 3. Socket.IO Testing
```javascript
// Frontend test in browser console
const io = require('socket.io-client');
const socket = io('http://localhost:5000', {
  auth: { token: localStorage.getItem('accessToken') }
});

socket.on('connect', () => {
  console.log('Connected to Socket.IO');
  socket.emit('join:user');
});

socket.on('live-telemetry-update', (data) => {
  console.log('Telemetry received:', data);
});

socket.on('vehicle-registered', (data) => {
  console.log('Vehicle registered:', data);
});
```

### 4. Frontend Routes Testing
- [ ] Visit `http://localhost:3001` (or 3002)
- [ ] Click "Start Analysis" → Should redirect to /login if not authenticated
- [ ] Login with test user
- [ ] Click "Start Analysis" → Should show `/start-analysis`
  - [ ] Display "Waiting for OpenOBD mobile app connection"
  - [ ] Show empty waiting state
  - [ ] Display "Live Analysis Active" banner
- [ ] Click "Demo Experience" → Should show `/demo`
  - [ ] Display simulated vehicle data
  - [ ] Show "Demo Mode Active" banner
  - [ ] Values update every 2.5 seconds
  - [ ] Pause/Resume buttons work
  - [ ] Demo badge visible

### 5. End-to-End Flow Testing
- [ ] User registers account on website
- [ ] User logs in to website
- [ ] User clicks "Start Analysis" → Shows waiting state
- [ ] User logs in to OpenOBD mobile app with same account
- [ ] User enters vehicle details in mobile app
- [ ] Mobile app sends POST /api/mobile/vehicles/setup
- [ ] Website instantly shows vehicle details (via 'vehicle-registered' Socket.IO event)
- [ ] User connects OBD device in mobile app
- [ ] Mobile app sends POST /api/mobile/telemetry/live every 2-3 seconds
- [ ] Website updates telemetry cards every 2-3 seconds
- [ ] Demo data never appears in Start Analysis mode
- [ ] Exit Live button returns to landing page

---

## Common Issues & Troubleshooting

### Issue: CORS Error
**Symptom:** Browser console shows CORS error
**Solution:** 
1. Check `.env` file includes your frontend port
2. Restart backend: `npm run dev`
3. Clear browser cache

### Issue: Socket.IO Connection Failed
**Symptom:** Console shows "Socket.IO connection failed"
**Solution:**
1. Verify backend is running on port 5000
2. Check JWT token in localStorage
3. Check CORS configuration includes Socket.IO origin
4. Verify WebSocket is not blocked by firewall

### Issue: Vehicle Not Appearing on Website
**Symptom:** Mobile app registers vehicle, but website doesn't show it
**Solution:**
1. Check browser console for Socket.IO 'vehicle-registered' event
2. Verify userId matches between mobile and website
3. Check database: `SELECT * FROM vehicles WHERE user_id = '...'`
4. Check Socket.IO room join: Frontend should join `user:${userId}` room

### Issue: Telemetry Not Updating
**Symptom:** Website shows old telemetry data
**Solution:**
1. Check mobile app is sending POST to `/api/mobile/telemetry/live`
2. Verify mode=LIVE (not DEMO)
3. Check backend logs for errors
4. Check Socket.IO 'live-telemetry-update' event in browser

### Issue: Demo Mode Appears in Start Analysis
**Symptom:** Start Analysis shows demo/fake data
**Solution:**
1. Verify telemetry controller filters `mode: "LIVE"` only
2. Check `getTelemetryHistory()` filters LIVE mode
3. Clear browser localStorage
4. Restart frontend

---

## Files Modified/Created

### Frontend Files
- ✅ `frontend/src/pages/StartAnalysis.jsx` - NEW
- ✅ `frontend/src/pages/DemoMode.jsx` - NEW
- ✅ `frontend/src/App.jsx` - MODIFIED (added routes)
- ✅ `frontend/src/pages/Home.jsx` - MODIFIED (updated navigation)

### Backend Files
- ✅ `backend/src/controllers/mobileVehicleController.js` - MODIFIED (fixed model names, added validation)
- ✅ `backend/src/controllers/mobileTelemetryController.js` - EXISTS (verified)
- ✅ `backend/src/routes/mobileRoutes.js` - EXISTS (verified)
- ✅ `backend/src/sockets/index.js` - EXISTS (verified)
- ✅ `backend/.env` - MODIFIED (updated CORS origins)

### Database Files
- ✅ `backend/prisma/schema.prisma` - MODIFIED (added unique constraint, inverse relation)
- ✅ `backend/prisma/migrations/` - NEW migration created

---

## Next Steps

1. **Run Prisma Migration**
   ```bash
   cd backend
   npx prisma migrate deploy
   ```

2. **Start Backend Server**
   ```bash
   cd backend
   npm run dev
   ```

3. **Start Frontend (use port 3001 or 3002)**
   ```bash
   cd frontend
   npm run dev
   ```

4. **Test Workflow**
   - Visit http://localhost:3001
   - Create account & login
   - Test Start Analysis & Demo modes
   - Use mobile app simulator to send vehicle/telemetry data

5. **Monitor**
   - Backend logs: `npm run dev` output
   - Frontend console: `F12` → Console tab
   - Database: `SELECT * FROM telemetry WHERE mode='LIVE' ORDER BY timestamp DESC LIMIT 10;`

---

## API Contract Summary

### Authentication
```
POST /api/auth/register
POST /api/auth/login
GET  /api/auth/profile
POST /api/auth/logout
```

### Mobile Vehicle Management
```
POST   /api/mobile/vehicles/setup    (Create/update vehicle + OBD device)
GET    /api/mobile/vehicles/my       (List user's vehicles)
```

### Mobile Telemetry Submission
```
POST   /api/mobile/telemetry/live           (Submit real-time OBD data)
GET    /api/mobile/telemetry/latest         (Get latest LIVE telemetry)
GET    /api/mobile/telemetry/history/:vehicleId  (Get 100 latest records)
```

---

## Performance Considerations

1. **Telemetry Update Frequency:** Every 2-3 seconds (40-50 updates/minute/vehicle)
2. **Socket.IO Rooms:** One room per user, broadcasts only to that user
3. **Database Queries:** Indexed on userId, vehicleId, timestamp
4. **Live State Cache:** VehicleLiveState table for fast real-time snapshot retrieval

---

## Security Features

1. **JWT Authentication:** All mobile routes require valid JWT token
2. **User Isolation:** Users can only see/edit their own vehicles and data
3. **Vehicle Ownership Verification:** Backend verifies userId before accepting telemetry
4. **Cross-User Protection:** No way to submit telemetry for another user's vehicle
5. **CORS Restrictions:** Only whitelisted origins allowed
6. **Socket.IO Authentication:** Token validated on connection

---

## Support & Debugging

For detailed implementation discussions, review:
- Backend logs: `npm run dev` terminal output
- Frontend errors: Browser DevTools Console
- Database state: `npx prisma studio`
- Socket.IO events: Browser DevTools Network tab (filter: socketio)

