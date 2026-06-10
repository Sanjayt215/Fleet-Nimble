# FleetNimble Architecture & Data Flow Diagrams

## 1. CURRENT ARCHITECTURE (BROKEN)

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                 │
├─────────────────────────────────────────────────────────────────┤
│
│  Dashboard              LiveOBD               Trips              Logs
│  ├─ KPIs                ├─ Gauges            ├─ History         ├─ Events
│  ├─ Fleet Stats         ├─ Map               ├─ Filter          ├─ Real-time
│  ├─ Alerts             ├─ Stats             └─ Pagination      └─ Stream
│  └─ Charts (BLANK!)    ├─ Charts (BLANK!)
│                        └─ Status
│
└─────────────────────────────────────────────────────────────────┘
  │                          Socket.IO Events
  │  'live:update' (every 2s)
  │  'trip:update'
  │  'alert:new'
  │  'dtc:new'
  ▼
┌─────────────────────────────────────────────────────────────────┐
│                         BACKEND                                  │
├─────────────────────────────────────────────────────────────────┤
│
│  API Endpoints
│  ├─ /vehicles
│  ├─ /obd/latest/:vehicleId
│  ├─ /trips/:vehicleId
│  └─ /events/:vehicleId (MISSING - 404)
│
│  Services
│  ├─ telemetrySimulator.js    (Generates every 2s)
│  ├─ obdIngest.js             (Stores to ObdLiveData)
│  ├─ liveStateService.js      (Updates VehicleLiveState)
│  ├─ tripService.js           (Manual start/end)
│  └─ alertEngine.js           (Processes thresholds)
│
│  Database                    Issues:
│  ├─ Vehicle ✓               ├─ No TelemetryHistory table
│  ├─ VehicleLiveState ✓      ├─ No EventLog table
│  ├─ ObdLiveData ✓           ├─ No trip auto-detection
│  ├─ TripLog ✓               ├─ No event logging
│  ├─ Alert ✓                 ├─ Status flickers (no heartbeat)
│  ├─ TelemetryHistory ✗      └─ Maps scroll out of view
│  └─ EventLog ✗
│
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. FIXED ARCHITECTURE (PROPOSED)

```
┌──────────────────────────────────────────────────────────────────────┐
│                          FRONTEND                                     │
├──────────────────────────────────────────────────────────────────────┤
│
│  Dashboard                LiveOBD (Two-Column)        Trips      Logs
│  ├─ KPIs                  ├─ LEFT:                     ├─ Auto-   ├─ Real-time
│  ├─ Fleet Stats           │  ├─ STICKY MAP            │  generated│ Event Stream
│  ├─ Alerts                │  ├─ Vehicle Info          ├─ Distance│ ├─ OBD Connected
│  ├─ Charts ✓              │  └─ Status               ├─ Duration│ ├─ Trip Started
│  └─ Real-time updates     │                          ├─ Avg Speed│ ├─ DTC Generated
│                           ├─ RIGHT (SCROLLS):       └─ Fuel Used│ ├─ GPS Updated
│                           │  ├─ Gauges ✓            │          │ ├─ MQTT Events
│                           │  ├─ Stat Cards ✓         │          │ └─ Status Changes
│                           │  └─ Charts ✓
│                           │     ├─ RPM vs Time
│                           │     ├─ Speed vs Time
│                           │     ├─ Coolant vs Time
│                           │     └─ Fuel vs Time
│
└──────────────────────────────────────────────────────────────────────┘
  │
  │ WebSocket Events (Every 2s + Heartbeat every 20s)
  │ ├─ 'live:update' - New telemetry reading
  │ ├─ 'heartbeat:pong' - Device is alive (every 20s)
  │ ├─ 'trip:started' - Trip auto-detected
  │ ├─ 'trip:ended' - Trip completed
  │ ├─ 'device:heartbeat' - Status update
  │ └─ 'event:log' - New event created
  │
  ▼
┌──────────────────────────────────────────────────────────────────────┐
│                          BACKEND                                      │
├──────────────────────────────────────────────────────────────────────┤
│
│  NEW API Endpoints
│  ├─ /vehicles
│  ├─ /obd/latest/:vehicleId
│  ├─ /obd/history/:vehicleId ✓ NEW
│  ├─ /trips/:vehicleId
│  ├─ /events/:vehicleId ✓ NEW
│  └─ WebSocket: heartbeat:ping ✓ NEW
│
│  Services
│  ├─ telemetrySimulator.js (Smooth transitions + validation)
│  ├─ obdIngest.js
│  │  ├─ Stores to ObdLiveData
│  │  ├─ Saves to TelemetryHistory ✓ NEW
│  │  ├─ Logs events ✓ NEW
│  │  └─ Auto-detect trips ✓ NEW
│  ├─ liveStateService.js
│  │  ├─ Updates VehicleLiveState
│  │  └─ Heartbeat-based status ✓ NEW
│  ├─ tripService.js
│  │  ├─ Manual API (unchanged)
│  │  ├─ Auto-start (ignition ON + speed > 5)
│  │  ├─ Auto-end (ignition OFF + speed < 2)
│  │  └─ Track GPS + distance ✓ NEW
│  ├─ alertEngine.js (unchanged)
│  ├─ eventLogService.js ✓ NEW
│  │  ├─ logEvent(vehicleId, type, message, metadata)
│  │  └─ getEventLog(vehicleId, limit)
│  └─ deviceAuthService.js
│     ├─ Heartbeat handling
│     └─ 60-second OFFLINE timeout ✓ UPDATED
│
│  Database
│  ├─ Vehicle ✓
│  ├─ VehicleLiveState ✓
│  ├─ ObdLiveData ✓
│  ├─ TripLog ✓
│  ├─ Alert ✓
│  ├─ TelemetryHistory ✓ NEW (Ring buffer: 100 per vehicle)
│  ├─ EventLog ✓ NEW (Types: OBD_*, MQTT_*, TRIP_*, DTC_*, etc.)
│  └─ GpsLocation ✓ (Latest position)
│
│  Indexes (Performance)
│  ├─ TelemetryHistory(vehicleId, recordedAt DESC) ✓
│  ├─ EventLog(vehicleId, createdAt DESC) ✓
│  └─ ObdLiveData(vehicleId, recordedAt DESC) ✓
│
└──────────────────────────────────────────────────────────────────────┘
```

---

## 3. LIVE STATUS DETERMINATION (HEARTBEAT SYSTEM)

```
Device (Mobile App / OBD Gateway)
│
├─ Sends OBD telemetry every 2 seconds
│  └─ Socket.IO: vehicle:liveData(payload)
│     ├─ Updates VehicleLiveState
│     ├─ Saves to TelemetryHistory
│     ├─ Broadcasts live:update
│     └─ Records last_obd_at timestamp
│
├─ Sends heartbeat ping every 20 seconds ✓ NEW
│  └─ Socket.IO: heartbeat:ping(vehicleId)
│     ├─ Updates device.lastHeartbeatAt
│     ├─ Updates vehicle.telemetryOnline = true
│     ├─ Broadcasts heartbeat:pong
│     └─ Emits device:heartbeat to frontend
│
└─ Connection Lost / No Data
   └─ After 60 seconds of silence (no telemetry OR heartbeat)
      └─ Vehicle marked OFFLINE
         ├─ Status: OFFLINE
         ├─ Frontend notified
         └─ Trip auto-ended


Timeline Example:
────────────────────────────────────────────────────────────────────
t=0s       t=20s      t=40s      t=60s      t=80s       t=100s
│          │          │          │          │           │
[Telemetry][HB]    [Telemetry][HB]    [Telemetry]    [OFFLINE]
LIVE       LIVE       LIVE       LIVE       LIVE        OFFLINE
                                                        (no data for 60s)

HB = Heartbeat ping/pong
```

---

## 4. TRIP AUTO-DETECTION FLOW

```
Vehicle Telemetry Stream (every 2 seconds)
│
├─ Check: ignitionStatus ON AND speed > 5 km/h
│  └─ Action: START TRIP
│     ├─ TripLog.create({ vehicleId, startTime, startLocation })
│     ├─ GpsHistory.create({ tripId, lat, lng })
│     ├─ Emit: trip:started
│     └─ Log event: TRIP_STARTED
│
├─ While trip is active:
│  └─ Every reading: UPDATE TRIP
│     ├─ GpsHistory.create({ tripId, lat, lng })
│     ├─ Calculate distance from previous point
│     ├─ Update tripLog.distance += calculated_delta
│     └─ Emit: trip:update
│
└─ Check: ignitionStatus OFF OR speed < 2 km/h
   └─ Action: END TRIP
      ├─ TripLog.update({
      │  endTime: now,
      │  avgSpeed = distance / duration,
      │  fuelUsed = calculated from fuel level delta
      │})
      ├─ Emit: trip:ended
      └─ Log event: TRIP_ENDED


Example:
─────────────────────────────────────────────────────────
t=0s           t=30s          t=60s         t=90s
Ignition OFF   Ignition ON    [TRIP ACTIVE] Ignition OFF
Speed = 0      Speed = 8      Speed = 45    Speed = 0
               (START TRIP)   (TRACKING)    (END TRIP)
               │              │             │
               ▼              ▼             ▼
           tripId=123    Distance=8km  Distance=15km
           startTime     Duration=60s  avgSpeed=15km/h
           lat1, lng1    12 GPS points 6 liters used
```

---

## 5. TELEMETRY HISTORY STORAGE (RING BUFFER)

```
Database: TelemetryHistory table
─────────────────────────────────────

For each vehicle, store last 100 readings (ring buffer):

Vehicle ABC123
│
├─ Reading 1 (t=0:00) → rpm=700,  speed=0,   coolant=20
├─ Reading 2 (t=0:02) → rpm=800,  speed=5,   coolant=25
├─ Reading 3 (t=0:04) → rpm=1200, speed=15,  coolant=35
├─ ...
├─ Reading 100 (t=3:18)
│
└─ (Next reading deletes oldest, adds newest - ring buffer)

Frontend Chart Display:
────────────────────────

LiveChart component:
1. On mount: Fetch GET /api/obd/history/:vehicleId?limit=50
   └─ Gets last 50 readings (chronological order)
   └─ Renders chart with all 50 points

2. On live:update event: Add new reading to chart
   └─ Keep last 50 points visible
   └─ Chart updates real-time

Result:
├─ RPM chart shows 50 readings = ~100 seconds of history
├─ Speed chart shows smooth acceleration/deceleration
├─ Coolant shows engine warmup
└─ Fuel shows consumption pattern
```

---

## 6. EVENT LOGGING SYSTEM

```
Event Types:
─────────────
OBD_CONNECTED        → Device first connects, telemetry received
OBD_DISCONNECTED     → Device disconnected (60s timeout)
MQTT_CONNECTED       → MQTT broker connection established
MQTT_RECONNECTED     → MQTT reconnection after loss
TELEMETRY_RECEIVED   → New OBD reading received
GPS_UPDATED          → GPS coordinates updated
DTC_GENERATED        → Diagnostic trouble code detected
TRIP_STARTED         → Trip auto-detected start
TRIP_ENDED           → Trip auto-detected end
ALERT_CREATED        → Fuel/coolant/battery alert triggered
VEHICLE_OFFLINE      → Vehicle status changed to OFFLINE
VEHICLE_ONLINE       → Vehicle status changed to ONLINE


EventLog Table:
───────────────
id          UUID
vehicleId   FK
eventType   ENUM (above)
message     String (human-readable)
metadata    JSON (additional data)
createdAt   DateTime (indexed)

Example Events for one trip:
─────────────────────────────
t=10:00:00  OBD_CONNECTED      "OBD connection established"
t=10:00:05  TELEMETRY_RECEIVED "RPM: 700, Speed: 0"
t=10:00:10  TRIP_STARTED       "Trip started at GPS location"
t=10:02:30  GPS_UPDATED        "GPS: 37.5, -122.3"
t=10:05:15  TELEMETRY_RECEIVED "RPM: 2500, Speed: 65"
t=10:10:45  TRIP_ENDED         "Trip ended - Distance: 15km, Duration: 10:45"
t=10:10:50  VEHICLE_OFFLINE    "No telemetry for 60 seconds"
```

---

## 7. HEARTBEAT PING/PONG MECHANISM

```
Frontend (Client-side Timer)
────────────────────────────
every 20 seconds:
  socket.emit('heartbeat:ping', { vehicleId })

Backend Socket Handler
──────────────────────
On heartbeat:ping:
  ├─ Validate vehicleId
  ├─ Update telematicsDevice.lastHeartbeatAt = now
  ├─ Update vehicle.telemetryOnline = true
  ├─ Emit 'heartbeat:pong' to sender
  ├─ Emit 'device:heartbeat' to vehicle room
  └─ (Vehicle stays LIVE even without new telemetry)

If no heartbeat for 60 seconds:
  └─ Vehicle marked OFFLINE
     ├─ Auto-end active trips
     ├─ Notify frontend
     └─ Update status to OFFLINE


Timeout Calculation:
────────────────────
LIVE Status:
  if (lastHeartbeat < 60s ago OR lastTelemetry < 5s ago)
    return LIVE
  else if (lastHeartbeat < 60s ago OR lastTelemetry < 60s ago)
    return IDLE (connected but no recent data)
  else
    return OFFLINE (no activity for 60s+)
```

---

## 8. DATA FLOW: OBD READING → FRONTEND CHART

```
Device App (Mobile/OBD Gateway)
│
├─ Reads OBD sensor data
│  └─ rpm, speed, coolant, fuel, battery, etc.
│
└─ Sends via Socket.IO
   └─ socket.emit('vehicle:liveData', {
      vehicleId, rpm, speed, coolant, ..., timestamp
    })

Backend - Socket Handler
│
├─ Validates device authorization
├─ Calls ingestObdReading(vehicleId, payload)
│  │
│  ├─ Apply telemetry validation (clamp, finite checks)
│  ├─ Create ObdLiveData record (raw storage)
│  ├─ Create TelemetryHistory record (for charts) ✓
│  ├─ Update VehicleLiveState (current state)
│  ├─ Check for trip auto-start/end ✓
│  ├─ Log event (TELEMETRY_RECEIVED) ✓
│  └─ Update vehicle.lastObdAt = now
│
└─ Broadcasts via Socket.IO
   └─ io.to(`vehicle:${vehicleId}`).emit('live:update', {
      vehicleId, rpm, speed, coolant, ...
    })

Frontend - Component
│
├─ Receives 'live:update' event
├─ Updates state with new reading
├─ LiveChart component
│  ├─ Stores data in state array [last 50]
│  ├─ Re-renders Recharts LineChart
│  └─ Shows smooth line with new point
│
└─ User sees:
   ├─ Real-time gauge with new value
   ├─ Chart updates with new point
   └─ Smooth line showing history
```

---

## 9. MAP STICKY POSITIONING LAYOUT

```
Before (Problem):
─────────────────
┌──────────────────────────────────┐
│ Header                           │
└──────────────────────────────────┘
┌──────────────────────────────────┐
│ Status                           │
└──────────────────────────────────┘
┌──────────────────────────────────┐
│ Gauges (RPM, Speed, Load)        │
└──────────────────────────────────┘
┌──────────────────────────────────┐
│ MAP (DISAPPEARS WHEN           │ ← SCROLLED OUT OF VIEW
│ YOU SCROLL DOWN)                 │
└──────────────────────────────────┘
┌──────────────────────────────────┐
│ Coolant, Fuel, Battery          │
│ (scroll down) ↓↓↓               │
└──────────────────────────────────┘
    (map is now hidden!)

After (Fixed):
──────────────
┌─────────────────────────────────────────────────────────────┐
│ Header                                                       │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│ Status                                                       │
└─────────────────────────────────────────────────────────────┘

Two-column grid (lg:grid-cols-3):
┌──────────────────┬────────────────────────────────────────┐
│ LEFT (STICKY)    │ RIGHT (SCROLLABLE)                     │
│ top: 1.5rem      │                                        │
│                  │ Gauges (RPM, Speed, Load)              │
│ [MAP]            │ ├─ updates in place                   │
│ [STAYS HERE]     │ └─ doesn't scroll map                 │
│ [ALWAYS VISIBLE] │                                        │
│                  │ Stat Cards (Coolant, Fuel, Battery)   │
│ Vehicle Info     │ ├─ scrolls independently               │
│ ├─ Status        │ └─ map stays visible                  │
│ ├─ Ignition      │                                        │
│ ├─ Odometer      │ Charts                                 │
│ └─ Engine Hours  │ ├─ RPM vs Speed                        │
│                  │ ├─ Temp & Fuel                        │
│                  │ └─ Load & Battery                      │
└──────────────────┴────────────────────────────────────────┘

Result:
- Map always visible (sticky left column)
- User can scroll diagnostics on right
- Zoom level preserved (map still in viewport)
- GPS center still focused on vehicle
```

---

## 10. DATABASE SCHEMA ADDITIONS

```
Current Models (Working):
────────────────────────
✓ Vehicle
✓ VehicleLiveState
✓ ObdLiveData
✓ TripLog
✓ GpsHistory
✓ Alert
✓ DtcCode
✓ TelematicsDevice

New Models (Adding):
───────────────────
NEW TelemetryHistory
  id: UUID
  vehicleId: FK → Vehicle
  rpm, speed, coolant, fuel, battery, etc. (Float fields)
  recordedAt: DateTime (indexed)
  Ring buffer: keep 100 per vehicle

NEW EventLog
  id: UUID
  vehicleId: FK → Vehicle
  eventType: ENUM (OBD_*, MQTT_*, TRIP_*, DTC_*, etc.)
  message: String
  metadata: JSON
  createdAt: DateTime (indexed)

Relationships:
──────────────
Vehicle
  ├─ 1-to-1: VehicleLiveState (current state)
  ├─ 1-to-∞: ObdLiveData (historical readings)
  ├─ 1-to-∞: TelemetryHistory (chart data) ← NEW
  ├─ 1-to-∞: EventLog (event stream) ← NEW
  ├─ 1-to-∞: TripLog (trips)
  ├─ 1-to-∞: Alert (alerts)
  └─ 1-to-∞: DtcCode (diagnostics)
```

---

## 11. COMPLETE DATA FLOW DIAGRAM

```
┌────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  DEVICE/SIMULATOR                                                  │
│  ├─ Every 2s: Generate/Read Telemetry                             │
│  │  (rpm, speed, coolant, battery, fuel, gps, ignition, etc.)     │
│  │                                                                 │
│  ├─ Every 20s: Emit heartbeat:ping                                │
│  │                                                                 │
│  └─ Send via Socket.IO or MQTT                                   │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
  │
  ├─ TELEMETRY PATH
  │  │
  │  └─→ Backend Socket: vehicle:liveData
  │      │
  │      ├─ Validate & Clamp (telemetryValidator.js)
  │      ├─ Save ObdLiveData (raw data)
  │      ├─ Save TelemetryHistory (chart data) ← NEW
  │      ├─ Update VehicleLiveState (current)
  │      ├─ Detect trip start/end ← NEW
  │      ├─ Log event ← NEW
  │      ├─ Process alerts
  │      └─ Broadcast live:update
  │
  └─ HEARTBEAT PATH
     │
     └─→ Backend Socket: heartbeat:ping
         │
         ├─ Update device.lastHeartbeatAt
         ├─ Update vehicle.telemetryOnline
         ├─ Emit heartbeat:pong
         └─ Emit device:heartbeat

                          │
                          ▼

         Backend Status Service
         │
         ├─ Check: lastHeartbeat < 60s?
         ├─ Check: lastTelemetry < 5s?
         ├─ Calculate: streamStatus (live/idle/offline)
         └─ Return: telemetryOnline flag

                          │
                          ▼

         Socket.IO Broadcasts
         ├─ live:update → Front-end Gauges
         ├─ trip:started → Front-end Trips
         ├─ trip:ended → Front-end Trips
         ├─ device:heartbeat → Front-end Status
         └─ alert:new → Front-end Alerts

                          │
                          ▼

         Frontend Components
         ├─ Dashboard
         │  ├─ Receives live:update
         │  ├─ Updates gauge values
         │  └─ Charts render real-time
         │
         ├─ LiveOBD
         │  ├─ Left: STICKY map + vehicle info
         │  └─ Right: Gauges + Charts (scrollable)
         │
         ├─ Trips
         │  ├─ Auto-created on trip:started
         │  └─ Completed on trip:ended
         │
         └─ Logs
            ├─ Fetch GET /api/events/:vehicleId
            └─ Display real-time event stream

                          │
                          ▼

         USER SEES:
         ├─ Map always visible (sticky)
         ├─ Real-time gauges updating
         ├─ Charts showing 50 readings
         ├─ Trips auto-generated
         ├─ Events streaming in
         ├─ Status LIVE (not flickering)
         └─ Dashboard feels connected!
```

---

## Summary of Fixes

| Issue | Solution | Status |
|-------|----------|--------|
| Map disappears | Sticky left column | ✅ |
| LIVE/OFFLINE flickers | Heartbeat + 60s timeout | ✅ |
| RPM chart blank | TelemetryHistory + API | ✅ |
| Speed chart blank | Same as RPM | ✅ |
| Trips static | Auto-detect on ignition+speed | ✅ |
| Logs empty | Event logging system | ✅ |
| Telemetry unrealistic | Validation + smooth transitions | ✅ |
| Dashboard disconnected | Real-time updates + charts | ✅ |

**Total Components Fixed:** 8/8
**New Database Tables:** 2 (TelemetryHistory, EventLog)
**New API Endpoints:** 2 (/history, /events)
**New Frontend Components:** 1 (LiveChart)
**Modified Backend Services:** 5
**Modified Frontend Pages:** 3

---

**Architecture Ready for Implementation** ✅
