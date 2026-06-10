# FleetNimble Frontend Flickering - Visual Problem Guide

## Problem Flow: How Flickering Happens

```
SOCKET EVENT: live:update
    ↓
Dashboard.jsx socket handler
    ↓
setLive([newMergedVehicle, ...filtered].slice(0,20))  ← Array recreated
    ↓
ENTIRE 'live' REFERENCE CHANGES
    ↓
Dashboard component re-renders (all state changes trigger full component render)
    ↓
├─ StatCard components (MEMOIZED - should not re-render)
│  └─ But receive new props due to parent render
│
├─ Vehicle grid (NOT MEMOIZED)
│  └─ All 8 vehicle cards re-render
│     └─ Links get new keys
│     └─ Visual flicker on screen
│
├─ Chart (LineChart from Recharts)
│  └─ Receives chartHistory prop (reference changed)
│  └─ Chart may remount or re-draw
│     └─ Animation glitch
│
└─ Alert list (NOT MEMOIZED)
   └─ Re-renders even if alerts didn't change


EVERY UPDATE:  5 updates/sec × 200ms = Visible flickering
```

---

## Problem 1: Array-Based State Management

### Before (BROKEN)
```
Update 1: [Vehicle A, Vehicle B, Vehicle C]  ← Reference: 0x1000
              ↓ setLive
Update 2: [Vehicle A', Vehicle B, Vehicle C] ← Reference: 0x2000 (DIFFERENT!)
              ↓ React sees new reference
Update 3: [Vehicle A', Vehicle B', Vehicle C] ← Reference: 0x3000 (DIFFERENT!)
              ↓ All children re-render
Update 4: [Vehicle A', Vehicle B', Vehicle C'] ← Reference: 0x4000
```

→ **Result:** 5 updates/sec = 5 new array references/sec = constant re-renders

### After (FIXED)
```
Update 1: {A: vehicleA, B: vehicleB, C: vehicleC}  ← Reference: 0x1000
               ↓ setLiveByVehicleId
Update 2: {A: vehicleA', B: vehicleB, C: vehicleC} ← Reference: 0x2000 (new)
              Only A value changed, can skip children for B & C
               ↓
Update 3: {A: vehicleA', B: vehicleB', C: vehicleC} ← Reference: 0x3000
              Only B value changed, can skip children for A & C
               ↓
Update 4: {A: vehicleA', B: vehicleB', C: vehicleC'} ← Reference: 0x4000
```

→ **Result:** Each update only changes 1 vehicle, others stable

---

## Problem 2: Missing Chart Dependencies

### Before (BROKEN)
```
Socket Event: live:update for Vehicle A
    ↓
Dashboard updates live array
    ↓
useEffect([chartVehicleId]) - NO! Doesn't depend on live
    ↓
Chart shows OLD data from 1 second ago
    ↓
User changes vehicle selection
    ↓
useEffect runs (because chartVehicleId changed)
    ↓
Chart suddenly updates with new vehicle's data
    ↓
Visual: Chart appears frozen, then suddenly jumps


Timeline:
T=0s   Update: RPM 2000 → live array contains this
T=0.5s Update: RPM 2500 → live array contains this
T=1s   Update: RPM 3000 → live array contains this
       Chart STILL shows RPM 2000 (stale closure)
T=2s   User changes vehicle selection
       useEffect runs → chart suddenly shows RPM 3000
       Visual: Big jump, not smooth update
```

### After (FIXED)
```
Socket Event: live:update for Vehicle A
    ↓
Dashboard updates live array
    ↓
useEffect([chartVehicleId, liveArray]) - includes liveArray!
    ↓
Chart recalculates with new data
    ↓
LineChart gets new data prop
    ↓
Chart smoothly updates to latest

Timeline:
T=0s   Update: RPM 2000 → chart shows 2000
T=0.5s Update: RPM 2500 → chart shows 2500
T=1s   Update: RPM 3000 → chart shows 3000
T=1.5s Update: RPM 3200 → chart shows 3200
       Visual: Smooth real-time updates
```

---

## Problem 3: Array Recreation on Every Data Point

### Before (BROKEN)
```
Initial: data = [pt1, pt2, ..., pt98, pt99]

Live Update: pt100 arrives
    ↓
setData((prev) => [...prev, pt100].slice(-100))
    ↓
NEW ARRAY: [pt2, pt3, ..., pt99, pt100] ← Different reference!
    ↓
useMemo recalculates because data changed
    ↓
data.slice() → new array
data.reverse() → new array  
data.map() → 100 new objects
    ↓
Total: 102 new objects created per update
    ↓
5 updates/sec = 510 objects/sec = GC thrashing


What happens in chart:
1. New data array → React re-renders LineChart
2. useMemo recalculates all 100 points
3. Objects recreated with new Date() formatting
4. Chart library sees "new data" → potentially re-mounts or redraws all points
5. Animation stutters or resets
```

### After (FIXED)
```
Initial: data = [pt1, pt2, ..., pt98, pt99]

Live Update: pt100 arrives
    ↓
Check: last recorded point is pt99
Update: pt100 timestamp is different
    ↓
Only append if new: [pt2, pt3, ..., pt99, pt100]
If duplicate: return prev (same reference!)
    ↓
useMemo: If data ref didn't change, don't recalculate
    ↓
Chart: No new props, no re-render


Optimization:
- Use useDeferredValue to decouple state update from chart render
- Pre-format timestamps once, not per render
- Only add data if truly new (check recorded_at)
```

---

## Problem 4: Spreading Entire Objects

### Before (BROKEN)
```
telemetryHealth = {
  streamStatus: 'live',
  lastObdAt: '2026-06-08T10:30:00Z',
  mqttStatus: 'connected',
  lastHeartbeatAt: '2026-06-08T10:30:01Z',
  sigStrength: -45,
}

Live Update event: Only streamStatus should change to 'live' (but already is)
    ↓
setTelemetryHealth((prev) => ({
  ...prev,  ← Spreads all 5 properties
  streamStatus: 'live',  ← Same value (no actual change)
  lastObdAt: newTime,    ← Maybe changed
}))
    ↓
NEW OBJECT created:
{
  streamStatus: 'live',        ← Copy
  lastObdAt: newTime,          ← Copy (updated)
  mqttStatus: 'connected',     ← Copy (no change)
  lastHeartbeatAt: 'T10:30:01Z', ← Copy (no change)
  sigStrength: -45,            ← Copy (no change)
}
    ↓
React sees: NEW OBJECT reference
    ↓
LiveOBD page re-renders
    ↓
VehicleStatusBadge (child) gets new health prop
    ↓
Badge re-renders (even if values same)
    ↓
All GaugeChart children re-render
```

### After (FIXED)
```
Live Update event: Only streamStatus and lastObdAt might change
    ↓
setTelemetryHealth((prev) => {
  // CHECK: Did anything actually change?
  if (prev.streamStatus === newStatus && prev.lastObdAt === newLastObdAt) {
    return prev;  ← SAME REFERENCE! No spread needed
  }
  // Only spread if something changed
  return { ...prev, streamStatus, lastObdAt };
})
    ↓
Result: If nothing changed, prev is returned as-is
    ↓
React sees: SAME OBJECT reference
    ↓
Parent doesn't re-render (due to prop comparison)
    ↓
Child components don't re-render
    ↓
No visual flicker from this update
```

---

## Problem 5: Stale Closures in useSocket

### Before (BROKEN)
```
Render 1: Parent passes { 'live:update': handlerV1 }
    ↓
useSocket called
    ↓
handlers.current = { 'live:update': handlerV1 }
    ↓
Effect runs: socket.on('live:update', wrapped)
    ↓
wrapped = (...args) => {
  handlers.current['live:update'](...args)  ← Captures handlers.current ref
}
    ↓
Socket subscribed to wrapped

---

Parent re-renders: { 'live:update': handlerV2 }  (Different function!)
    ↓
handlers.current = { 'live:update': handlerV2 }
    ↓
But... effect dependency doesn't include 'events'!
    ↓
Effect doesn't run again
    ↓
Old 'wrapped' function still subscribed
    ↓
Socket event arrives...
    ↓
wrapped() calls handlers.current['live:update']
    ↓
Calls handlerV2! (Oh wait, handlers.current updated before event)
    ↓
But IF handlers.current was cleared in between:
    handlers.current['live:update'] = undefined
    ↓
Event handler doesn't run at all!
    ↓
SILENT FAILURE - socket events ignored


Timeline of disaster:
T=0s   Component mounts with handler
       socket.on('live:update', wrapped1)
T=5s   Parent re-renders with new handler
       handlers.current = newHandler
       Old wrapped1 still listening
T=5.1s Socket event arrives
       wrapped1 calls handlers.current['live:update']
       Might call old or new handler depending on timing
       UNCERTAIN behavior!
```

### After (FIXED)
```
Render 1: Parent passes { 'live:update': handlerV1 }
    ↓
memoizedEvents = useMemo(() => events, [events])
    ↓
Effect runs: socket.on('live:update', handlerV1) ← Direct subscription
    ↓
Socket subscribed directly (no wrapper)

---

Parent re-renders: { 'live:update': handlerV2 }  (Different!)
    ↓
memoizedEvents changed (due to useMemo dependency)
    ↓
Effect dependencies include memoizedEvents
    ↓
Effect cleanup runs:
    socket.off('live:update', handlerV1)
    ↓
Effect runs again:
    socket.on('live:update', handlerV2) ← New handler
    ↓
Socket now subscribed to correct handler

---

Socket event arrives:
    ↓
handlerV2(...args) called
    ↓
GUARANTEED correct handler
    ↓
No stale closure, no uncertainty


Timeline of correctness:
T=0s   Component mounts with handler
       socket.on('live:update', handlerV1)
       (Only reference to handlerV1 is active subscription)
T=5s   Parent re-renders with new handler
       Effect cleanup: socket.off('live:update', handlerV1)
       Effect runs: socket.on('live:update', handlerV2)
T=5.1s Socket event arrives
       handlerV2 called
       CORRECT! Guaranteed.
```

---

## Problem 6: Parent State Cascade

### Before (BROKEN)
```
Dashboard component has 8 state variables
  - stats (API stats)
  - vehicles (list of vehicles)
  - live (telemetry updates - very frequent!)
  - alerts (alert notifications)
  - obdStatus (status of each vehicle)
  - chartVehicleId (selected vehicle)
  - chartHistory (chart data)
  - [other]

When ANY state updates:
    ↓
Entire Dashboard function re-runs
    ↓
└─ Dashboard render() ← Entire JSX evaluated
    ├─ StatsGrid (memoized - good!)
    │  └─ Receives new props from parent
    │  └─ Same props values? No - parent render created new inline objects
    │  └─ Re-renders anyway
    │
    ├─ VehicleGrid (NOT memoized - bad!)
    │  └─ Entire grid re-renders
    │  └─ Each vehicle Link gets new key/props
    │  └─ Visual: Links flicker
    │
    ├─ Chart (NOT memoized - bad!)
    │  └─ LineChart re-renders
    │  └─ LineChart library recalculates
    │  └─ Visual: Chart jitters


Example flow with 'live' updates:
T=0ms    live:update socket event
    ↓
setLive([newVehicle, ...])  ← live state changes
    ↓
Dashboard re-renders
    ├─ stats? No change, but parent re-rendered
    ├─ vehicles? No change, but parent re-rendered
    ├─ alerts? No change, but parent re-rendered
    └─ Everything re-evaluates
    ↓
5 updates/sec = Dashboard function called 5 times/sec
    ↓
Even though only live data changed
    ↓
Visual result: Entire page jitters every 200ms
```

### After (FIXED)
```
Dashboard split into memoized components:

Dashboard
  ├─ StatsGrid (memo)
  │  └─ Depends only on: stats
  │     If stats unchanged → NOT re-rendered
  │
  ├─ ChartSection (memo)
  │  └─ Depends only on: chartVehicleId, chartHistory
  │     live updates don't directly affect this
  │
  ├─ AlertSection (memo)
  │  └─ Depends only on: alerts
  │     live updates don't trigger re-render
  │
  └─ VehicleGrid (memo)
     └─ Depends only on: vehicles, obdStatus
        Only re-renders when these specific props change


With live:update event:
    ↓
setLive in parent → parent Dashboard re-renders
    ↓
But... parent only passes:
    ├─ <StatsGrid stats={stats} />           ← stats unchanged
    ├─ <ChartSection ... />                   ← ...unchanged
    ├─ <AlertSection alerts={alerts} />       ← alerts unchanged
    └─ <VehicleGrid vehicles={vehicles} obdStatus={obdStatus} />
                     ↑ might change if live includes new vehicle

React's memo optimization:
    ├─ StatsGrid: props unchanged → NOT re-rendered ✓
    ├─ ChartSection: props unchanged → NOT re-rendered ✓
    ├─ AlertSection: props unchanged → NOT re-rendered ✓
    └─ VehicleGrid: IF vehicles/obdStatus unchanged → NOT re-rendered ✓

Result:
    Even though live state changed and parent re-rendered
    Child components can skip their render pass


Performance improvement:
    Before: 5 re-renders/sec of entire dashboard
    After: 0 re-renders if live doesn't affect public props


Visual result: No flickering
```

---

## Problem 7: Chart Data Recalculation

### Before (BROKEN)
```
Data arrives: { recordedAt: 'T1', rpm: 2000, speed: 50 }

setData((prev) => [...prev, newPoint].slice(-100))
    ↓
data state updates → triggers useMemo
    ↓
useMemo([data, metric]) runs:
    ↓
    data.slice() → NEW ARRAY [pt1, pt2, ..., pt100]
    .reverse() → NEW ARRAY [pt100, ..., pt2, pt1]
    .map((row) => ({
        time: new Date(row.recordedAt).toLocaleTimeString(),  ← Expensive!
        value: row[metric],
    }))
    .filter() → NEW ARRAY [filtered points]
    ↓
Total: 3 new arrays + 100 new objects + 100 new Date objects


Performance impact:
- 1 update = 3 array allocations + 100 object allocations
- 5 updates/sec = 15 arrays + 500 objects/sec
- V8 GC has to collect these
- CPU usage: High
- Memory pressure: Medium
- Chart re-render: Yes, all 100 points potentially


Visual result:
- Chart jitters as re-calculations happen
- Might see "stuttering" animation
- CPU fan spins up
```

### After (FIXED)
```
Option A: Pre-format once

Initial data load:
    ↓
useEffect([data]) runs:
    ↓
data.map((row) => ({
    ...row,
    _time: new Date(row.recordedAt).toLocaleTimeString(),  ← Format once
}))
    ↓
Store as formattedData

New point arrives:
    ↓
formattedData.push(newPoint with _time pre-calculated)
    ↓
useMemo([formattedData, metric]) runs:
    ↓
formattedData.slice().reverse().map(row => ({
    time: row._time,  ← Already formatted!
    value: row[metric],
}))
    ↓
Only re-calculate what changed: the new point
    ↓
Total: 1 array allocation + 1 new object


Performance impact:
- 1 update = 1 array allocation + 1 object allocation
- 5 updates/sec = 5 arrays + 5 objects/sec
- V8 GC has minimal work
- CPU usage: Low
- Memory pressure: Minimal
- Chart re-render: Only new point added


---

Option B: useDeferredValue

setData updates immediately (undeferred)
    ↓
Chart uses useDeferredValue(data)
    ↓
React treats chart update as "lower priority"
    ↓
If user is typing or scrolling, chart update waits
    ↓
Once user interaction stops, chart updates
    ↓
Doesn't block UI, doesn't cause jank


Visual result:
- Smooth animations (for users interacting)
- Data updates when system is idle
- No perceived stuttering
```

---

## Summary: The Full Flickering Loop

```
┌─────────────────────────────────────────────────────────────────┐
│ SOCKET EVENT: live:update (Vehicle A telemetry)                  │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
    ┌─────────────────────────────────────────┐
    │ Dashboard.jsx socket handler            │
    │ setLive((prev) => [...prev, data]...)   │  ◄─ ISSUE #1
    │                    ^---- NEW ARRAY REF  │
    └────────────┬────────────────────────────┘
                 │
                 ▼
    ┌─────────────────────────────────────────┐
    │ Dashboard component re-renders         │
    │ (live state changed)                    │
    └────────────┬────────────────────────────┘
                 │
         ┌───────┼───────┐
         │       │       │
         ▼       ▼       ▼
    ┌────────┐ ┌──────┐ ┌──────────┐
    │ Stats  │ │Chart │ │ Vehicle  │
    │ Grid   │ │ (RE) │ │  Grid    │
    │(memo)  │ │      │ │ (NOT)    │
    └────────┘ └──┬───┘ └─────┬────┘
                  │           │
           ISSUE #2           │
              └─┐ ┌───────────┘
                ▼ ▼
    ┌──────────────────────────────┐
    │ Chart: missing 'live' dep     │
    │ Shows stale data              │  ◄─ ISSUE #2
    │ Doesn't update in real-time   │
    └──────────────────────────────┘
    
    ┌──────────────────────────────┐
    │ Vehicle Grid: All 8 cards     │  ◄─ ISSUE #6
    │ Get new Link components       │
    │ Status indicator flickers     │
    └──────────────────────────────┘

                 │
                 ▼
    ┌──────────────────────────────────────────┐
    │ OBDHistoryChart.jsx                      │
    │ setData((prev) => [...prev, live]...)    │  ◄─ ISSUE #3
    │         ^---- RECREATES ARRAY, 102 NEW  │
    │         OBJECTS ALLOCATED                │
    └────────────┬─────────────────────────────┘
                 │
                 ▼
    ┌──────────────────────────────────────────┐
    │ useMemo recalculates all 100 points      │  ◄─ ISSUE #7
    │ Creates new Date objects                 │
    │ LineChart re-renders                     │
    └────────────┬─────────────────────────────┘
                 │
                 ▼
    ┌──────────────────────────────────────────┐
    │ VISIBLE RESULT:                          │
    │ ✓ Chart jitters / stutters               │
    │ ✓ Vehicle grid flickers                  │
    │ ✓ Status indicators jump                 │
    │ ✓ Overall "jank" feel                    │
    │                                          │
    │ REPEAT: 5 times per second               │
    │ FREQUENCY: Every 200ms                   │
    └──────────────────────────────────────────┘
```

---

## Fixed Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ SOCKET EVENT: live:update (Vehicle A telemetry)                  │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
    ┌────────────────────────────────────────────┐
    │ Dashboard.jsx socket handler               │
    │ setLiveByVehicleId({ [vid]: newData })     │  ◄─ ISSUE #1 FIXED
    │                            ^---- OBJECT    │
    │                            PROPERTY UPDATE │
    └────────────┬───────────────────────────────┘
                 │
                 ▼
    ┌────────────────────────────────────────────┐
    │ Dashboard component re-renders             │
    │ (liveByVehicleId state changed)            │
    └────────────┬───────────────────────────────┘
                 │
    ┌────────────┼────────────┐
    │            │            │
    ▼            ▼            ▼
┌────────┐  ┌──────────┐  ┌──────────┐
│ Stats  │  │ Chart    │  │ Vehicle  │
│ Grid   │  │ Section  │  │  Grid    │
│(memo)  │  │ (memo)   │  │ (memo)   │
│        │  │          │  │          │
│ stats  │  │ chart    │  │ vehicles │
│ NO     │  │ NO       │  │ NO       │
│CHANGE ◄───┤ CHANGE ◄─┤ CHANGE    │
│ ✓ Skip │  │ ✓ Skip   │  │ ✓ Skip   │
└────────┘  └──────────┘  └──────────┘


If vehicle A's obdStatus changed:
    ↓
    └─ VehicleGrid re-renders
       ├─ Vehicle A card re-renders (status changed)
       ├─ Vehicle B card SKIPPED (status same, memoized)  ◄─ FIXED #6
       ├─ Vehicle C card SKIPPED (status same, memoized)
       └─ Result: Only 1 of 8 cards re-renders


OBDHistoryChart:
    │
    ▼
┌────────────────────────────────────────┐
│ useEffect([liveUpdate?.recordedAt])    │
│                                        │
│ IF recordedAt same as last: return     │  ◄─ ISSUE #3 FIXED
│ ELSE: append one new point             │    (no duplicate adds)
│                                        │
│ setData only runs if truly new data    │
└────────────┬───────────────────────────┘
             │
             ▼
┌────────────────────────────────────────┐
│ useMemo[deferredData, metric]          │  ◄─ ISSUE #7 FIXED
│                                        │
│ Only recalculates when deferred data   │
│ User interactions get priority         │
│ Uses pre-formatted dates               │
│ Only 1 new object per update           │
└────────────┬───────────────────────────┘
             │
             ▼
┌────────────────────────────────────────┐
│ VISIBLE RESULT:                        │
│ ✓ Dashboard is smooth                  │
│ ✓ Chart updates smoothly               │
│ ✓ Status updates without flicker       │
│ ✓ No jank or stuttering                │
│ ✓ Can handle 5-10 updates/sec          │
│                                        │
│ REPEAT: 5 times per second             │
│ FREQUENCY: SMOOTH, not 200ms pulse    │
└────────────────────────────────────────┘
```

---

