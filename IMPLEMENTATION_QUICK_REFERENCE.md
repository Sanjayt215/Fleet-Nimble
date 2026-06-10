# FleetNimble Implementation Quick Reference

## File Changes Summary

### NEW FILES (Create These)
1. `backend/src/services/eventLogService.js` - Event logging
2. `backend/src/controllers/logController.js` - Event API endpoint
3. `frontend/src/components/LiveChart.jsx` - Real-time chart component

### FILES TO MODIFY

#### Database & Schema
- `backend/prisma/schema.prisma` - Add TelemetryHistory + EventLog models

#### Backend Services
- `backend/src/services/deviceAuthService.js` - Update heartbeat logic (constants + buildTelemetryHealth)
- `backend/src/services/obdIngest.js` - Save history + log events + trip detection
- `backend/src/services/tripService.js` - Add autoStartTrip + autoEndTrip + updateTripGps
- `backend/src/services/telemetrySimulator.js` - Ensure smooth transitions (already done)

#### Backend API & Sockets
- `backend/src/controllers/obdController.js` - Add getObdHistory endpoint
- `backend/src/sockets/index.js` - Add heartbeat:ping handler

#### Frontend Pages
- `frontend/src/pages/LiveOBD.jsx` - Add sticky map layout + import LiveChart + add charts
- `frontend/src/pages/Dashboard.jsx` - Fetch telemetry history for charts
- `frontend/src/hooks/useSocket.js` - Add heartbeat:ping emission

---

## Code Snippet Reference

### 1. HEARTBEAT STATUS LOGIC (deviceAuthService.js)

**Key Changes:**
```javascript
// Update constants
const HEARTBEAT_STALE_MS = 60_000;      // ← Changed from 90s
const TELEMETRY_STALE_MS = 60_000;      // ← Changed from 120s
const HEARTBEAT_INTERVAL_MS = 20_000;   // ← New constant

// In buildTelemetryHealth():
// Old logic: Only check lastObdAt
// New logic: Check BOTH lastHeartbeat AND lastObdAt
let isConnected = false;
if (device) {
  if (lastHeartbeat && now - lastHeartbeat < HEARTBEAT_STALE_MS) {
    isConnected = true;
  } else if (lastDeviceSeen && now - lastDeviceSeen < HEARTBEAT_STALE_MS) {
    isConnected = true;
  }
} else if (lastObdAt && now - lastObdAt < HEARTBEAT_STALE_MS) {
  isConnected = true;
}
```

### 2. HEARTBEAT SOCKET HANDLER (sockets/index.js)

**New Handler:**
```javascript
socket.on('heartbeat:ping', async (payload) => {
  const { vehicleId } = payload || {};
  
  // Update device timestamps
  await prisma.telematicsDevice.update({
    where: { id: vehicle.telematicsDevice.id },
    data: {
      lastHeartbeatAt: new Date(),
      lastSeenAt: new Date(),
      status: 'ACTIVE',
    },
  });
  
  // Mark vehicle as online
  await prisma.vehicle.update({
    where: { id: vehicleId },
    data: { telemetryOnline: true },
  });
  
  // Respond
  socket.emit('heartbeat:pong', { ts: Date.now(), vehicleId });
  
  // Broadcast to vehicle room
  io.to(`vehicle:${vehicleId}`).emit('device:heartbeat', {
    vehicleId,
    lastHeartbeatAt: new Date(),
    connected: true,
  });
});
```

### 3. TELEMETRY HISTORY SCHEMA (schema.prisma)

**Add Model:**
```prisma
model TelemetryHistory {
  id          String   @id @default(uuid())
  vehicleId   String   @map("vehicle_id")
  rpm         Float?
  speed       Float?
  coolantTemp Float?   @map("coolant_temp")
  fuelLevel   Float?   @map("fuel_level")
  batteryVoltage Float? @map("battery_voltage")
  throttle    Float?
  engineLoad  Float?   @map("engine_load")
  maf         Float?
  intakeTemp  Float?   @map("intake_temp")
  recordedAt  DateTime @default(now()) @map("recorded_at")
  vehicle     Vehicle  @relation(fields: [vehicleId], references: [id], onDelete: Cascade)

  @@index([vehicleId, recordedAt(sort: Desc)])
  @@map("telemetry_history")
}
```

**Add to Vehicle Model:**
```prisma
telemetryHistory TelemetryHistory[]
```

### 4. EVENT LOG SCHEMA (schema.prisma)

**Add Enum:**
```prisma
enum EventType {
  OBD_CONNECTED
  OBD_DISCONNECTED
  MQTT_CONNECTED
  MQTT_RECONNECTED
  TELEMETRY_RECEIVED
  GPS_UPDATED
  DTC_GENERATED
  TRIP_STARTED
  TRIP_ENDED
  ALERT_CREATED
  VEHICLE_OFFLINE
  VEHICLE_ONLINE
}
```

**Add Model:**
```prisma
model EventLog {
  id        String    @id @default(uuid())
  vehicleId String    @map("vehicle_id")
  eventType EventType @map("event_type")
  message   String
  metadata  Json?     @default("{}")
  createdAt DateTime  @default(now()) @map("created_at")
  vehicle   Vehicle   @relation(fields: [vehicleId], references: [id], onDelete: Cascade)

  @@index([vehicleId, createdAt(sort: Desc)])
  @@map("event_logs")
}
```

**Add to Vehicle Model:**
```prisma
eventLogs EventLog[]
```

### 5. SAVE TELEMETRY TO HISTORY (obdIngest.js)

**Ring Buffer Function:**
```javascript
async function saveToTelemetryHistory(vehicleId, telemetry) {
  const existing = await prisma.telemetryHistory.count({
    where: { vehicleId },
  });

  // Remove oldest if at capacity
  if (existing >= 100) {
    const oldest = await prisma.telemetryHistory.findFirst({
      where: { vehicleId },
      orderBy: { recordedAt: 'asc' },
      select: { id: true },
    });
    if (oldest) {
      await prisma.telemetryHistory.delete({ where: { id: oldest.id } });
    }
  }

  // Add new
  await prisma.telemetryHistory.create({
    data: {
      vehicleId,
      rpm: telemetry.rpm,
      speed: telemetry.speed,
      coolantTemp: telemetry.coolantTemp,
      fuelLevel: telemetry.fuelLevel,
      batteryVoltage: telemetry.batteryVoltage,
      throttle: telemetry.throttle,
      engineLoad: telemetry.engineLoad,
      maf: telemetry.maf,
      intakeTemp: telemetry.intakeTemp,
      recordedAt: new Date(),
    },
  });
}

// Call in ingestObdReading:
await saveToTelemetryHistory(vehicleId, telemetry);
```

### 6. AUTO-TRIP DETECTION (obdIngest.js)

**Trip Detection Logic:**
```javascript
// In ingestObdReading(), after updating telemetry
const speed = telemetry.speed || 0;
const ignition = telemetry.ignitionStatus !== false;
const gpsLat = telemetry.latitude;
const gpsLng = telemetry.longitude;

// START TRIP: ignition ON + speed > 5
if (ignition && speed > 5) {
  const trip = await autoStartTrip(vehicleId, gpsLat, gpsLng, telemetry.odometer);
  if (trip) {
    io.to(`vehicle:${vehicleId}`).emit('trip:started', {
      tripId: trip.id,
      vehicleId,
      startTime: trip.startTime,
    });
  }
}

// END TRIP: ignition OFF + speed < 2
if (!ignition || speed < 2) {
  const ended = await autoEndTrip(vehicleId);
  if (ended) {
    io.to(`vehicle:${vehicleId}`).emit('trip:ended', {
      tripId: ended.id,
      vehicleId,
      distance: ended.distance,
    });
  }
}

// UPDATE GPS: add point to active trip
if (ignition && speed > 5 && gpsLat && gpsLng) {
  const trip = await prisma.tripLog.findFirst({
    where: { vehicleId, endTime: null },
  });
  if (trip) {
    await updateTripGps(trip.id, gpsLat, gpsLng, telemetry.odometer);
  }
}
```

### 7. STICKY MAP LAYOUT (LiveOBD.jsx)

**Two-Column Grid:**
```jsx
<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
  {/* LEFT: Sticky map + vehicle info */}
  <div className="lg:col-span-1">
    <div className="sticky top-6 space-y-4">
      {/* Map */}
      <div className="card bg-slate-900">
        <h3 className="mb-3 font-semibold text-white">GPS Position</h3>
        <LeafletMap lat={lat} lng={lng} />
      </div>
      
      {/* Vehicle Info */}
      <div className="card bg-slate-900 p-4">
        <h3 className="font-semibold text-white mb-3">Vehicle Info</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-400">Status:</span>
            <span className="text-white font-medium">{live?.vehicleStatus || 'OFFLINE'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Ignition:</span>
            <span className="text-white font-medium">{live?.ignitionStatus ? 'ON' : 'OFF'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Odometer:</span>
            <span className="text-white font-medium">{Math.round(live?.odometer || 0)} km</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  {/* RIGHT: Scrollable diagnostics + charts */}
  <div className="lg:col-span-2 space-y-6">
    {/* Gauges */}
    <div className="grid gap-4 md:grid-cols-3">
      ...
    </div>
    
    {/* Charts */}
    <LiveChart vehicleId={vehicleId} title="..." lines={...} />
  </div>
</div>
```

### 8. LIVE CHART COMPONENT (LiveChart.jsx)

**Basic Structure:**
```jsx
import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useSocket } from '../hooks/useSocket';

export default function LiveChart({ vehicleId, title, lines }) {
  const [data, setData] = useState([]);

  // Fetch history on mount
  useEffect(() => {
    fetch(`/api/obd/history/${vehicleId}?limit=50`)
      .then(r => r.json())
      .then(res => {
        if (res.data) {
          setData(res.data.map(d => ({
            t: new Date(d.recordedAt).getTime(),
            ...lines.reduce((acc, line) => {
              acc[line.key] = d[line.key];
              return acc;
            }, {}),
          })));
        }
      });
  }, [vehicleId]);

  // Listen for real-time updates
  useSocket({
    'live:update': (d) => {
      if (d.vehicleId === vehicleId) {
        setData(prev => {
          const updated = [...prev, {
            t: new Date(d.recordedAt).getTime(),
            ...lines.reduce((acc, line) => {
              acc[line.key] = d[line.key];
              return acc;
            }, {}),
          }];
          return updated.slice(-50); // Keep last 50
        });
      }
    },
  }, vehicleId);

  return (
    <div className="card bg-slate-900 p-4">
      <h3 className="font-semibold text-white mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="t" type="number" tickFormatter={ms => new Date(ms).toLocaleTimeString()} />
          <YAxis />
          <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }} />
          <Legend />
          {lines.map(line => (
            <Line key={line.key} type="monotone" dataKey={line.key} stroke={line.color} dot={false} name={line.name} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

### 9. HEARTBEAT PING EMISSION (useSocket.js)

**Add Interval:**
```javascript
useEffect(() => {
  if (!socket?.connected || !vehicleId) return;

  const heartbeatInterval = setInterval(() => {
    socket.emit('heartbeat:ping', { vehicleId });
  }, 20_000); // 20 seconds

  return () => clearInterval(heartbeatInterval);
}, [socket?.connected, vehicleId]);
```

### 10. EVENT LOG SERVICE (eventLogService.js)

**Complete Service:**
```javascript
import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

export async function logEvent(vehicleId, eventType, message, metadata = {}) {
  try {
    const event = await prisma.eventLog.create({
      data: {
        vehicleId,
        eventType,
        message,
        metadata,
      },
    });
    logger.info(`Event logged: ${eventType}`, { vehicleId, message });
    return event;
  } catch (err) {
    logger.error('logEvent error', { err: err.message });
    return null;
  }
}

export async function getEventLog(vehicleId, limit = 50) {
  try {
    const events = await prisma.eventLog.findMany({
      where: { vehicleId },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit, 10),
    });
    return events;
  } catch (err) {
    logger.error('getEventLog error', { err: err.message });
    return [];
  }
}
```

### 11. EVENT LOG CONTROLLER (logController.js)

**Complete Controller:**
```javascript
import { getEventLog } from '../services/eventLogService.js';

export async function getEvents(req, res) {
  try {
    const { vehicleId } = req.params;
    const { limit = 50 } = req.query;

    const events = await getEventLog(vehicleId, limit);
    res.json({ data: events, total: events.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
```

### 12. OBD HISTORY ENDPOINT (obdController.js)

**New Endpoint:**
```javascript
export async function getObdHistory(req, res) {
  try {
    const { vehicleId } = req.params;
    const { limit = 50 } = req.query;

    const history = await prisma.telemetryHistory.findMany({
      where: { vehicleId },
      orderBy: { recordedAt: 'desc' },
      take: parseInt(limit, 10),
    });

    res.json({
      data: history.reverse(), // Chronological order for chart
      total: history.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
```

**Add Route:**
```javascript
router.get('/obd/history/:vehicleId', authenticate, obdController.getObdHistory);
router.get('/events/:vehicleId', authenticate, logController.getEvents);
```

---

## Implementation Checklist

### Phase 1: Database (5 min)
- [ ] Add TelemetryHistory to schema.prisma
- [ ] Add EventType enum to schema.prisma
- [ ] Add EventLog to schema.prisma
- [ ] Add relations to Vehicle model
- [ ] Run migration: `npx prisma migrate dev`

### Phase 2: Backend Services (20 min)
- [ ] Update deviceAuthService.js constants and buildTelemetryHealth()
- [ ] Create eventLogService.js
- [ ] Update obdIngest.js - add saveToTelemetryHistory()
- [ ] Update obdIngest.js - add trip detection logic
- [ ] Update tripService.js - add autoStartTrip(), autoEndTrip(), updateTripGps()
- [ ] Import logEvent in services that should log

### Phase 3: Backend API (10 min)
- [ ] Add getObdHistory() to obdController.js
- [ ] Create logController.js with getEvents()
- [ ] Add routes to router
- [ ] Add heartbeat:ping handler to sockets/index.js

### Phase 4: Frontend (20 min)
- [ ] Create LiveChart.jsx component
- [ ] Update LiveOBD.jsx - restructure with sticky map + charts
- [ ] Update Dashboard.jsx - fetch telemetry history
- [ ] Update useSocket.js - add heartbeat:ping interval

### Phase 5: Testing (10 min)
- [ ] Run migration
- [ ] Start backend: `npm run dev`
- [ ] Start frontend: `npm run dev`
- [ ] Test map stickiness
- [ ] Test charts display
- [ ] Test trips auto-generate
- [ ] Test events appear
- [ ] Test heartbeat keeps vehicle LIVE

---

## Common Issues & Solutions

**Issue: Charts show blank**
→ Check: Is `/api/obd/history/:vehicleId` endpoint accessible?
→ Fix: Verify route added to router, endpoint returns data

**Issue: Map still scrolls**
→ Check: Is `sticky top-6` applied to container?
→ Fix: Verify `lg:col-span-1` wrapper has `sticky top-6` class

**Issue: Vehicle keeps going offline**
→ Check: Is heartbeat being sent from frontend?
→ Fix: Verify useSocket hook has heartbeat interval

**Issue: Trips not auto-generating**
→ Check: Is telemetry showing ignitionStatus and speed?
→ Fix: Verify trip detection logic in obdIngest.js

**Issue: Events table not created**
→ Check: Did migration run successfully?
→ Fix: Run `npx prisma migrate dev` manually

---

## Testing Commands

```bash
# Start backend
cd backend && npm run dev

# Start frontend  
cd frontend && npm run dev

# Test telemetry history endpoint
curl http://localhost:5000/api/obd/history/VEHICLE_ID?limit=50

# Test events endpoint
curl http://localhost:5000/api/events/VEHICLE_ID?limit=50

# Watch database
npx prisma studio
```

---

**Ready to implement!** ✅
