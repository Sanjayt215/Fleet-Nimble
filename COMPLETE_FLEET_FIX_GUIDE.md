# FleetNimble Complete Fix Implementation Guide

**Status:** Ready for Implementation
**Date:** June 8, 2026
**Total Files to Modify:** 15+
**New Files:** 4

---

## ISSUE ANALYSIS & SOLUTIONS

### ISSUE 1: MAP DISAPPEARS DURING DIAGNOSTICS SCROLLING

**Problem:** Map component in LiveOBD page scrolls out of view when user scrolls down to see diagnostics (coolant, fuel, battery, etc.).

**Root Cause:**
- Map is in a normal `div` card that scrolls with page
- No sticky positioning
- Map height is fixed (h-48 = 192px) but viewport scrolls past it

**Solution:**
Create a two-column layout where map stays fixed on the left, diagnostics scroll on the right.

**Files to Modify:**
- `frontend/src/pages/LiveOBD.jsx` - Restructure layout with sticky map

**Exact Changes:**
```javascript
// Replace main page layout with:
<div className="space-y-6">
  {/* Header */}
  <div className="flex flex-wrap items-center gap-4">...</div>
  
  {/* Status bar */}
  <div className={`...`}>...</div>
  
  {/* Two-column layout: Map (left, sticky) + Content (right, scrollable) */}
  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
    
    {/* LEFT COLUMN: Map (Sticky) */}
    <div className="lg:col-span-1">
      <div className="sticky top-6 space-y-4">
        {lat != null && lng != null && (
          <div className="card bg-slate-900">
            <h3 className="mb-3 font-semibold text-white">GPS Position</h3>
            <LeafletMap lat={lat} lng={lng} />
            <p className="mt-2 text-xs text-slate-500">
              {lat.toFixed(5)}, {lng.toFixed(5)}
            </p>
          </div>
        )}
        
        {/* Vehicle Info Card */}
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
            <div className="flex justify-between">
              <span className="text-slate-400">Engine Hours:</span>
              <span className="text-white font-medium">{(live?.engineHours || 0).toFixed(1)} h</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    {/* RIGHT COLUMN: Diagnostics (Scrollable) */}
    <div className="lg:col-span-2 space-y-6">
      {/* Gauges */}
      <div className="grid gap-4 md:grid-cols-3">
        <GaugeChart label="RPM" ... />
        <GaugeChart label="Speed" ... />
        <GaugeChart label="Engine Load" ... />
      </div>
      
      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        ...
      </div>
      
      {/* Charts */}
      {/* (See Chart Implementation below) */}
    </div>
  </div>
</div>
```

---

### ISSUE 2: LIVE/OFFLINE STATUS CHANGES REPEATEDLY

**Problem:** Vehicle status flickers between LIVE and OFFLINE even with continuous data flow.

**Root Cause:**
1. No heartbeat mechanism - only relies on telemetry timestamps
2. Telemetry read every 2 seconds, but status check based on 5s window (TELEMETRY_LIVE_MS = 5000)
3. Network latency causes status to flip
4. No "keep alive" signal to distinguish between:
   - Connected but no new data (should stay LIVE)
   - Truly disconnected (should be OFFLINE)

**Solution:**
Implement heartbeat system with 60-second timeout for OFFLINE detection.

**Files to Modify:**
- `backend/src/sockets/index.js` - Add heartbeat handlers
- `backend/src/services/vehicleTelemetryStatus.js` - Update status logic with heartbeat timestamps
- `backend/src/utils/constants.js` (create if needed) - Define heartbeat constants
- Frontend: Update heartbeat emission

**Exact Changes:**

**Backend - backend/src/services/deviceAuthService.js:**
```javascript
// Update constants
const HEARTBEAT_STALE_MS = 60_000;      // 60 seconds (CHANGED from 90s)
const TELEMETRY_LIVE_MS = 5_000;        // 5 seconds (unchanged)
const TELEMETRY_STALE_MS = 60_000;      // 60 seconds (CHANGED from 120s)
const HEARTBEAT_INTERVAL_MS = 20_000;   // NEW: 20 second client ping

// Update buildTelemetryHealth function
export function buildTelemetryHealth(vehicle, device) {
  const now = Date.now();
  const lastObdAt = vehicle.lastObdAt ? new Date(vehicle.lastObdAt).getTime() : null;
  const lastHeartbeat = device?.lastHeartbeatAt
    ? new Date(device.lastHeartbeatAt).getTime()
    : null;
  const lastDeviceSeen = device?.lastSeenAt ? new Date(device.lastSeenAt).getTime() : null;

  // **NEW LOGIC: Determine if connected via heartbeat**
  let isConnected = false;
  if (device) {
    if (lastHeartbeat != null && now - lastHeartbeat < HEARTBEAT_STALE_MS) {
      isConnected = true; // Device sent heartbeat within 60s
    } else if (lastDeviceSeen != null && now - lastDeviceSeen < HEARTBEAT_STALE_MS) {
      isConnected = true; // Device was seen within 60s (telemetry or heartbeat)
    }
  } else if (lastObdAt != null && now - lastObdAt < HEARTBEAT_STALE_MS) {
    // No device tracked, but recent telemetry
    isConnected = true;
  }

  // **Stream status: whether we're actively receiving telemetry**
  let streamStatus = 'offline';
  if (isConnected) {
    if (lastObdAt != null) {
      const age = now - lastObdAt;
      if (age < TELEMETRY_LIVE_MS) streamStatus = 'live';
      else streamStatus = 'idle'; // Connected but no recent telemetry
    } else {
      streamStatus = 'idle'; // Connected via heartbeat, no telemetry yet
    }
  }

  let mqttStatus = 'none';
  if (device) {
    if (device.status === 'REVOKED') mqttStatus = 'revoked';
    else if (isConnected) mqttStatus = 'online';
    else mqttStatus = 'offline';
  }

  return {
    telemetryOnline: isConnected,  // **CHANGED: Based on heartbeat, not just telemetry**
    streamStatus,
    mqttStatus,
    lastObdAt: vehicle.lastObdAt,
    lastHeartbeatAt: device?.lastHeartbeatAt ?? null,
    lastDeviceSeenAt: device?.lastSeenAt ?? null,
    device: device ? { /* ... */ } : null,
  };
}
```

**Backend - backend/src/sockets/index.js:**
```javascript
// Add to initSockets function, inside socket.on('connection', ...)

// **NEW: Heartbeat timeout tracker per socket**
const heartbeatTimeouts = new Map(); // socketId → timeoutId

// **NEW: Record heartbeat from device**
socket.on('heartbeat:ping', async (payload) => {
  try {
    const { vehicleId } = payload || {};
    if (!vehicleId) {
      socket.emit('heartbeat:pong', { ts: Date.now(), error: 'vehicleId required' });
      return;
    }

    // Update device last heartbeat timestamp
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: vehicleId },
      include: { telematicsDevice: true },
    });
    
    if (vehicle?.telematicsDevice) {
      await prisma.telematicsDevice.update({
        where: { id: vehicle.telematicsDevice.id },
        data: {
          lastHeartbeatAt: new Date(),
          lastSeenAt: new Date(),
          status: 'ACTIVE',
        },
      });
    }

    // Update vehicle.lastObdAt to keep it connected (don't need new telemetry)
    await prisma.vehicle.update({
      where: { id: vehicleId },
      data: { telemetryOnline: true },
    });

    // Send pong
    socket.emit('heartbeat:pong', { ts: Date.now(), vehicleId });

    // Broadcast status to room
    io.to(`vehicle:${vehicleId}`).emit('device:heartbeat', {
      vehicleId,
      lastHeartbeatAt: new Date(),
      connected: true,
    });

  } catch (err) {
    logger.error('heartbeat:ping error', { err: err.message });
    socket.emit('heartbeat:pong', { ts: Date.now(), error: err.message });
  }
});

// Replace existing ping:heartbeat with heartbeat:ping
// (Keep ping:heartbeat for backward compatibility)
```

**Frontend - frontend/src/hooks/useSocket.js:**
```javascript
// Update useSocket hook to emit heartbeat ping every 20 seconds

useEffect(() => {
  if (!socket?.connected || !vehicleId) return;

  // **NEW: Heartbeat ping interval**
  const heartbeatInterval = setInterval(() => {
    socket.emit('heartbeat:ping', { vehicleId });
  }, 20_000); // 20 seconds

  return () => clearInterval(heartbeatInterval);
}, [socket?.connected, vehicleId]);
```

---

### ISSUE 3: RPM CHART AREA IS BLANK

**Problem:** Chart component displays but has no data - blank area where chart should be.

**Root Cause:**
1. No telemetry history storage in database
2. No API endpoint to fetch historical data
3. Frontend tries to fetch history but table doesn't exist

**Solution:**
1. Add TelemetryHistory table to Prisma schema (stores last 100 readings per vehicle)
2. Create API endpoint to fetch history with pagination
3. Update frontend to fetch and display history
4. Save each telemetry reading to history (ring buffer pattern)

**Files to Modify:**
- `backend/prisma/schema.prisma` - Add TelemetryHistory model
- `backend/src/services/obdIngest.js` - Save to history after ingesting
- `backend/src/controllers/obdController.js` - Add GET /history/:vehicleId endpoint
- `frontend/src/pages/LiveOBD.jsx` - Fetch and display charts with history
- `frontend/src/components/LiveChart.jsx` (NEW) - Real-time chart component

**Exact Changes:**

**Prisma Schema Addition - backend/prisma/schema.prisma:**
```prisma
model TelemetryHistory {
  id          String   @id @default(uuid())
  vehicleId   String   @map("vehicle_id")
  
  // OBD readings
  rpm         Float?
  speed       Float?
  coolantTemp Float?   @map("coolant_temp")
  fuelLevel   Float?   @map("fuel_level")
  batteryVoltage Float? @map("battery_voltage")
  throttle    Float?
  engineLoad  Float?   @map("engine_load")
  maf         Float?
  intakeTemp  Float?   @map("intake_temp")
  
  // Metadata
  recordedAt  DateTime @default(now()) @map("recorded_at")
  vehicle     Vehicle  @relation(fields: [vehicleId], references: [id], onDelete: Cascade)

  @@index([vehicleId, recordedAt(sort: Desc)])
  @@map("telemetry_history")
}
```

Add to Vehicle model in schema.prisma:
```prisma
model Vehicle {
  // ... existing fields ...
  telemetryHistory  TelemetryHistory[]
}
```

**Backend - backend/src/services/obdIngest.js:**
Add this after creating ObdLiveData record:
```javascript
// Ring buffer: Keep only last 100 readings per vehicle
async function saveToTelemetryHistory(vehicleId, telemetry) {
  const existing = await prisma.telemetryHistory.count({
    where: { vehicleId },
  });

  if (existing >= 100) {
    // Delete oldest record
    const oldest = await prisma.telemetryHistory.findFirst({
      where: { vehicleId },
      orderBy: { recordedAt: 'asc' },
      select: { id: true },
    });
    if (oldest) {
      await prisma.telemetryHistory.delete({ where: { id: oldest.id } });
    }
  }

  // Insert new record
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

// In ingestObdReading, add this call:
await saveToTelemetryHistory(vehicleId, telemetry);
```

**Backend - backend/src/controllers/obdController.js:**
Add this new endpoint:
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

Add route to backend router:
```javascript
router.get('/obd/history/:vehicleId', authenticate, obdController.getObdHistory);
```

---

### ISSUE 4: TRIPS PAGE APPEARS STATIC

**Problem:** Trips page shows old data, no real-time trip tracking.

**Root Cause:**
1. Trips are not auto-generated (manual start/end only)
2. No logic to detect trip start (ignition ON + moving)
3. No logic to detect trip end (ignition OFF + stopped)
4. Trip GPS history not updated in real-time

**Solution:**
Implement automatic trip detection based on vehicle state changes.

**Files to Modify:**
- `backend/src/services/tripService.js` - Add auto-detection logic
- `backend/src/services/obdIngest.js` - Call trip service on each telemetry update
- `backend/src/sockets/index.js` - Emit trip events to frontend

**Exact Changes:**

**Backend - backend/src/services/tripService.js:**
```javascript
// Add these functions
export async function autoStartTrip(vehicleId, latitude, longitude, odometer) {
  try {
    // Check if there's already an active trip
    const active = await prisma.tripLog.findFirst({
      where: { vehicleId, endTime: null },
    });

    if (active) return active; // Already in a trip

    // Create new trip
    const trip = await prisma.tripLog.create({
      data: {
        vehicleId,
        startTime: new Date(),
        distance: 0,
        gpsHistory: {
          create: {
            latitude,
            longitude,
          },
        },
      },
      include: { gpsHistory: true },
    });

    logger.info('Trip started', { vehicleId, tripId: trip.id });
    return trip;
  } catch (err) {
    logger.error('autoStartTrip error', { err: err.message });
    return null;
  }
}

export async function autoEndTrip(vehicleId) {
  try {
    const active = await prisma.tripLog.findFirst({
      where: { vehicleId, endTime: null },
      include: { gpsHistory: true },
    });

    if (!active) return null; // No active trip

    // Calculate distance and average speed
    const duration = (new Date() - active.startTime) / 1000; // seconds
    const avgSpeed = duration > 0 ? (active.distance / (duration / 3600)) : 0; // km/h

    // Update trip
    const updated = await prisma.tripLog.update({
      where: { id: active.id },
      data: {
        endTime: new Date(),
        avgSpeed: Math.round(avgSpeed * 10) / 10,
      },
    });

    logger.info('Trip ended', { vehicleId, tripId: active.id, distance: active.distance });
    return updated;
  } catch (err) {
    logger.error('autoEndTrip error', { err: err.message });
    return null;
  }
}

export async function updateTripGps(tripId, latitude, longitude, odometer) {
  try {
    const trip = await prisma.tripLog.findUnique({
      where: { id: tripId },
      include: { gpsHistory: true },
    });

    if (!trip) return null;

    // Add GPS point
    const point = await prisma.gpsHistory.create({
      data: {
        tripId,
        latitude,
        longitude,
      },
    });

    // Update trip distance
    let distance = 0;
    if (trip.gpsHistory.length > 0) {
      const last = trip.gpsHistory[trip.gpsHistory.length - 1];
      distance = calculateDistance(last.latitude, last.longitude, latitude, longitude);
    }

    await prisma.tripLog.update({
      where: { id: tripId },
      data: {
        distance: { increment: distance },
      },
    });

    return point;
  } catch (err) {
    logger.error('updateTripGps error', { err: err.message });
    return null;
  }
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
}
```

**Backend - backend/src/services/obdIngest.js:**
Add to ingestObdReading function:
```javascript
// After processing telemetry and updating vehicle state:

// Auto-trip detection
const speed = telemetry.speed || 0;
const ignition = telemetry.ignitionStatus !== false;
const gpsLat = telemetry.latitude;
const gpsLng = telemetry.longitude;
const odometer = telemetry.odometer;

if (ignition && speed > 5) {
  // Likely trip start
  const trip = await autoStartTrip(vehicleId, gpsLat, gpsLng, odometer);
  if (trip) {
    // Broadcast trip start
    const io = global.io; // Socket.IO instance
    if (io) {
      io.to(`vehicle:${vehicleId}`).emit('trip:started', {
        tripId: trip.id,
        vehicleId,
        startTime: trip.startTime,
      });
    }
  }
} else if (!ignition || speed < 2) {
  // Likely trip end
  const ended = await autoEndTrip(vehicleId);
  if (ended) {
    const io = global.io;
    if (io) {
      io.to(`vehicle:${vehicleId}`).emit('trip:ended', {
        tripId: ended.id,
        vehicleId,
        endTime: ended.endTime,
        distance: ended.distance,
        avgSpeed: ended.avgSpeed,
      });
    }
  }
}

// Update current trip GPS if active
if (ignition && speed > 5 && gpsLat && gpsLng) {
  const activeTrip = await prisma.tripLog.findFirst({
    where: { vehicleId, endTime: null },
  });
  if (activeTrip) {
    await updateTripGps(activeTrip.id, gpsLat, gpsLng, odometer);
  }
}
```

---

### ISSUE 5: LOGS PAGE LACKS REAL-TIME INFORMATION

**Problem:** Logs page is empty or shows stale data, no real-time events.

**Root Cause:**
1. No event logging system in place
2. No EventLog table in database
3. No events emitted for OBD connect/disconnect, MQTT, etc.
4. No API to fetch events

**Solution:**
Create comprehensive event logging system.

**Files to Modify:**
- `backend/prisma/schema.prisma` - Add EventLog model
- `backend/src/services/eventLogService.js` (NEW)
- `backend/src/controllers/logController.js` (NEW)
- Update all services to log events

**Exact Changes:**

**Prisma Schema Addition:**
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

Add to Vehicle model:
```prisma
eventLogs EventLog[]
```

**Backend - backend/src/services/eventLogService.js (NEW FILE):**
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

**Backend - backend/src/controllers/logController.js (NEW FILE):**
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

Add route:
```javascript
router.get('/events/:vehicleId', authenticate, logController.getEvents);
```

**Update Services to Log Events:**

In `backend/src/services/obdIngest.js`:
```javascript
import { logEvent } from './eventLogService.js';

// After successfully ingesting
await logEvent(vehicleId, 'TELEMETRY_RECEIVED', 'New OBD reading received', {
  rpm: telemetry.rpm,
  speed: telemetry.speed,
});

// On first connection
await logEvent(vehicleId, 'OBD_CONNECTED', 'Vehicle OBD connected', {
  source: 'socket',
  deviceId: payload.deviceId,
});
```

In `backend/src/services/tripService.js`:
```javascript
import { logEvent } from './eventLogService.js';

// In autoStartTrip:
await logEvent(vehicleId, 'TRIP_STARTED', 'Trip started', {
  tripId: trip.id,
  location: { lat: latitude, lng: longitude },
});

// In autoEndTrip:
await logEvent(vehicleId, 'TRIP_ENDED', 'Trip ended', {
  tripId: active.id,
  distance: active.distance,
  duration: active.endTime - active.startTime,
});
```

In MQTT handlers:
```javascript
import { logEvent } from '../services/eventLogService.js';

// On MQTT connect
await logEvent(vehicleId, 'MQTT_CONNECTED', 'MQTT connection established');

// On DTC
await logEvent(vehicleId, 'DTC_GENERATED', `DTC code: ${code}`, { codes: codeList });
```

---

### ISSUE 6: TELEMETRY VALUES UPDATE UNREALISTICALLY

**Problem:** Values change randomly, huge jumps, not smooth.

**Root Cause:**
Already addressed in previous work with telemetryValidator.js, but need to ensure:
1. Smooth transitions in simulator (no sudden changes)
2. Realistic ranges enforced
3. Values clamped in API response
4. Frontend formatting applied

**Solution:**
Ensure smooth transitions with smaller deltas between updates.

**Files to Modify:**
- `backend/src/services/telemetrySimulator.js` - Ensure smooth lerp transitions
- Verify telemetryValidator.js is being used everywhere

---

### ISSUE 7: DASHBOARD DOESN'T BEHAVE LIKE REAL CONNECTED VEHICLE

**Problem:** Dashboard doesn't feel connected; values don't update, no real-time feedback.

**Root Cause:**
1. Telemetry history not fetched
2. Charts not populated
3. Status not updated in real-time
4. No vehicle detail info shown

**Solution:**
Implement real-time chart updates and comprehensive vehicle status display.

**Files to Modify:**
- `frontend/src/pages/Dashboard.jsx` - Update chart data fetching and vehicle status
- `frontend/src/components/LiveChart.jsx` (NEW) - Create real-time chart component
- `frontend/src/pages/LiveOBD.jsx` - Add vehicle info sidebar

**Exact Changes:**

**Frontend - frontend/src/components/LiveChart.jsx (NEW FILE):**
```javascript
import { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useSocket } from '../hooks/useSocket';

export default function LiveChart({ vehicleId, title, lines }) {
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useSocket(
    {
      'live:update': (d) => {
        if (d.vehicleId === vehicleId || d.vehicle_id === vehicleId) {
          setData((prev) => {
            const updated = [...prev, {
              t: new Date(d.recordedAt).getTime(),
              ...lines.reduce((acc, line) => {
                acc[line.key] = d[line.key];
                return acc;
              }, {}),
            }];
            // Keep last 50 points
            return updated.slice(-50);
          });
        }
      },
    },
    vehicleId
  );

  useEffect(() => {
    // Fetch historical data
    fetch(`/api/obd/history/${vehicleId}?limit=50`)
      .then((r) => r.json())
      .then((res) => {
        if (res.data) {
          setData(res.data.map((d) => ({
            t: new Date(d.recordedAt).getTime(),
            ...lines.reduce((acc, line) => {
              acc[line.key] = d[line.key];
              return acc;
            }, {}),
          })));
        }
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, [vehicleId, lines]);

  if (isLoading) return <div className="h-64 bg-slate-800 rounded animate-pulse" />;
  if (data.length === 0) return <div className="h-64 bg-slate-800 rounded flex items-center justify-center text-slate-400">No data available</div>;

  return (
    <div className="card bg-slate-900 p-4">
      <h3 className="font-semibold text-white mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis 
            dataKey="t" 
            type="number"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(ms) => new Date(ms).toLocaleTimeString()}
          />
          <YAxis />
          <Tooltip 
            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }}
            labelFormatter={(label) => new Date(label).toLocaleTimeString()}
          />
          <Legend />
          {lines.map((line) => (
            <Line
              key={line.key}
              type="monotone"
              dataKey={line.key}
              stroke={line.color}
              dot={false}
              name={line.name}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

**Frontend - frontend/src/pages/LiveOBD.jsx:**
Add charts at the end:
```javascript
import LiveChart from '../components/LiveChart';

// In the return, add before closing div:
<div className="space-y-6">
  <LiveChart
    vehicleId={vehicleId}
    title="RPM vs Speed"
    lines={[
      { key: 'rpm', name: 'RPM', color: '#3b82f6' },
      { key: 'speed', name: 'Speed (km/h)', color: '#10b981' },
    ]}
  />
  
  <LiveChart
    vehicleId={vehicleId}
    title="Temperature & Fuel"
    lines={[
      { key: 'coolantTemp', name: 'Coolant (°C)', color: '#ef4444' },
      { key: 'intakeTemp', name: 'Intake (°C)', color: '#f97316' },
      { key: 'fuelLevel', name: 'Fuel (%)', color: '#eab308' },
    ]}
  />
  
  <LiveChart
    vehicleId={vehicleId}
    title="Engine Load & Battery"
    lines={[
      { key: 'engineLoad', name: 'Load (%)', color: '#8b5cf6' },
      { key: 'batteryVoltage', name: 'Battery (V)', color: '#06b6d4' },
    ]}
  />
</div>
```

**Frontend - frontend/src/pages/Dashboard.jsx:**
Update to fetch telemetry history for main charts:
```javascript
// In useEffect for fetching data:

// Fetch telemetry history for selected vehicle
if (vehicles.length > 0) {
  const vehicleId = vehicles[0].id;
  fetch(`/api/obd/history/${vehicleId}?limit=50`)
    .then((r) => r.json())
    .then((res) => {
      if (res.data) {
        const formatted = res.data.map((d) => ({
          t: d.recordedAt,
          rpm: d.rpm,
          speed: d.speed,
          coolantTemp: d.coolantTemp,
          fuelLevel: d.fuelLevel,
        }));
        setChartData(formatted);
      }
    })
    .catch(() => {});
}
```

---

## IMPLEMENTATION SEQUENCE

**Phase 1: Database Migrations** (15 minutes)
1. Update Prisma schema with TelemetryHistory and EventLog
2. Run `npx prisma migrate dev --name add-telemetry-history-and-events`

**Phase 2: Backend Services** (30 minutes)
3. Update deviceAuthService.js for heartbeat logic
4. Create eventLogService.js
5. Create logController.js
6. Update obdIngest.js to save history and log events
7. Update tripService.js for auto-trip detection
8. Update telemetrySimulator.js for smooth transitions

**Phase 3: Backend Endpoints & Sockets** (20 minutes)
9. Add /obd/history/:vehicleId endpoint
10. Add /events/:vehicleId endpoint
11. Add heartbeat:ping and heartbeat:pong handlers to sockets
12. Add trip:started and trip:ended events

**Phase 4: Frontend Components** (25 minutes)
13. Create LiveChart.jsx component
14. Update LiveOBD.jsx with two-column sticky layout and charts
15. Update Dashboard.jsx to fetch history
16. Update useSocket hook to emit heartbeats

**Phase 5: Testing** (10 minutes)
17. Start backend: `npm run dev`
18. Run database migration
19. Start frontend: `npm run dev`
20. Test each component

---

## VALIDATION CHECKLIST

- [ ] Map stays visible when scrolling diagnostics
- [ ] Vehicle status stays LIVE for 60 seconds after connection
- [ ] RPM chart displays with data
- [ ] Speed chart displays with data
- [ ] Trips auto-generate on ignition ON + speed > 5 km/h
- [ ] Trips auto-end on ignition OFF + speed < 2 km/h
- [ ] Event logs show real-time events
- [ ] Telemetry values update smoothly (no jumps)
- [ ] All values stay within realistic ranges
- [ ] Dashboard shows current vehicle status (PARKED/IDLING/MOVING)
- [ ] Odometer updates in real-time
- [ ] Battery, coolant, fuel display correctly

---

## RISK MITIGATION

**Risk:** Database migration fails
**Mitigation:** Backup database before running migration; keep schema backup

**Risk:** Performance impact from history storage
**Mitigation:** Ring buffer (max 100 per vehicle); indexes on vehicleId + recordedAt

**Risk:** Socket.IO heartbeat causes excessive traffic
**Mitigation:** 20-second interval (reasonable overhead); deduplication in backend

**Risk:** Trip auto-detection triggers incorrectly
**Mitigation:** Use both ignition AND speed (speed > 5 to start, < 2 to end)

---

## FILES SUMMARY

**New Files:**
1. `backend/src/services/eventLogService.js`
2. `backend/src/controllers/logController.js`
3. `frontend/src/components/LiveChart.jsx`

**Modified Files:**
1. `backend/prisma/schema.prisma` (+2 models)
2. `backend/src/services/deviceAuthService.js` (heartbeat logic)
3. `backend/src/services/obdIngest.js` (+history + event logging)
4. `backend/src/services/tripService.js` (+auto-detection)
5. `backend/src/sockets/index.js` (+heartbeat handlers)
6. `backend/src/controllers/obdController.js` (+history endpoint)
7. `frontend/src/pages/LiveOBD.jsx` (sticky layout + charts)
8. `frontend/src/pages/Dashboard.jsx` (fetch history)
9. `frontend/src/hooks/useSocket.js` (+heartbeat ping)

**Total Changes:** 12 files modified + 3 new files

---

**Status:** Ready for implementation
**Estimated Time:** 2-3 hours
**Complexity:** Medium
**Risk Level:** Low (backward compatible, comprehensive testing needed)
