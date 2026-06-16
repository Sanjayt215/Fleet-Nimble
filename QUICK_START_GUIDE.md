# Fleet Nimble - Quick Start Guide

## Prerequisites
- Node.js 18+ installed
- PostgreSQL running locally on port 5432
- Fleet database created with proper schema
- Redis running on port 6379 (optional but recommended)

---

## Step 1: Apply Database Migration

```bash
# Navigate to backend directory
cd backend

# Apply the new migration for OBDDevice unique constraint
npx prisma migrate deploy

# Or create fresh migration if needed
# npx prisma migrate dev --name add_obd_device_unique_constraint

# Verify migration in Prisma Studio (optional)
npx prisma studio
```

---

## Step 2: Start Backend Server

```bash
cd backend

# Install dependencies if not already done
npm install

# Start development server
npm run dev

# Expected output:
# FleetNimble API running on http://0.0.0.0:5000
# Environment: development
# MQTT telematics ingest enabled
```

**Check backend health:**
```bash
curl http://localhost:5000/api/health
# Response: { "success": true, "status": "ok" }
```

---

## Step 3: Start Frontend Development Server

Open a NEW terminal:

```bash
cd frontend

# Install dependencies if not already done
npm install

# Start Vite development server
npm run dev

# Expected output:
# VITE v5.x.x  ready in xxx ms
# ➜  Local:   http://localhost:3001 (or 3002 or 5173)
```

---

## Step 4: Open Frontend in Browser

Visit one of these URLs:
- **http://localhost:3001** (Primary Vite port)
- **http://localhost:3002** (Alternative Vite port)
- **http://localhost:5173** (Vite default)

Expected: FleetNimble premium landing page with:
- "Start Analysis" button
- "Demo Experience" button

---

## Step 5: Test Demo Mode (No Login Required)

1. Click **"Demo Experience"** button
2. Should see `/demo` route with:
   - Purple/pink themed page
   - "Demo Mode Active" banner with SIMULATOR badge
   - Demo vehicle: "Demo Tesla"
   - Telemetry cards updating every 2.5 seconds
   - Progress bars showing simulated values
   - Pause/Resume buttons (top right)
   - Exit Demo button (top right)

**Expected Values:**
- RPM: 0-7000 with random variation
- Speed: 0-180 km/h with random variation
- Fuel: Decreases over time (simulates consumption)
- Coolant: 80-120°C range
- Battery: 12-14.5V range
- Engine Load: 0-100% with random variation

---

## Step 6: Create Test User Account

1. From landing page, click **"Start Analysis"** button
2. Should redirect to `/login` (not authenticated)
3. Click **"Register"** link
4. Fill in:
   - Name: `Test User`
   - Email: `test@example.com`
   - Password: `password123`
5. Click **"Register"** button
6. Should auto-login and redirect to `/start-analysis`

---

## Step 7: Test Start Analysis (Empty State)

After login, you should see `/start-analysis` with:
- Dark cyan-themed page
- "Live Analysis Active" banner
- "Waiting for OpenOBD mobile app connection" message
- "No Vehicle Registered Yet" message
- Instructions to use mobile app

**Status indicators should show:**
- Mobile App Connection: ⚪ Waiting (yellow)
- OBD Device: ⚪ Waiting (yellow)
- Live Telemetry: ⚪ Waiting (yellow)

---

## Step 8: Test Mobile Vehicle Registration (via curl)

In a new terminal, simulate mobile app vehicle registration:

```bash
# 1. Get the test user's JWT token
TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }' | jq -r '.data.accessToken')

echo "Token: $TOKEN"

# 2. Register a vehicle using mobile endpoint
VEHICLE_RESPONSE=$(curl -s -X POST http://localhost:5000/api/mobile/vehicles/setup \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "vehicleName": "My Tesla",
    "registrationNumber": "ABC-123",
    "make": "Tesla",
    "model": "Model 3",
    "year": 2023,
    "fuelType": "Electric",
    "obdDeviceName": "OBD-001",
    "bluetoothAddress": "00:1A:7D:DA:71:13"
  }')

echo "Vehicle Response: $VEHICLE_RESPONSE"

# 3. Extract vehicleId
VEHICLE_ID=$(echo $VEHICLE_RESPONSE | jq -r '.data.vehicleId')
echo "Vehicle ID: $VEHICLE_ID"
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "vehicleId": "uuid-here",
    "vehicleName": "My Tesla",
    "registrationNumber": "ABC-123",
    "make": "Tesla",
    "model": "Model 3",
    "year": 2023,
    "fuelType": "Electric"
  }
}
```

---

## Step 9: Watch Frontend Update (Socket.IO)

After vehicle registration:
1. Keep browser window visible
2. Watch for instant update on `/start-analysis`:
   - "Vehicle Details" card appears
   - Shows vehicle name, registration, make, model
   - Status indicators update to "Connected" (green)

**Socket.IO event received:** `vehicle-registered`

---

## Step 10: Test Live Telemetry Submission

Submit real-time telemetry data using the vehicle ID:

```bash
# Submit live telemetry
curl -s -X POST http://localhost:5000/api/mobile/telemetry/live \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"vehicleId\": \"$VEHICLE_ID\",
    \"mode\": \"LIVE\",
    \"rpm\": 2500,
    \"speed\": 65,
    \"fuelLevel\": 75,
    \"coolantTemp\": 95,
    \"batteryVoltage\": 13.5,
    \"engineLoad\": 45,
    \"latitude\": 40.7128,
    \"longitude\": -74.0060,
    \"odometer\": 45000,
    \"timestamp\": \"$(date -u +'%Y-%m-%dT%H:%M:%SZ')\",
    \"obdDeviceId\": null
  }"
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "id": "telemetry-uuid",
    "userId": "user-uuid",
    "vehicleId": "vehicle-uuid",
    "mode": "LIVE",
    "rpm": 2500,
    "speed": 65,
    ...
  }
}
```

---

## Step 11: Watch Frontend Telemetry Update

After telemetry submission:
1. Watch browser `/start-analysis` page
2. Telemetry cards should populate:
   - RPM: 2500
   - Speed: 65 km/h
   - Fuel Level: 75%
   - Coolant Temp: 95°C
   - Battery: 13.5V
   - Engine Load: 45%
3. Location card shows: 40.7128, -74.0060
4. "Last Update" shows current timestamp
5. Green pulse dots on all cards indicate live data

**Socket.IO event received:** `live-telemetry-update`

---

## Step 12: Submit Multiple Telemetry Updates

Run telemetry submission multiple times to simulate continuous stream:

```bash
# Create a loop to send telemetry every 3 seconds
for i in {1..10}; do
  echo "Sending telemetry update $i..."
  curl -s -X POST http://localhost:5000/api/mobile/telemetry/live \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"vehicleId\": \"$VEHICLE_ID\",
      \"mode\": \"LIVE\",
      \"rpm\": $((2000 + RANDOM % 1000)),
      \"speed\": $((50 + RANDOM % 30)),
      \"fuelLevel\": $((70 + RANDOM % 10)),
      \"coolantTemp\": $((90 + RANDOM % 10)),
      \"batteryVoltage\": $((13.2 + RANDOM % 100 / 100)),
      \"engineLoad\": $((40 + RANDOM % 20)),
      \"latitude\": 40.7128,
      \"longitude\": -74.0060,
      \"odometer\": 45000
    }" > /dev/null
  
  sleep 3
done
```

Watch the browser page update in real-time every 3 seconds!

---

## Step 13: Test Logout & Re-login

1. Click user menu or logout button (implementation-dependent)
2. Should redirect to `/login`
3. Login again with same credentials
4. Should return to last page or dashboard
5. Vehicle data should still be visible

---

## Step 14: Test Cross-User Isolation

Create a second test account:

```bash
# Register second user
curl -s -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Other User",
    "email": "other@example.com",
    "password": "password123"
  }'

# Login as second user
TOKEN2=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "other@example.com",
    "password": "password123"
  }' | jq -r '.data.accessToken')

# Try to get first user's vehicles (should return empty)
curl -s -X GET http://localhost:5000/api/mobile/vehicles/my \
  -H "Authorization: Bearer $TOKEN2"

# Response should be: { "success": true, "data": [] }
```

**Expected:** Second user cannot see first user's vehicles

---

## Debugging Checklist

### Backend Issues
```bash
# Check backend is running
curl http://localhost:5000/api/health

# Check database connection
npx prisma db execute --stdin < /dev/null

# View database in Prisma Studio
npx prisma studio

# Check logs in terminal running "npm run dev"
```

### Frontend Issues
```bash
# Check frontend is running
curl http://localhost:3001

# Open browser DevTools: F12
# Check Console tab for errors
# Check Network tab for failed requests

# Check Socket.IO connection
# In browser console:
# Object.entries(window.location).forEach(([k,v]) => console.log(k,v))
```

### CORS Issues
```bash
# Check allowed origins in .env
cat backend/.env | grep CORS_ORIGIN

# Should include your frontend port
# CORS_ORIGIN=...localhost:3001...localhost:3002...
```

### Socket.IO Connection
```bash
# In browser console, check for errors:
# 1. Network errors
# 2. Auth errors (invalid token)
# 3. Connection refused (backend not running)
```

---

## Common Commands Reference

```bash
# Backend
cd backend
npm install              # Install dependencies
npm run dev              # Start dev server (with auto-reload)
npm start                # Start production server
npx prisma studio       # Open database GUI
npx prisma migrate dev  # Create new migration

# Frontend
cd frontend
npm install              # Install dependencies
npm run dev              # Start dev server
npm run build            # Build for production
npm run preview          # Preview production build

# Database
npx prisma db push      # Sync schema to database
npx prisma db execute   # Execute raw SQL
npx prisma db seed      # Run seed script
```

---

## Port Reference

| Service | Port | URL |
|---------|------|-----|
| Backend API | 5000 | http://localhost:5000 |
| Frontend (Vite 1) | 3001 | http://localhost:3001 |
| Frontend (Vite 2) | 3002 | http://localhost:3002 |
| Frontend (Vite default) | 5173 | http://localhost:5173 |
| PostgreSQL | 5432 | (local connection) |
| Redis | 6379 | (if using) |
| MQTT | 1883 | (if enabled) |
| Prisma Studio | 5555 | http://localhost:5555 |

---

## Environment Variables Checklist

**Backend `.env`:**
```
☑ NODE_ENV=development
☑ PORT=5000
☑ DATABASE_URL=postgresql://user:pass@localhost:5432/fleet_db
☑ REDIS_URL=redis://localhost:6379
☑ JWT_SECRET=... (development key)
☑ CORS_ORIGIN=...localhost:3001...localhost:3002...
☑ MQTT_ENABLED=true (or false)
```

---

## Success Criteria Checklist

- [ ] Backend starts without errors
- [ ] Frontend loads on browser
- [ ] Demo mode works with simulated data
- [ ] Can register new user account
- [ ] Can login with credentials
- [ ] Start Analysis shows "Waiting" state
- [ ] Vehicle registration via curl updates frontend instantly
- [ ] Telemetry submission updates cards in real-time
- [ ] Socket.IO events visible in browser console
- [ ] Second user cannot see first user's vehicles
- [ ] Exit buttons work correctly
- [ ] Theme colors match (cyan for live, purple for demo)
- [ ] No console errors or warnings
- [ ] Database migration applied successfully

---

## Performance Baseline

**Expected Performance:**
- Frontend page load: < 2 seconds
- Vehicle registration response: < 500ms
- Telemetry submission response: < 500ms
- Socket.IO event delivery: < 100ms
- Telemetry cards update: Smooth (no lag)
- Demo mode simulator: Consistent 2.5s updates

---

## Next Steps After Verification

1. Deploy backend to production server
2. Deploy frontend to production server
3. Configure production environment variables
4. Set up SSL/TLS certificates
5. Configure production database
6. Set up monitoring and logging
7. Create mobile app implementation guide
8. Test with real OpenOBD mobile app

---

## Support & Help

**Issues?**
1. Check browser console for JavaScript errors
2. Check backend terminal for server errors
3. Check network tab for failed HTTP requests
4. Verify all services running on correct ports
5. Check environment variables in `.env` files
6. Review `IMPLEMENTATION_GUIDE.md` troubleshooting section

**Questions?**
- Refer to `IMPLEMENTATION_GUIDE.md` for detailed architecture
- Refer to `CODE_CHANGES_SUMMARY.md` for exact code modifications
- Check Socket.IO events in browser console Network tab

