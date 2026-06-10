# Frontend Architecture — Next.js Fleet Command Center

Target stack for Phase 4 migration from current React + Vite SPA.

## Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| State | Zustand |
| Server state | TanStack Query |
| Charts | Recharts + Tremor |
| Maps | Mapbox GL JS (primary) / Leaflet (fallback) |
| Realtime | Socket.IO client |
| Auth | JWT in httpOnly cookie or memory + refresh |

## Folder Structure

```
frontend-next/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx              # Sidebar + top nav
│   │   ├── page.tsx                # Command center home
│   │   ├── fleet-map/page.tsx      # Live map
│   │   ├── vehicles/
│   │   │   ├── page.tsx
│   │   │   └── [id]/
│   │   │       ├── page.tsx        # Vehicle detail
│   │   │       ├── live/page.tsx   # Live OBD gauges
│   │   │       └── trips/[tripId]/page.tsx  # Playback
│   │   ├── drivers/page.tsx
│   │   ├── alerts/page.tsx
│   │   ├── maintenance/page.tsx
│   │   ├── fuel/page.tsx
│   │   ├── reports/page.tsx
│   │   ├── insights/page.tsx       # AI anomaly dashboard
│   │   └── settings/page.tsx
│   └── api/                        # Optional BFF routes
├── components/
│   ├── ui/                         # shadcn primitives
│   ├── fleet/
│   │   ├── FleetMap.tsx
│   │   ├── VehicleMarker.tsx
│   │   ├── VehicleHealthCard.tsx
│   │   ├── LiveGaugeGrid.tsx
│   │   ├── TripPlayback.tsx
│   │   ├── AlertFeed.tsx
│   │   └── KpiWidget.tsx
│   └── layout/
│       ├── Sidebar.tsx
│       ├── TopBar.tsx
│       └── TenantSwitcher.tsx
├── stores/
│   ├── authStore.ts
│   ├── fleetStore.ts               # Live vehicle positions
│   ├── alertStore.ts
│   └── themeStore.ts
├── hooks/
│   ├── useSocket.ts
│   ├── useFleetMap.ts
│   └── useTelemetry.ts
├── lib/
│   ├── api.ts
│   ├── socket.ts
│   └── utils.ts
└── types/
    ├── telemetry.ts
    ├── vehicle.ts
    └── alert.ts
```

## Key Pages

### 1. Fleet Command Center (`/`)

```
┌─────────────────────────────────────────────────────────┐
│  KPI Row: Active Vehicles | Online | Alerts | Fuel   │
├──────────────────────────┬──────────────────────────────┤
│  Fleet Map (60%)         │  Live Alert Feed (40%)       │
│  - Realtime markers      │  - Severity badges           │
│  - Cluster at zoom out   │  - Ack buttons               │
├──────────────────────────┴──────────────────────────────┤
│  Vehicle Health Grid (cards with RPM/speed/DTC status)  │
└─────────────────────────────────────────────────────────┘
```

### 2. Live Vehicle Page (`/vehicles/[id]/live`)

- Connection badge: LIVE / DELAYED / OFFLINE
- Gauge grid (RPM, speed, load, coolant, fuel, battery)
- GPS mini-map
- OBD history chart (Recharts)
- DTC panel sidebar

### 3. Trip Playback (`/vehicles/[id]/trips/[tripId]`)

- Mapbox polyline with animated marker
- Timeline scrubber (speed-colored segments)
- Event markers (harsh brake, idle, geofence)

### 4. Driver Scoring (`/drivers`)

- Leaderboard table
- Score breakdown radar chart
- Behavior event timeline

### 5. AI Insights (`/insights`)

- Anomaly cards: "Vehicle FLT-003 coolant trending +5°C/day"
- Predictive maintenance suggestions
- Fuel efficiency outliers

## Zustand Store Example

```typescript
// stores/fleetStore.ts
interface FleetState {
  vehicles: Record<string, VehicleLiveState>;
  setLiveUpdate: (vehicleId: string, data: Telemetry) => void;
  setOffline: (vehicleId: string) => void;
}
```

## Realtime Integration

```typescript
// hooks/useSocket.ts
socket.on('live:update', (data) => {
  fleetStore.getState().setLiveUpdate(data.vehicleId, data);
});
socket.on('vehicle:status', ({ vehicleId, online }) => {
  if (!online) fleetStore.getState().setOffline(vehicleId);
});
```

## Design System

| Token | Value |
|-------|-------|
| Primary | `#2563eb` (fleet blue) |
| Success/Live | `#10b981` |
| Warning | `#f59e0b` |
| Critical | `#ef4444` |
| Background dark | `#0f172a` |
| Card | `#1e293b` with subtle border |

**Reference UIs:** Enterprise telematics vendors (map-first, clean cards, data-dense tables).

## Migration Strategy

1. Run Next.js in parallel at `frontend-next/` on port 3001
2. Share API contracts with existing React app
3. Migrate page-by-page (start with fleet map + live OBD)
4. Cutover Nginx route when feature parity reached
5. Deprecate Vite SPA

## Current React App (Interim)

Existing pages in `frontend/src/pages/` remain functional during migration:
- `LiveOBD.jsx` — already has gauges + map + history
- `Dashboard.jsx` — KPI + live chart
- Upgrade styling incrementally with Tailwind before full Next.js cutover
