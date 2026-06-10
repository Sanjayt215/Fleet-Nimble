# FleetNimble Frontend - Quick Fix Reference

Fast implementation guide for the 10 re-render issues identified.

---

## Issue #1 Fix: Dashboard Live Array → Object

**File:** `frontend/src/pages/Dashboard.jsx`

**Current (Broken):**
```javascript
const [live, setLive] = useState([]);

'live:update': (data) => {
  const vid = data.vehicleId ?? data.vehicle_id;
  setLive((prev) => {
    const existing = prev.find((p) => (p.vehicleId ?? p.vehicle_id) === vid) ?? {};
    const filtered = prev.filter((p) => (p.vehicleId ?? p.vehicle_id) !== vid);
    return [mergeTelemetry(existing, data), ...filtered].slice(0, 20);
  });
},
```

**Fixed:**
```javascript
const [liveByVehicleId, setLiveByVehicleId] = useState({});

'live:update': (data) => {
  const vid = data.vehicleId ?? data.vehicle_id;
  setLiveByVehicleId((prev) => ({
    ...prev,
    [vid]: mergeTelemetry(prev[vid], data),
  }));
},

// For display when needed (in render, memoized):
const liveArray = useMemo(() => {
  const arr = Object.values(liveByVehicleId);
  return arr.sort((a, b) => {
    const aTime = new Date(a.recordedAt).getTime();
    const bTime = new Date(b.recordedAt).getTime();
    return bTime - aTime;
  }).slice(0, 20);
}, [liveByVehicleId]);
```

**Update dependent code:**
```javascript
// Old: live.find() → new: liveByVehicleId[chartVehicleId]
const chartVehicleData = useMemo(() => {
  return liveByVehicleId[chartVehicleId] || [];
}, [liveByVehicleId, chartVehicleId]);

// Old: live.filter() → new: Object.values()
const vehicleCount = Object.keys(liveByVehicleId).length;
```

---

## Issue #2 Fix: Dashboard Chart Effect Dependencies

**File:** `frontend/src/pages/Dashboard.jsx`

**Current (Broken):**
```javascript
useEffect(() => {
  if (!chartVehicleId) {
    setChartHistory([]);
    return;
  }
  
  setChartHistory(
    live
      .filter((d) => (d.vehicleId ?? d.vehicle_id) === chartVehicleId)
      .slice(0, 10)
      .reverse()
      .map((d, i) => ({
        t: i,
        rpm: safeChartValue(d.rpm, 0, 8000),
        speed: safeChartValue(d.speed, 0, 200),
      })),
  );
}, [chartVehicleId]);  // ← MISSING 'live' or 'liveArray'
```

**Fixed:**
```javascript
useEffect(() => {
  if (!chartVehicleId) {
    setChartHistory([]);
    return;
  }
  
  setChartHistory(
    liveArray
      .filter((d) => (d.vehicleId ?? d.vehicle_id) === chartVehicleId)
      .slice(0, 10)
      .reverse()
      .map((d, i) => ({
        t: i,
        rpm: safeChartValue(d.rpm, 0, 8000),
        speed: safeChartValue(d.speed, 0, 200),
      })),
  );
}, [chartVehicleId, liveArray]);  // ← ADD liveArray to deps
```

**Or use memoization to avoid recalculating on every live update:**
```javascript
const chartDataForVehicle = useMemo(() => {
  if (!chartVehicleId) return [];
  return liveArray
    .filter((d) => (d.vehicleId ?? d.vehicle_id) === chartVehicleId)
    .slice(0, 10)
    .reverse();
}, [chartVehicleId, liveArray]);

useEffect(() => {
  setChartHistory(
    chartDataForVehicle.map((d, i) => ({
      t: i,
      rpm: safeChartValue(d.rpm, 0, 8000),
      speed: safeChartValue(d.speed, 0, 200),
    }))
  );
}, [chartDataForVehicle]);
```

---

## Issue #3 Fix: OBDHistoryChart Data Array Deduplication

**File:** `frontend/src/components/OBDHistoryChart.jsx`

**Current (Broken):**
```javascript
useEffect(() => {
  if (!liveUpdate) return;
  setData((prev) => [...prev, liveUpdate].slice(-100));  // ← Recreates array every time
}, [liveUpdate?.recordedAt]);
```

**Fixed - Option A: Deduplicate Before Adding:**
```javascript
useEffect(() => {
  if (!liveUpdate) return;
  
  setData((prev) => {
    const lastRecord = prev[prev.length - 1];
    
    // Don't append if same recordedAt (duplicate update)
    if (lastRecord?.recordedAt === liveUpdate.recordedAt) {
      return prev;
    }
    
    // Only add if different timestamp
    return [...prev, liveUpdate].slice(-100);
  });
}, [liveUpdate?.recordedAt]);
```

**Fixed - Option B: Use Immer for Cleaner Updates:**
```javascript
import produce from 'immer';

useEffect(() => {
  if (!liveUpdate) return;
  
  setData(produce((draft) => {
    const lastRecord = draft[draft.length - 1];
    if (lastRecord?.recordedAt !== liveUpdate.recordedAt) {
      draft.push(liveUpdate);
    }
    if (draft.length > 100) {
      draft.splice(0, draft.length - 100);
    }
  }));
}, [liveUpdate?.recordedAt]);
```

**Fixed - Option C: Defer Updates to Prevent Blocking:**
```javascript
import { useDeferredValue } from 'react';

function OBDHistoryChart({ vehicleId, liveUpdate = null }) {
  const [data, setData] = useState([]);
  
  // Defer updates to unblock UI for user interactions
  const deferredUpdate = useDeferredValue(liveUpdate);
  
  useEffect(() => {
    if (!liveUpdate) return;
    setData((prev) => [...prev, liveUpdate].slice(-100));
  }, [liveUpdate?.recordedAt]);

  // Use deferred data for chart (lower priority)
  const deferredData = useDeferredValue(data);
  
  // Recalculate chart with deferred data (lower priority renders)
  const chartData = useMemo(() => {
    return deferredData
      .slice()
      .reverse()
      .map((row) => ({
        time: new Date(row.recordedAt).toLocaleTimeString(),
        value: row[metric],
      }))
      .filter((d) => d.value != null);
  }, [deferredData, metric]);
```

---

## Issue #4 Fix: LiveOBD Conditional State Spreading

**File:** `frontend/src/pages/LiveOBD.jsx`

**Current (Broken):**
```javascript
'live:update': (d) => {
  const vid = d.vehicleId ?? d.vehicle_id;
  if (vid === vehicleId) {
    setLive((prev) => mergeTelemetry(prev, d));
    setTelemetryHealth((prev) => prev ? {
      ...prev,  // ← Always spreads entire object
      streamStatus: 'live',
      lastObdAt: d.recordedAt || new Date().toISOString(),
    } : prev);
  }
},

'device:heartbeat': (d) => {
  if (d.vehicleId === vehicleId) {
    setTelemetryHealth((prev) => ({
      ...(prev || {}),  // ← Always spreads entire object
      mqttStatus: d.mqttStatus,
      lastHeartbeatAt: d.lastHeartbeatAt ?? prev?.lastHeartbeatAt,
    }));
  }
},
```

**Fixed - Option A: Check Before Spreading:**
```javascript
'live:update': (d) => {
  const vid = d.vehicleId ?? d.vehicle_id;
  if (vid === vehicleId) {
    setLive((prev) => mergeTelemetry(prev, d));
    
    setTelemetryHealth((prev) => {
      if (!prev) return prev;
      
      const newStatus = 'live';
      const newLastObdAt = d.recordedAt || new Date().toISOString();
      
      // Only spread if something actually changed
      if (prev.streamStatus === newStatus && prev.lastObdAt === newLastObdAt) {
        return prev;
      }
      
      return {
        ...prev,
        streamStatus: newStatus,
        lastObdAt: newLastObdAt,
      };
    });
  }
},

'device:heartbeat': (d) => {
  if (d.vehicleId === vehicleId) {
    setTelemetryHealth((prev) => {
      if (!prev) return prev;
      
      // Only update if values changed
      if (prev.mqttStatus === d.mqttStatus) {
        return prev;
      }
      
      return {
        ...prev,
        mqttStatus: d.mqttStatus,
        lastHeartbeatAt: d.lastHeartbeatAt ?? prev.lastHeartbeatAt,
      };
    });
  }
},
```

**Fixed - Option B: Separate State Atoms:**
```javascript
const [live, setLive] = useState(null);
const [streamStatus, setStreamStatus] = useState(null);
const [lastObdAt, setLastObdAt] = useState(null);
const [mqttStatus, setMqttStatus] = useState(null);
const [lastHeartbeatAt, setLastHeartbeatAt] = useState(null);

useSocket({
  'live:update': (d) => {
    const vid = d.vehicleId ?? d.vehicle_id;
    if (vid === vehicleId) {
      setLive((prev) => mergeTelemetry(prev, d));
      setStreamStatus('live');
      setLastObdAt(d.recordedAt || new Date().toISOString());
    }
  },
  'device:heartbeat': (d) => {
    if (d.vehicleId === vehicleId) {
      setMqttStatus(d.mqttStatus);
      setLastHeartbeatAt(d.lastHeartbeatAt);
    }
  },
});

// Create telemetryHealth object from atoms when needed (memoized)
const telemetryHealth = useMemo(() => ({
  streamStatus,
  lastObdAt,
  mqttStatus,
  lastHeartbeatAt,
}), [streamStatus, lastObdAt, mqttStatus, lastHeartbeatAt]);
```

---

## Issue #5 Fix: useSocket Event Handler Stale Closure

**File:** `frontend/src/hooks/useSocket.js`

**Current (Broken):**
```javascript
export function useSocket(events = {}, vehicleId = null) {
  const { isAuthenticated } = useAuth();
  const handlers = useRef(events);
  handlers.current = events;

  useEffect(() => {
    // ...setup...
    const subs = Object.entries(events).map(([event, fn]) => {
      if (typeof fn !== 'function') return null;
      const wrapped = (...args) => {
        const handler = handlers.current[event];  // ← Stale closure
        if (typeof handler === 'function') handler(...args);
      };
      socket.on(event, wrapped);
      return [event, wrapped];
    }).filter(Boolean);

    return () => {
      // ...cleanup...
      subs.forEach(([event, wrapped]) => socket.off(event, wrapped));
    };
  }, [isAuthenticated, vehicleId]);  // ← Missing 'events'
}
```

**Fixed:**
```javascript
import { useMemo } from 'react';

export function useSocket(events = {}, vehicleId = null) {
  const { isAuthenticated } = useAuth();
  
  // Memoize events to avoid ref updates on every render
  const memoizedEvents = useMemo(() => events, [events]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const socket = connectSocket();
    const joinRooms = () => {
      socket.emit('join:user');
      if (vehicleId) socket.emit('join:vehicle', vehicleId);
    };

    joinRooms();
    socket.on('connect', joinRooms);

    const interval = setInterval(() => {
      if (socket.connected) socket.emit('ping:heartbeat');
    }, 20000);

    // Subscribe directly to handlers (no wrapper needed)
    const subs = Object.entries(memoizedEvents).map(([event, fn]) => {
      if (typeof fn !== 'function') return null;
      socket.on(event, fn);  // ← Direct subscription
      return [event, fn];
    }).filter(Boolean);

    return () => {
      clearInterval(interval);
      socket.off('connect', joinRooms);
      subs.forEach(([event, fn]) => socket.off(event, fn));  // ← Unsubscribe direct
    };
  }, [isAuthenticated, vehicleId, memoizedEvents]);  // ← ADD memoizedEvents
}
```

---

## Issue #6 Fix: Extract Memoized Sub-Components

**File:** `frontend/src/pages/Dashboard.jsx`

**Create new file:** `frontend/src/components/DashboardStatsGrid.jsx`
```javascript
import { memo } from 'react';
import StatCard from './StatCard';

const DashboardStatsGrid = memo(function DashboardStatsGrid({ stats }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4">
      <StatCard title="Vehicles" value={stats?.vehicleCount ?? '—'} icon="🚗" />
      <StatCard title="Online" value={stats?.onlineVehicles ?? '—'} icon="📡" />
      <StatCard title="Utilization" value={stats != null ? `${stats.fleetUtilization}%` : '—'} icon="📈" />
      <StatCard title="Active DTCs" value={stats?.activeDtc ?? '—'} icon="⚠️" />
      <StatCard title="Pending DTCs" value={stats?.pendingDtc ?? '—'} icon="🟡" />
      <StatCard title="Alerts" value={stats?.unreadAlerts ?? '—'} icon="🔔" />
      <StatCard title="Maintenance Due" value={stats?.maintenanceDue ?? '—'} icon="🔩" />
      <StatCard
        title="Fuel (30d)"
        value={stats != null ? `${(stats.fuelLiters30d ?? 0).toFixed(0)} L` : '—'}
        icon="⛽"
      />
    </div>
  );
});

export default DashboardStatsGrid;
```

**Create new file:** `frontend/src/components/DashboardVehicleGrid.jsx`
```javascript
import { memo } from 'react';
import { Link } from 'react-router-dom';

const DashboardVehicleGrid = memo(function DashboardVehicleGrid({ vehicles, obdStatus }) {
  return (
    <div className="card">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold">Fleet Vehicles</h3>
        <Link to="/vehicles" className="text-sm text-fleet-600 hover:underline">View all</Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {vehicles.map((v) => (
          <Link key={v.id} to={`/vehicles/${v.id}`} className="rounded-lg border p-4 hover:border-fleet-500 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  obdStatus[v.id] === 'live'
                    ? 'bg-green-500'
                    : obdStatus[v.id] === 'stale'
                      ? 'bg-yellow-500'
                      : 'bg-slate-400'
                }`}
                title="OBD stream status"
              />
              <p className="font-medium">{v.make} {v.model}</p>
            </div>
            <p className="text-sm text-slate-500">{v.plateNumber || v.vin || 'No plate'}</p>
          </Link>
        ))}
      </div>
    </div>
  );
});

export default DashboardVehicleGrid;
```

**Update Dashboard.jsx:**
```javascript
import DashboardStatsGrid from '../components/DashboardStatsGrid';
import DashboardVehicleGrid from '../components/DashboardVehicleGrid';

export default function Dashboard() {
  // ... state setup ...
  
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold">Dashboard</h2>
        <p className="text-slate-500">Fleet KPIs and live telemetry (Socket.IO + OBD)</p>
      </div>

      {/* Stats won't re-render when live updates */}
      <DashboardStatsGrid stats={stats} />

      {/* Chart section - separate component later */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Chart and Alert Center */}
      </div>

      {/* Vehicle grid only re-renders if vehicles or obdStatus changes */}
      <DashboardVehicleGrid vehicles={vehicles} obdStatus={obdStatus} />
    </div>
  );
}
```

---

## Issue #7 Fix: Optimize OBDHistoryChart Data Computation

**File:** `frontend/src/components/OBDHistoryChart.jsx`

**Current (Broken):**
```javascript
const chartData = useMemo(() => {
  return data
    .slice()           // Creates new array
    .reverse()         // Creates new array
    .map((row) => ({
      time: new Date(row.recordedAt).toLocaleTimeString(),  // Expensive
      value: row[metric],
    }))
    .filter((d) => d.value != null);
}, [data, metric]);  // Recalculates on EVERY data point added
```

**Fixed - Option A: Pre-format Timestamps:**
```javascript
const [formattedData, setFormattedData] = useState([]);

// Format timestamps once when data arrives
useEffect(() => {
  if (!data.length) {
    setFormattedData([]);
    return;
  }

  const formatted = data.map((row) => ({
    ...row,
    _time: new Date(row.recordedAt).toLocaleTimeString(),
  }));

  setFormattedData(formatted);
}, [data]);

// Chart data only needs to reverse and filter
const chartData = useMemo(() => {
  return formattedData
    .slice()
    .reverse()
    .map((row) => ({
      time: row._time,
      value: row[metric],
    }))
    .filter((d) => d.value != null);
}, [formattedData, metric]);
```

**Fixed - Option B: Use useDeferredValue:**
```javascript
import { useDeferredValue } from 'react';

function OBDHistoryChart({ vehicleId, liveUpdate = null }) {
  const [data, setData] = useState([]);

  // Defer chart data updates (lower priority than user input)
  const deferredData = useDeferredValue(data);

  // Only recalculate when deferred data changes
  const chartData = useMemo(() => {
    return deferredData
      .slice()
      .reverse()
      .map((row) => ({
        time: new Date(row.recordedAt).toLocaleTimeString(),
        value: row[metric],
      }))
      .filter((d) => d.value != null);
  }, [deferredData, metric]);  // ← Uses deferredData instead of data

  // Rest of component...
}
```

---

## Issue #8 Fix: Separate Vehicle State

**File:** `frontend/src/pages/VehicleDetails.jsx`

**Current (Broken):**
```javascript
const [vehicle, setVehicle] = useState(null);
const [live, setLive] = useState(null);

useSocket(
  {
    'live:update': (d) => {
      if (d.vehicleId === id) {
        setLive((prev) => mergeTelemetry(prev, d));
      }
    },
    'device:heartbeat': (d) => {
      if (d.vehicleId === id) {
        setVehicle((prev) => prev ? {
          ...prev,  // ← Spreads entire 10-20 field object
          telemetryHealth: {
            ...prev.telemetryHealth,
            mqttStatus: d.mqttStatus,
            lastHeartbeatAt: d.lastHeartbeatAt,
          },
        } : prev);
      }
    },
  },
  id
);
```

**Fixed:**
```javascript
const [vehicle, setVehicle] = useState(null);
const [live, setLive] = useState(null);
const [telemetryHealth, setTelemetryHealth] = useState(null);

useSocket(
  {
    'live:update': (d) => {
      if (d.vehicleId === id) {
        setLive((prev) => mergeTelemetry(prev, d));
      }
    },
    'device:heartbeat': (d) => {
      if (d.vehicleId === id) {
        // ← Update only telemetryHealth, not entire vehicle
        setTelemetryHealth((prev) => prev ? {
          ...prev,
          mqttStatus: d.mqttStatus,
          lastHeartbeatAt: d.lastHeartbeatAt ?? prev.lastHeartbeatAt,
        } : prev);
      }
    },
  },
  id
);

useEffect(() => {
  api.get(`/vehicles/${id}`).then((r) => {
    setVehicle(r.data.data);
    setTelemetryHealth(r.data.data?.telemetryHealth ?? null);
  });
  api.get(`/obd/latest/${id}`).then((r) => r.data.data && setLive(r.data.data));
}, [id]);

// In render:
{vehicle && (
  <>
    {/* Static vehicle info doesn't re-render on telemetryHealth updates */}
    <h2>{vehicle.make} {vehicle.model} {vehicle.year}</h2>
    
    {/* Only this updates on heartbeat */}
    <TelemetryHealthCard health={telemetryHealth} />
    
    {/* Gauges only re-render if live data changes */}
    <GaugeChart label="RPM" value={live?.rpm} />
  </>
)}
```

---

## Issue #9 Fix: Remove Unnecessary Assignment

**File:** `frontend/src/pages/Dashboard.jsx`

**Current (Broken):**
```javascript
const chartData = chartHistory;

return (
  <ResponsiveContainer>
    <LineChart data={chartData}>  // ← New reference every render
```

**Fixed:**
```javascript
return (
  <ResponsiveContainer>
    <LineChart data={chartHistory}>  // ← Direct reference, or memoize:
```

**Or memoize if needed:**
```javascript
const chartData = useMemo(() => chartHistory, [chartHistory]);
```

---

## Issue #10 Fix: Batch API Calls

**File:** `frontend/src/pages/LiveOBD.jsx`

**Current (Broken):**
```javascript
useEffect(() => {
  api.get(`/vehicles/${vehicleId}`).then((r) => {
    setVehicle(r.data.data);
    setTelemetryHealth(r.data.data?.telemetryHealth ?? null);
  });
  api.get(`/obd/latest/${vehicleId}`).then((r) => {
    if (r.data.data) {
      setLive(r.data.data);
      if (r.data.data.telemetryHealth) setTelemetryHealth(r.data.data.telemetryHealth);
    }
  });
}, [vehicleId]);  // ← Two separate requests, two re-renders
```

**Fixed - Option A: Promise.all:**
```javascript
useEffect(() => {
  Promise.all([
    api.get(`/vehicles/${vehicleId}`),
    api.get(`/obd/latest/${vehicleId}`),
  ]).then(([vehicleRes, obdRes]) => {
    setVehicle(vehicleRes.data.data);
    if (obdRes.data.data) {
      setLive(obdRes.data.data);
      setTelemetryHealth(vehicleRes.data.data?.telemetryHealth ?? obdRes.data.data?.telemetryHealth ?? null);
    }
  }).catch(() => {});
}, [vehicleId]);
```

**Fixed - Option B: Composite Endpoint:**
```javascript
// Backend creates: GET /api/vehicles/:id/live-data
// Returns: { vehicle, liveData, telemetryHealth }

useEffect(() => {
  api.get(`/vehicles/${vehicleId}/live-data`).then((r) => {
    const { vehicle, liveData, telemetryHealth } = r.data.data;
    setVehicle(vehicle);
    setLive(liveData);
    setTelemetryHealth(telemetryHealth);
  }).catch(() => {});
}, [vehicleId]);
```

**Fixed - Option C: AbortController:**
```javascript
useEffect(() => {
  const controller = new AbortController();

  Promise.all([
    api.get(`/vehicles/${vehicleId}`, { signal: controller.signal }),
    api.get(`/obd/latest/${vehicleId}`, { signal: controller.signal }),
  ]).then(([vehicleRes, obdRes]) => {
    setVehicle(vehicleRes.data.data);
    if (obdRes.data.data) setLive(obdRes.data.data);
  }).catch((e) => {
    if (e.name !== 'CanceledError') console.error(e);
  });

  return () => controller.abort();
}, [vehicleId]);
```

---

## Implementation Checklist

- [ ] Issue #1 - Convert Dashboard live array to object (30 min)
- [ ] Issue #2 - Fix chart effect dependencies (5 min)
- [ ] Issue #4 - Add conditional checks to state spreading (10 min)
- [ ] Test: Dashboard should stop flickering during live updates
- [ ] Issue #3 - Add deduplication to OBDHistoryChart (15 min)
- [ ] Issue #5 - Fix useSocket hook closure (10 min)
- [ ] Test: Chart should update smoothly with high-frequency data
- [ ] Issue #6 - Extract memoized Dashboard sub-components (45 min)
- [ ] Issue #7 - Optimize chart data computation (20 min)
- [ ] Issue #8 - Separate VehicleDetails telemetry state (20 min)
- [ ] Issue #9 - Remove unnecessary assignment (2 min)
- [ ] Issue #10 - Batch API calls (15 min)
- [ ] Final test: Open React DevTools Profiler and verify component re-renders
- [ ] Deploy and monitor for user reports of flickering

---

## Performance Verification

After implementing fixes, run these checks:

```javascript
// In React DevTools Profiler
1. Dashboard page - trigger 5 live updates
   Expected: Only obdStatus changes (not full page)
   Before: 100ms+ renders
   After: <10ms updates

2. LiveOBD page - receive 1 update/sec for 30 seconds
   Expected: Gauge charts update smoothly
   Before: Flickering every 200ms
   After: Smooth animations

3. OBDHistoryChart - 100 data points, new point every 200ms
   Expected: Chart appends one point
   Before: Chart recalculates all 100+ points
   After: Only new point added, rest unchanged
```

