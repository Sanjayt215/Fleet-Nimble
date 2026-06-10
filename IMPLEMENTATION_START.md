# FleetNimble Implementation Start Guide

**Status:** ✅ Backend Running | 🚀 Ready to Implement
**Date:** June 8, 2026
**Backend Port:** 5000 ✅
**Database:** PostgreSQL Ready
**MQTT:** Connected ✅

---

## PHASE 1: DATABASE MIGRATION (5 minutes)

### Step 1.1: Update Prisma Schema

Edit `backend/prisma/schema.prisma`:

**Add EventType Enum** (before models section):
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

**Add TelemetryHistory Model** (after VehicleLiveState):
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

**Add EventLog Model** (after TelemetryHistory):
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

**Update Vehicle Model** - Add these relations before closing brace:
```prisma
  telemetryHistory  TelemetryHistory[]
  eventLogs         EventLog[]
```

### Step 1.2: Run Migration

```bash
# Navigate to backend
cd backend

# Run migration (this creates TelemetryHistory and EventLog tables)
npx prisma migrate dev --name add-telemetry-history-and-events

# Verify schema
npx prisma db push
```

---

## PHASE 2: BACKEND SERVICES (20 minutes)

### Step 2.1: Create Event Logging Service

Create `backend/src/services/eventLogService.js`:

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

### Step 2.2: Update Device Auth Service (Heartbeat Logic)

Edit `backend/src/services/deviceAuthService.js`:

**Replace constants (lines 3-5):**
```javascript
const HEARTBEAT_STALE_MS = 60_000;      // Changed from 90_000
const TELEMETRY_LIVE_MS = 5_000;        // Unchanged
const TELEMETRY_STALE_MS = 60_000;      // Changed from 120_000
```

**Replace buildTelemetryHealth function** (entire function):
```javascript
export function buildTelemetryHealth(vehicle, device) {
  const now = Date.now();
  const lastObdAt = vehicle.lastObdAt ? new Date(vehicle.lastObdAt).getTime() : null;
  const lastHeartbeat = device?.lastHeartbeatAt
    ? new Date(device.lastHeartbeatAt).getTime()
    : null;
  const lastDeviceSeen = device?.lastSeenAt ? new Date(device.lastSeenAt).getTime() : null;

  // Determine if connected via heartbeat
  let isConnected = false;
  if (device) {
    if (lastHeartbeat != null && now - lastHeartbeat < HEARTBEAT_STALE_MS) {
      isConnected = true; // Device sent heartbeat within 60s
    } else if (lastDeviceSeen != null && now - lastDeviceSeen < HEARTBEAT_STALE_MS) {
      isConnected = true; // Device was seen within 60s
    }
  } else if (lastObdAt != null && now - lastObdAt < HEARTBEAT_STALE_MS) {
    isConnected = true; // No device tracked, but recent telemetry
  }

  // Stream status
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
    telemetryOnline: isConnected,  // Based on heartbeat
    streamStatus,
    mqttStatus,
    lastObdAt: vehicle.lastObdAt,
    lastHeartbeatAt: device?.lastHeartbeatAt ?? null,
    lastDeviceSeenAt: device?.lastSeenAt ?? null,
    device: device
      ? {
          id: device.id,
          deviceUid: device.deviceUid,
          status: device.status,
          deviceType: device.deviceType,
          firmwareVersion: device.firmwareVersion,
        }
      : null,
  };
}
```

### Step 2.3: Create Trip Service Functions

Edit `backend/src/services/tripService.js` - Add these functions at the end:

```javascript
import { haversineDistance } from '../utils/geoUtils.js';  // or implement inline

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

    // Calculate duration and average speed
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

    // Calculate distance delta
    let distanceDelta = 0;
    if (trip.gpsHistory.length > 0) {
      const last = trip.gpsHistory[trip.gpsHistory.length - 1];
      distanceDelta = calculateDistance(last.latitude, last.longitude, latitude, longitude);
    }

    // Update trip distance
    await prisma.tripLog.update({
      where: { id: tripId },
      data: {
        distance: { increment: distanceDelta },
      },
    });

    return point;
  } catch (err) {
    logger.error('updateTripGps error', { err: err.message });
    return null;
  }
}
```

### Step 2.4: Update OBD Ingest Service

Edit `backend/src/services/obdIngest.js` - Add this helper function and integrate calls:

**Add at top (after imports):**
```javascript
import { logEvent } from './eventLogService.js';
import { autoStartTrip, autoEndTrip, updateTripGps } from './tripService.js';
```

**Add this helper function:**
```javascript
async function saveToTelemetryHistory(vehicleId, telemetry) {
  try {
    const existing = await prisma.telemetryHistory.count({
      where: { vehicleId },
    });

    // Remove oldest if at capacity (ring buffer: max 100)
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
  } catch (err) {
    logger.error('saveToTelemetryHistory error', { err: err.message });
  }
}
```

**In ingestObdReading function, after updating VehicleLiveState, add:**
```javascript
  // Save to history for charts (ring buffer)
  await saveToTelemetryHistory(vehicleId, telemetry);

  // Log telemetry event
  await logEvent(vehicleId, 'TELEMETRY_RECEIVED', 'New OBD reading received', {
    rpm: telemetry.rpm,
    speed: telemetry.speed,
  });

  // Auto-trip detection
  const speed = telemetry.speed || 0;
  const ignition = telemetry.ignitionStatus !== false;
  const gpsLat = telemetry.latitude;
  const gpsLng = telemetry.longitude;
  const odometer = telemetry.odometer;

  // START TRIP: ignition ON + speed > 5
  if (ignition && speed > 5) {
    const trip = await autoStartTrip(vehicleId, gpsLat, gpsLng, odometer);
    if (trip) {
      const io = global.io; // Socket.IO instance (set in server.js)
      if (io) {
        io.to(`vehicle:${vehicleId}`).emit('trip:started', {
          tripId: trip.id,
          vehicleId,
          startTime: trip.startTime,
        });
      }
      await logEvent(vehicleId, 'TRIP_STARTED', 'Trip started', {
        tripId: trip.id,
        location: { lat: gpsLat, lng: gpsLng },
      });
    }
  }

  // END TRIP: ignition OFF OR speed < 2
  if (!ignition || speed < 2) {
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
      await logEvent(vehicleId, 'TRIP_ENDED', 'Trip ended', {
        tripId: ended.id,
        distance: ended.distance,
        duration: ended.endTime - ended.startTime,
      });
    }
  }

  // UPDATE GPS: add point to active trip
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

## PHASE 3: BACKEND API & SOCKETS (15 minutes)

### Step 3.1: Create Log Controller

Create `backend/src/controllers/logController.js`:

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

### Step 3.2: Update OBD Controller

Edit `backend/src/controllers/obdController.js` - Add this endpoint:

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

### Step 3.3: Add Routes

Edit `backend/src/routes/obdRoutes.js` (or main router) - Add these routes:

```javascript
import logController from '../controllers/logController.js';

// Add to router
router.get('/obd/history/:vehicleId', authenticate, obdController.getObdHistory);
router.get('/events/:vehicleId', authenticate, logController.getEvents);
```

### Step 3.4: Add Heartbeat Handler

Edit `backend/src/sockets/index.js` - Add this inside io.on('connection', ...):

```javascript
  socket.on('heartbeat:ping', async (payload) => {
    try {
      const { vehicleId } = payload || {};
      if (!vehicleId) {
        socket.emit('heartbeat:pong', { ts: Date.now(), error: 'vehicleId required' });
        return;
      }

      // Update device timestamps
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

      // Mark vehicle as online
      await prisma.vehicle.update({
        where: { id: vehicleId },
        data: { telemetryOnline: true },
      });

      // Send pong
      socket.emit('heartbeat:pong', { ts: Date.now(), vehicleId });

      // Broadcast to vehicle room
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
```

---

## PHASE 4: FRONTEND COMPONENTS (25 minutes)

### Step 4.1: Create LiveChart Component

Create `frontend/src/components/LiveChart.jsx`:

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
        const vid = d.vehicleId ?? d.vehicle_id;
        if (vid === vehicleId) {
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

  if (isLoading) {
    return <div className="h-64 bg-slate-800 rounded animate-pulse" />;
  }

  if (data.length === 0) {
    return (
      <div className="h-64 bg-slate-800 rounded flex items-center justify-center text-slate-400">
        No data available
      </div>
    );
  }

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

### Step 4.2: Update useSocket Hook

Edit `frontend/src/hooks/useSocket.js` - Add heartbeat emission at the end of the hook:

```javascript
  // Heartbeat ping every 20 seconds
  useEffect(() => {
    if (!socket?.connected || !vehicleId) return;

    const heartbeatInterval = setInterval(() => {
      socket.emit('heartbeat:ping', { vehicleId });
    }, 20_000); // 20 seconds

    return () => clearInterval(heartbeatInterval);
  }, [socket?.connected, vehicleId]);
```

### Step 4.3: Update LiveOBD Page

Edit `frontend/src/pages/LiveOBD.jsx` - Replace the entire return statement with:

```javascript
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <Link to={`/vehicles/${vehicleId}`} className="text-fleet-600 hover:underline">
          ← {vehicle ? `${vehicle.make} ${vehicle.model}` : 'Vehicle'}
        </Link>
        <h2 className="text-2xl font-bold text-white">Live OBD</h2>
      </div>

      <div className={`flex flex-col gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${status.color}`}>
        <div className="flex flex-col gap-2">
          <span className="font-semibold">{status.label}</span>
          {telemetryHealth && (
            <div className="text-slate-300">
              <VehicleStatusBadge health={telemetryHealth} />
            </div>
          )}
        </div>
        <span className="text-sm text-slate-400">
          Last update: {live?.recordedAt ? new Date(live.recordedAt).toLocaleString() : 'Never'}
        </span>
      </div>

      {/* Two-column layout: Left (sticky map) + Right (scrollable content) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT COLUMN: Sticky map and vehicle info */}
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

            <div className="card bg-slate-900 p-4">
              <h3 className="font-semibold text-white mb-3">Vehicle Info</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Status:</span>
                  <span className="text-white font-medium">
                    {live?.vehicleStatus || 'OFFLINE'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Ignition:</span>
                  <span className="text-white font-medium">
                    {live?.ignitionStatus ? 'ON' : 'OFF'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Odometer:</span>
                  <span className="text-white font-medium">
                    {Math.round(live?.odometer || 0)} km
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Engine Hours:</span>
                  <span className="text-white font-medium">
                    {(live?.engineHours || 0).toFixed(1)} h
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Scrollable gauges, stats, and charts */}
        <div className="lg:col-span-2 space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <GaugeChart label="RPM" value={live?.rpm} unit="rpm" max={8000} color="#3b82f6" />
            <GaugeChart label="Speed" value={live?.speed} unit="km/h" max={220} color="#10b981" />
            <GaugeChart label="Engine Load" value={live?.engineLoad} unit="%" max={100} color="#8b5cf6" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <StatCard title="Coolant" value={formatCoolantTemp(live?.coolantTemp)} />
            <StatCard title="Fuel" value={formatFuelLevel(live?.fuelLevel)} />
            <StatCard title="Battery" value={formatBatteryVoltage(live?.batteryVoltage)} />
            <StatCard title="Throttle" value={formatThrottle(live?.throttle)} />
            <StatCard title="MAF" value={formatMAF(live?.maf)} />
            <StatCard title="Intake" value={formatIntakeTemp(live?.intakeTemp)} />
          </div>

          {/* Charts */}
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
      </div>
    </div>
  );
```

### Step 4.4: Import LiveChart in LiveOBD

Edit `frontend/src/pages/LiveOBD.jsx` - Add import at top:

```javascript
import LiveChart from '../components/LiveChart';
```

---

## TESTING & VALIDATION

### Backend Tests

```bash
# Terminal 1: Start backend (already running)
cd backend && npm run dev

# Terminal 2: Check endpoints
curl http://localhost:5000/api/obd/history/YOUR_VEHICLE_ID?limit=50
curl http://localhost:5000/api/events/YOUR_VEHICLE_ID?limit=50

# Verify database was created
npx prisma studio
```

### Frontend Tests

```bash
# Terminal 3: Start frontend
cd frontend && npm run dev

# Visit http://localhost:5173
# Navigate to Live OBD page for a vehicle
# Verify:
# - Map stays visible when scrolling
# - Charts appear with data
# - Status is LIVE (not flickering)
```

---

## TROUBLESHOOTING

### Issue: Charts still blank
**Check:** 
- API returns data: `curl http://localhost:5000/api/obd/history/VEHICLE_ID`
- TelemetryHistory table has data: `npx prisma studio`

**Fix:**
- Restart backend: Kill and restart `npm run dev`
- Ensure telemetry is being generated

### Issue: Map still scrolls
**Check:** 
- LiveOBD.jsx has `sticky top-6` in the container

**Fix:**
- Verify the exact grid layout was applied correctly

### Issue: Trip not auto-generating
**Check:**
- Telemetry shows: ignitionStatus=true AND speed > 5

**Fix:**
- Check logs for TRIP_STARTED event
- Verify autoStartTrip() is being called

---

## NEXT STEPS

1. ✅ Backend is running
2. 📦 Run Prisma migration (Step 1.2)
3. 🔧 Implement Phase 2: Services
4. 📡 Implement Phase 3: API & Sockets
5. 🎨 Implement Phase 4: Frontend
6. ✔️ Test and validate

**Ready? Start with Step 1.1** ⬆️

