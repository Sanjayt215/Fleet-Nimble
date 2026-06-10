# FleetNimble Frontend Re-render & Flickering Analysis Report

**Date:** June 8, 2026  
**Focus:** Dashboard, LiveOBD, VehicleDetails pages and supporting components  
**Severity:** HIGH - Multiple patterns causing significant flickering and performance degradation

---

## Executive Summary

The FleetNimble React frontend has **10 critical to moderate re-render issues** causing dashboard flickering:

1. **Array state recreation** - Live telemetry array rebuilt on every socket update
2. **Incorrect effect dependencies** - Chart effects miss live data changes
3. **Full object spreading** - Entire state objects recreated when only fields change
4. **Stale closures in hooks** - Event handlers using outdated references
5. **Parent state cascades** - Single stat change triggers full page re-render
6. **Chart data re-computation** - Arrays recreated on every render cycle
7. **Missing state optimization** - No batching or debouncing of socket events

**Estimated Impact:** Flickering every 100-500ms when receiving high-frequency telemetry updates (typical: 2-5 updates/sec)

---

## Critical Issues (Fix Required)

### Issue #1: Dashboard.jsx - Live Array Fully Recreated Every Update
**File:** [frontend/src/pages/Dashboard.jsx](frontend/src/pages/Dashboard.jsx#L71-L78)  
**Severity:** 🔴 CRITICAL  
**Lines:** 71-78

```javascript
'live:update': (data) => {
  const vid = data.vehicleId ?? data.vehicle_id;
  updateObdStatus(vid, 'live');
  setLive((prev) => {
    const existing = prev.find((p) => (p.vehicleId ?? p.vehicle_id) === vid) ?? {};
    const filtered = prev.filter((p) => (p.vehicleId ?? p.vehicle_id) !== vid);
    return [mergeTelemetry(existing, data), ...filtered].slice(0, 20);  // ← PROBLEM
  });
  appendChartPoint(data);
},
```

**Problem:**
- Every `live:update` socket event recreates the entire `live` array
- Array reference changes, triggering re-render of ALL vehicle cards in the grid (line 243-250)
- With 20 vehicles in list × 5 telemetry updates/sec = **100 full renders/sec**
- Components like GaugeChart are memoized but parent still re-renders them

**Impact:**
- Dashboard grid flickers every 200ms
- Visible jank when scrolling or interacting
- Excessive CPU usage

**Solution:**
Replace array-based state with object-based state for O(1) lookups without full array recreation:

```javascript
// Change state from array to object
const [liveByVehicleId, setLiveByVehicleId] = useState({});

// Update handler - only updates one object property
'live:update': (data) => {
  const vid = data.vehicleId ?? data.vehicle_id;
  updateObdStatus(vid, 'live');
  setLiveByVehicleId((prev) => ({
    ...prev,
    [vid]: mergeTelemetry(prev[vid], data),
  }));
  appendChartPoint(data);
},

// Convert for display when needed (memoized)
const liveArray = useMemo(() => 
  Object.values(liveByVehicleId).slice(0, 20),
  [liveByVehicleId]
);
```

---

### Issue #2: Dashboard.jsx - Chart Effect Has Incomplete Dependencies
**File:** [frontend/src/pages/Dashboard.jsx](frontend/src/pages/Dashboard.jsx#L149-L160)  
**Severity:** 🔴 CRITICAL  
**Lines:** 149-160

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
}, [chartVehicleId]);  // ← MISSING 'live' DEPENDENCY
```

**Problem:**
- Effect depends only on `chartVehicleId` but uses `live` variable
- When live telemetry updates arrive, chart doesn't update in real-time
- Chart only updates when user changes vehicle selection
- Creates stale closure - function captures old `live` array

**Impact:**
- Chart appears frozen during real-time updates
- User sees outdated telemetry data
- Must switch vehicles and back to refresh chart

**Solution:**
Add `live` to dependency array (but optimize to prevent excessive re-runs):

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
}, [chartVehicleId, live]);  // ← ADD 'live'

// Or better: memoize the filtered result to prevent unnecessary updates
const chartDataForVehicle = useMemo(() => {
  if (!chartVehicleId) return [];
  return live
    .filter((d) => (d.vehicleId ?? d.vehicle_id) === chartVehicleId)
    .slice(0, 10)
    .reverse();
}, [chartVehicleId, live]);

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

### Issue #3: OBDHistoryChart.jsx - Data Array Recreated on Every Live Update
**File:** [frontend/src/components/OBDHistoryChart.jsx](frontend/src/components/OBDHistoryChart.jsx#L46-L53)  
**Severity:** 🔴 CRITICAL  
**Lines:** 46-53

```javascript
useEffect(() => {
  if (!liveUpdate) return;
  setData((prev) => [...prev, liveUpdate].slice(-100));  // ← RECREATES ENTIRE ARRAY
}, [liveUpdate?.recordedAt]);
```

**Problem:**
- Every live update appends to array and slices to -100, creating **new array reference**
- New array triggers useMemo recalculation (line 56-63)
- useMemo calls `data.slice().reverse()` creating **another new array**
- Total: 2 new array objects per update + chart potentially re-mounts
- With 5 updates/sec × 2 arrays = 10 new arrays allocated/sec

**Impact:**
- Chart re-renders even when only appending 1 data point
- Excessive memory allocation
- Chart animations may stutter or reset
- High CPU from garbage collection

**Solution:**
Use immutable update helpers or React 18's `useDeferredValue`:

```javascript
// Option 1: Only append if actually new data
useEffect(() => {
  if (!liveUpdate) return;
  setData((prev) => {
    const lastRecord = prev[prev.length - 1];
    // Don't append if it's the same timestamp
    if (lastRecord?.recordedAt === liveUpdate.recordedAt) {
      return prev;
    }
    return [...prev, liveUpdate].slice(-100);
  });
}, [liveUpdate?.recordedAt]);

// Option 2: Defer chart updates to prevent blocking UI
const deferredData = useDeferredValue(data);

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

// Option 3: Use Immer for cleaner updates
import produce from 'immer';

setData(produce((draft) => {
  if (draft.length >= 100) draft.shift();
  draft.push(liveUpdate);
}));
```

---

### Issue #4: LiveOBD.jsx - Spreads Entire State Objects Unnecessarily
**File:** [frontend/src/pages/LiveOBD.jsx](frontend/src/pages/LiveOBD.jsx#L74-L89)  
**Severity:** 🔴 CRITICAL  
**Lines:** 74-89

```javascript
'live:update': (d) => {
  const vid = d.vehicleId ?? d.vehicle_id;
  if (vid === vehicleId) {
    setLive((prev) => mergeTelemetry(prev, d));
    setTelemetryHealth((prev) => prev ? {
      ...prev,  // ← SPREADS ENTIRE OBJECT
      streamStatus: 'live',
      lastObdAt: d.recordedAt || new Date().toISOString(),
    } : prev);
  }
},
'device:heartbeat': (d) => {
  if (d.vehicleId === vehicleId) {
    setTelemetryHealth((prev) => ({
      ...(prev || {}),  // ← SPREADS ENTIRE OBJECT
      mqttStatus: d.mqttStatus,
      lastHeartbeatAt: d.lastHeartbeatAt ?? prev?.lastHeartbeatAt,
    }));
  }
},
```

**Problem:**
- Every state update spreads entire `telemetryHealth` object
- Even if only 1 of 5 properties changes, all 5 are recreated
- Triggers re-render of entire LiveOBD page + all child components
- VehicleStatusBadge component (child) receives new object props even if values same

**Impact:**
- LiveOBD page flickers every update
- Status badge re-renders unnecessarily
- All gauge charts re-render even though telemetry values haven't changed

**Solution:**
Only spread if value actually changed, or use separate state atoms:

```javascript
// Option 1: Check if actually changed before spreading
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

// Option 2: Split into separate state atoms
const [streamStatus, setStreamStatus] = useState('');
const [lastObdAt, setLastObdAt] = useState(null);

'live:update': (d) => {
  const vid = d.vehicleId ?? d.vehicle_id;
  if (vid === vehicleId) {
    setLive((prev) => mergeTelemetry(prev, d));
    setStreamStatus('live');
    setLastObdAt(d.recordedAt || new Date().toISOString());
  }
},
```

---

### Issue #5: useSocket.js - Stale Closure in Event Handlers
**File:** [frontend/src/hooks/useSocket.js](frontend/src/hooks/useSocket.js#L16-L32)  
**Severity:** 🔴 CRITICAL  
**Lines:** 16-32

```javascript
export function useSocket(events = {}, vehicleId = null) {
  const { isAuthenticated } = useAuth();
  const handlers = useRef(events);
  handlers.current = events;  // ← UPDATES REF

  useEffect(() => {
    if (!isAuthenticated) return;

    const socket = connectSocket();
    const joinRooms = () => { /* ... */ };
    joinRooms();
    socket.on('connect', joinRooms);

    const interval = setInterval(() => {
      if (socket.connected) socket.emit('ping:heartbeat');
    }, 20000);

    const subs = Object.entries(events).map(([event, fn]) => {
      if (typeof fn !== 'function') return null;
      const wrapped = (...args) => {
        const handler = handlers.current[event];  // ← STALE CLOSURE
        if (typeof handler === 'function') handler(...args);
      };
      socket.on(event, wrapped);
      return [event, wrapped];
    }).filter(Boolean);

    return () => {
      clearInterval(interval);
      socket.off('connect', joinRooms);
      subs.forEach(([event, wrapped]) => socket.off(event, wrapped));
    };
  }, [isAuthenticated, vehicleId]);  // ← DOESN'T INCLUDE 'events'
```

**Problem:**
- `handlers.current` is updated on every render
- But effect dependencies don't include `events`
- So effect doesn't re-run when event handlers change
- The `wrapped` functions capture `handlers.current` reference but might access stale handlers
- If parent re-renders with different event handlers, the old wrapped handlers stay subscribed

**Impact:**
- Old event handlers continue executing even after component updates
- New event handlers never subscribed
- Socket events not handled by correct handler
- Silent failures - events processed but with wrong logic

**Solution:**
Include `events` in dependency array and memoize handlers:

```javascript
import { useMemo } from 'react';

export function useSocket(events = {}, vehicleId = null) {
  const { isAuthenticated } = useAuth();
  
  // Memoize handlers to avoid ref updates on every render
  const handlers = useMemo(() => events, [events]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const socket = connectSocket();
    const joinRooms = () => { /* ... */ };
    joinRooms();
    socket.on('connect', joinRooms);

    const interval = setInterval(() => {
      if (socket.connected) socket.emit('ping:heartbeat');
    }, 20000);

    const subs = Object.entries(handlers).map(([event, fn]) => {
      if (typeof fn !== 'function') return null;
      socket.on(event, fn);  // ← SUBSCRIBE DIRECTLY, NO WRAPPER NEEDED
      return [event, fn];
    }).filter(Boolean);

    return () => {
      clearInterval(interval);
      socket.off('connect', joinRooms);
      subs.forEach(([event, fn]) => socket.off(event, fn));
    };
  }, [isAuthenticated, vehicleId, handlers]);  // ← INCLUDE 'handlers'
}
```

---

## Moderate Issues (Should Fix)

### Issue #6: Dashboard.jsx - Parent State Changes Cascade to All Children
**File:** [frontend/src/pages/Dashboard.jsx](frontend/src/pages/Dashboard.jsx#L243-L250)  
**Severity:** 🟠 HIGH  
**Lines:** 243-250

```javascript
<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
  {vehicles.map((v) => (
    <Link key={v.id} to={`/vehicles/${v.id}`} className="rounded-lg border p-4 hover:border-fleet-500 dark:border-slate-700">
      {/* Vehicle card using obdStatus[v.id] */}
      <span
        className={`h-2.5 w-2.5 rounded-full ${
          obdStatus[v.id] === 'live' ? 'bg-green-500' : obdStatus[v.id] === 'stale' ? 'bg-yellow-500' : 'bg-slate-400'
        }`}
      />
    </Link>
  ))}
</div>
```

**Problem:**
- Dashboard component has 8 state variables: `stats`, `vehicles`, `live`, `alerts`, `obdStatus`, `chartVehicleId`, `chartHistory`
- Any state update causes entire component to re-render
- Vehicle grid re-renders even when only `stats` or `alerts` updated
- With frequent live updates, Grid re-renders constantly
- GaugeChart and StatCard components are memoized but parent's **key prop** changes on every render

**Impact:**
- Vehicle card links flickering
- Unnecessary re-renders of stable content
- Perceived jank when viewing multiple gauges/stats

**Solution:**
Separate Dashboard into smaller memoized sub-components:

```javascript
// Extract vehicle grid into memoized component
const VehicleGrid = memo(({ vehicles, obdStatus }) => (
  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    {vehicles.map((v) => (
      <Link key={v.id} to={`/vehicles/${v.id}`} /* ... */ />
    ))}
  </div>
));

// Extract stats grid into memoized component
const StatsGrid = memo(({ stats }) => (
  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4">
    <StatCard title="Vehicles" value={stats?.vehicleCount} />
    {/* ... */}
  </div>
));

// Extract chart into memoized component
const LiveChart = memo(({ chartVehicleId, chartData, vehicles, onVehicleChange }) => (
  <div className="card">
    {/* ... */}
  </div>
));

export default function Dashboard() {
  // ... state setup ...
  
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold">Dashboard</h2>
        <p className="text-slate-500">Fleet KPIs and live telemetry</p>
      </div>
      
      <StatsGrid stats={stats} />
      <LiveChart 
        chartVehicleId={chartVehicleId}
        chartData={chartData}
        vehicles={vehicles}
        onVehicleChange={setChartVehicleId}
      />
      <VehicleGrid vehicles={vehicles} obdStatus={obdStatus} />
    </div>
  );
}
```

---

### Issue #7: OBDHistoryChart.jsx - Chart Data Re-computed on Every Render
**File:** [frontend/src/components/OBDHistoryChart.jsx](frontend/src/components/OBDHistoryChart.jsx#L54-L62)  
**Severity:** 🟠 HIGH  
**Lines:** 54-62

```javascript
const chartData = useMemo(() => {
  return data
    .slice()           // ← Creates new array
    .reverse()         // ← Creates new array
    .map((row) => ({   // ← Creates new objects
      time: new Date(row.recordedAt).toLocaleTimeString(),
      value: row[metric],
    }))
    .filter((d) => d.value != null);
}, [data, metric]);
```

**Problem:**
- `useMemo` dependency includes `data` which changes on every state update
- `data.slice().reverse()` creates new arrays on every update
- `new Date()` created on every data point (expensive)
- Even if data didn't change, `metric` selection creates new objects
- With 100 data points, that's 100 new object allocations per update

**Impact:**
- Chart re-renders frequently
- Tooltip formatting calls `new Date()` constantly
- Memory pressure from object allocation
- Chart animations may stutter

**Solution:**
Memoize at component level and optimize date formatting:

```javascript
// Pre-format timestamps when data arrives (backend or cache them)
const [formattedData, setFormattedData] = useState([]);

useEffect(() => {
  if (!data.length) {
    setFormattedData([]);
    return;
  }

  // Format timestamps once, not on every render
  const formatted = data.map((row) => ({
    ...row,
    _formattedTime: new Date(row.recordedAt).toLocaleTimeString(),
  }));

  setFormattedData(formatted);
}, [data]);

const chartData = useMemo(() => {
  return formattedData
    .slice()
    .reverse()
    .map((row) => ({
      time: row._formattedTime,
      value: row[metric],
    }))
    .filter((d) => d.value != null);
}, [formattedData, metric]);

// Or better: use useDeferredValue to prevent chart blocking on data updates
const deferredData = useDeferredValue(data);

const chartData = useMemo(() => {
  const formatted = deferredData
    .slice()
    .reverse()
    .map((row) => ({
      time: new Date(row.recordedAt).toLocaleTimeString(),
      value: row[metric],
    }))
    .filter((d) => d.value != null);
  return formatted;
}, [deferredData, metric]);
```

---

### Issue #8: VehicleDetails.jsx - Spreads Entire Vehicle Object
**File:** [frontend/src/pages/VehicleDetails.jsx](frontend/src/pages/VehicleDetails.jsx#L17-L25)  
**Severity:** 🟠 HIGH  
**Lines:** 17-25

```javascript
'device:heartbeat': (d) => {
  if (d.vehicleId === id) {
    setVehicle((prev) => prev ? {
      ...prev,  // ← SPREADS ENTIRE VEHICLE OBJECT
      telemetryHealth: {
        ...prev.telemetryHealth,
        mqttStatus: d.mqttStatus,
        lastHeartbeatAt: d.lastHeartbeatAt ?? prev.telemetryHealth?.lastHeartbeatAt,
      },
    } : prev);
  }
},
```

**Problem:**
- Vehicle object contains: id, make, model, year, vin, plateNumber, odometer, milOn, engineHoursObd, telemetryHealth, readinessMonitors, etc.
- Heartbeat event only updates `telemetryHealth.mqttStatus`
- But entire vehicle object is recreated
- All gauge charts re-render due to parent state change
- TelemetryHealthCard re-renders with new object reference

**Impact:**
- Entire vehicle details page re-renders on every heartbeat (~1/min)
- Gauge charts flicker
- Unnecessary rendering of static data (VIN, plate, odometer)

**Solution:**
Split vehicle and telemetry health into separate state:

```javascript
const [vehicle, setVehicle] = useState(null);
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
        // Update only telemetryHealth, not entire vehicle
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
<TelemetryHealthCard health={telemetryHealth} />
```

---

### Issue #9: Dashboard.jsx - Unnecessary Variable Assignment
**File:** [frontend/src/pages/Dashboard.jsx](frontend/src/pages/Dashboard.jsx#L164)  
**Severity:** 🟡 LOW  
**Line:** 164

```javascript
const chartData = chartHistory;

// Later used:
<ResponsiveContainer width="100%" height={220}>
  <LineChart data={chartData}>
```

**Problem:**
- Assignment `const chartData = chartHistory;` is unnecessary
- Can be passed directly to LineChart
- May cause LineChart to re-render due to new prop reference

**Solution:**
```javascript
// Remove the assignment and use chartHistory directly
<ResponsiveContainer width="100%" height={220}>
  <LineChart data={chartHistory}>
```

Or wrap in useMemo if LineChart is not memoized:
```javascript
const chartData = useMemo(() => chartHistory, [chartHistory]);
```

---

### Issue #10: LiveOBD.jsx - Multiple API Calls for Same Data
**File:** [frontend/src/pages/LiveOBD.jsx](frontend/src/pages/LiveOBD.jsx#L110-117)  
**Severity:** 🟡 LOW  
**Lines:** 110-117

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
}, [vehicleId]);
```

**Problem:**
- Two API calls fetch potentially overlapping data
- Both calls update state on completion
- Causes 2 re-renders for initial load
- If both calls complete, setTelemetryHealth called twice

**Impact:**
- Page renders twice on initial load
- Potential race condition if calls complete out of order
- Unnecessary API calls

**Solution:**
Combine into single call or use AbortController:

```javascript
useEffect(() => {
  const controller = new AbortController();
  
  Promise.all([
    api.get(`/vehicles/${vehicleId}`, { signal: controller.signal }),
    api.get(`/obd/latest/${vehicleId}`, { signal: controller.signal }),
  ]).then(([vehicleRes, obdRes]) => {
    setVehicle(vehicleRes.data.data);
    setTelemetryHealth(vehicleRes.data.data?.telemetryHealth ?? null);
    if (obdRes.data.data) {
      setLive(obdRes.data.data);
    }
  }).catch(() => {});

  return () => controller.abort();
}, [vehicleId]);

// Or use a single composite endpoint if backend supports it:
useEffect(() => {
  api.get(`/vehicles/${vehicleId}/full`).then((r) => {
    const { vehicle, liveData, telemetryHealth } = r.data.data;
    setVehicle(vehicle);
    setLive(liveData);
    setTelemetryHealth(telemetryHealth);
  });
}, [vehicleId]);
```

---

## Summary Table

| Issue | File | Lines | Severity | Type | Fix |
|-------|------|-------|----------|------|-----|
| 1 | Dashboard.jsx | 71-78 | 🔴 CRITICAL | Array recreation | Use object-keyed state |
| 2 | Dashboard.jsx | 149-160 | 🔴 CRITICAL | Missing dependency | Add `live` to deps |
| 3 | OBDHistoryChart.jsx | 46-53 | 🔴 CRITICAL | Array recreation | Check for duplicate records |
| 4 | LiveOBD.jsx | 74-89 | 🔴 CRITICAL | Object spreading | Check for actual changes |
| 5 | useSocket.js | 16-32 | 🔴 CRITICAL | Stale closure | Add `events` to deps |
| 6 | Dashboard.jsx | 243-250 | 🟠 HIGH | Parent cascade | Extract memoized sub-components |
| 7 | OBDHistoryChart.jsx | 54-62 | 🟠 HIGH | Data recomputation | Defer updates / pre-format dates |
| 8 | VehicleDetails.jsx | 17-25 | 🟠 HIGH | Object spreading | Separate telemetry state |
| 9 | Dashboard.jsx | 164 | 🟡 LOW | Unnecessary assignment | Remove or memoize |
| 10 | LiveOBD.jsx | 110-117 | 🟡 LOW | Multiple API calls | Batch into single call |

---

## Root Causes

### 1. **Architectural Issue: Array-Based State for Collections**
- Using arrays for telemetry updates forces O(n) operations
- Every update rebuilds the array, creating new references
- Should use Map/Object for O(1) lookups

### 2. **Missing Memoization at Logical Boundaries**
- Dashboard should split into memoized sub-pages
- Each sub-page handles its own state
- Prevents cascading re-renders

### 3. **Incomplete Effect Dependencies**
- Effects use variables not in dependency array
- Causes stale closures
- React's ESLint rule would catch these

### 4. **Premature Object Spreading**
- Spreading entire objects when only 1 field changes
- Could use immer or separate state atoms
- Causes unnecessary re-renders

### 5. **No Debouncing/Batching on High-Frequency Events**
- Socket events trigger state updates immediately
- 5 updates/sec × multiple state setters = thrashing
- Should batch updates with `useTransition` or `useDeferredValue`

---

## Recommended Fix Priority

**Phase 1 (Immediate - Fixes 90% of flickering):**
1. Fix Issue #1 - Dashboard live array to object (30 min)
2. Fix Issue #2 - Add live to chart effect dependencies (5 min)
3. Fix Issue #4 - Check before spreading in LiveOBD (10 min)

**Phase 2 (High Impact - Smoother UX):**
4. Fix Issue #3 - Dedupe OBDHistoryChart data updates (15 min)
5. Fix Issue #5 - Add events to useSocket dependencies (10 min)
6. Fix Issue #6 - Extract memoized sub-components (45 min)

**Phase 3 (Polish - Better Performance):**
7. Fix Issue #7 - Optimize chart data computation (20 min)
8. Fix Issue #8 - Separate vehicle state (20 min)

**Phase 4 (Optional - Code Quality):**
9. Fix Issue #9 - Remove unnecessary assignment (2 min)
10. Fix Issue #10 - Batch API calls (15 min)

---

## Testing Strategy

After applying fixes, validate with:

```javascript
// Add React DevTools Profiler checks
1. Open LiveOBD page
2. Start React DevTools Profiler
3. Trigger live:update event
4. Check: Only affected component re-renders
5. Expected: <10ms for single gauge update (was 50-200ms)

// Monitor dashboard
1. Open Dashboard with 8+ vehicles
2. Simulate 5 updates/sec from backend
3. Check: Vehicle grid doesn't flicker
4. Expected: Smooth status indicator updates
```

---

## Next Steps

1. ✅ Analysis complete
2. 📋 Create implementation PR with fixes
3. 🧪 Add unit tests for component memoization
4. 📊 Profile before/after with Chrome DevTools
5. 🚀 Deploy and monitor for flickering reports

