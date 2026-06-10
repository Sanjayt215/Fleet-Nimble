# FleetNimble — AI Handoff Package

**Date:** 2026-05-31  
**Role:** Official production dashboard (React + Vite) integrated with existing Express/Prisma/MQTT backend  
**Completion estimate:** ~78% of approved feature map (mobile extended PIDs + DB migration on 5433 pending)

---

## 1. Architecture Report

```
Android OBD App (Flutter)
    │ HTTP POST /api/obd/live-data  (legacy, preserved)
    │ MQTT publish fleet/{tenant}/{vehicle}/telemetry/obd  (optional)
    ▼
EMQX :1883 (optional — requires Docker Desktop running)
    ▼
backend/src/mqtt/consumer.js → ingestObdReading()
    ▼
PostgreSQL (obd_live_data, vehicles, dtc_codes, …)
    ▼
Express REST /api/* + Socket.IO (live:update, alert:new, dtc:new)
    ▼
frontend/src (React + Vite + Tailwind + Recharts)
```

**Preserved:** All HTTP routes, Socket.IO, Prisma schema core, auth JWT, vehicle CRUD.  
**Not in approved map (do not promote in UI):** GPS trips page, geofencing tables, UDS/ECU flashing.

---

## 2. Feature Mapping Report

| UI Component | FleetNimble Module | API / Realtime |
|--------------|-------------------|----------------|
| `Dashboard.jsx` + `StatCard` | Fleet KPIs | `GET /api/dashboard/stats` (enhanced) |
| `Dashboard` live chart | Telemetry | Socket `live:update` |
| `Vehicles.jsx` | Vehicle management | `GET/POST /api/vehicles` |
| `VehicleDetails.jsx` | Vehicle profile + health | `GET /api/vehicles/:id`, `/obd/latest/:id` |
| `LiveOBD.jsx` | Live diagnostics (deep) | Socket + `/obd/latest`, `/obd/history` |
| `Diagnostics.jsx` | Live diagnostics (fleet) | Same |
| `DtcCodes.jsx` | DTC module | `/dtc/:id`, `/dtc/history/:id`, `/dtc/clear` |
| `FuelLogs.jsx` | Fuel management | `/fuel`, `/reports/fuel/:id` |
| `Maintenance.jsx` | Maintenance | `/maintenance/:id` |
| `Drivers.jsx` | Driver scores | `/drivers/scores` |
| `Reports.jsx` | Reports + alerts | `/reports/*`, `/alerts/:id` |
| `Layout.jsx` | Shell + nav | Auth context |
| `useSocket.js` | Realtime | Socket.IO JWT |

---

## 3. API Integration Report

| Endpoint | Used by | Status |
|----------|---------|--------|
| `/api/auth/*` | Login, Register | OK |
| `/api/dashboard/stats` | Dashboard | Enhanced (fleet KPIs) |
| `/api/vehicles` | Vehicles, selectors | OK |
| `/api/obd/latest/:id` | Diagnostics, LiveOBD | OK |
| `/api/obd/history/:id` | Diagnostics | OK |
| `/api/dtc/*` | DTC page | OK (pending flag via `status`) |
| `/api/fuel` | Fuel | OK |
| `/api/maintenance` | Maintenance | OK |
| `/api/drivers/scores` | Drivers | OK |
| `/api/reports/*` | Reports | OK |
| `/api/alerts/:vehicleId` | Reports/alerts tab | OK |
| `/api/work-orders` | Maintenance (linked) | OK |
| `/api/v1/devices/*` | Mobile MQTT provision | OK |
| `/api/health/mqtt` | Ops | OK |

---

## 4. Telemetry Integration Report

| Stage | Status | Notes |
|-------|--------|-------|
| Mobile PID poll | Partial | 010C–0111, 012F, 0104, 0105, 0110, battery ad-hoc; missing 0101, 0141, 01A6, 017F, 0902, Mode 07 |
| Backend normalize | OK | `telemetryParser.js` |
| PostgreSQL | OK | `obd_live_data` + `obd_raw_backup` |
| MQTT ingest | OK if EMQX up | `MQTT_ENABLED=true` |
| Socket.IO | OK | `live:update` |
| Frontend gauges | OK | Core PIDs displayed |

**Extended OBD fields** stored on `vehicles` + `dtc_codes.status` migration `20260531120000_fleetnimble_obd_extended`.

---

## 5. Branding Migration Report

Legacy product branding fully migrated to **FleetNimble** / **fleetnimble.com** across frontend, backend, mobile, docs, and seeds.

---

## 6. Bug Fix Report

| Issue | Fix |
|-------|-----|
| `routes/v1` wrong import paths | Fixed `../../utils/prisma.js` |
| MQTT not connecting | EMQX not running — set `MQTT_ENABLED=false` or start Docker |
| Postgres manual start | Use `scripts/start.ps1` |

---

## 7. Performance Report

- Socket reconnect + heartbeat in `useSocket.js`
- Dashboard limits vehicle list to 5 for chart
- Lazy: not yet code-split (future)

---

## 8. Security Review

- JWT in `api.js` with refresh
- Helmet on API
- Protected routes via `ProtectedRoute.jsx`
- No mock data in production paths

---

## 9. Production Readiness

| Area | Status |
|------|--------|
| Auth | Ready |
| CRUD | Ready |
| Realtime | Ready (HTTP path) |
| MQTT | Optional / infra-dependent |
| Mobile extended PIDs | In progress |

---

## 10. Files Modified / Created (this session)

### Created
- `docs/fleetnimble/AI_HANDOFF_PACKAGE.md`
- `docs/fleetnimble/FEATURE_MAPPING.md`
- `backend/prisma/migrations/20260531120000_fleetnimble_obd_extended/migration.sql`
- `frontend/src/constants/pids.js`

### Modified
- `frontend/src/components/Layout.jsx` — branding + approved nav
- `frontend/src/pages/Dashboard.jsx` — enhanced KPIs
- `frontend/src/pages/Diagnostics.jsx` — full gauge set + status
- `frontend/src/pages/DtcCodes.jsx` — active/history tabs
- `frontend/src/pages/Reports.jsx` — alerts integration
- `frontend/src/pages/VehicleDetails.jsx` — VIN, MIL, readiness
- `frontend/index.html`, `Login.jsx`, `Register.jsx`
- `backend/src/controllers/reportController.js` — dashboard KPIs
- `backend/src/controllers/dtcController.js` — pending vs confirmed
- `backend/prisma/schema.prisma` — extended fields

---

## Features Completed

- [x] Frontend audit + mapping docs
- [x] FleetNimble branding (UI)
- [x] Approved 8-page navigation structure
- [x] Dashboard KPI expansion (real API)
- [x] Live diagnostics all core gauges + socket
- [x] DTC active/history + clear
- [x] Reports + alerts combined tab
- [x] Vehicle health badges (existing)
- [x] Backend dashboard stats enrichment

## Features Pending

- [ ] Mobile: Mode 07 pending DTCs, 0101 MIL, 0141 readiness, 01A6/017F, 0902 VIN auto-fill
- [ ] Fuel: live PID 012F chart on Fuel page
- [ ] Maintenance: engine-hours / odometer PM rules
- [ ] Drivers: behavior events UI from `driver_behavior_events`
- [ ] MQTT without Docker (document only)
- [ ] Remove/hide Trips from routes (nav hidden, route kept)

## Known Issues

1. **MQTT** requires Docker Desktop running for EMQX.
2. **PostgreSQL** on 5433 must be started manually (`scripts/start.ps1`).
3. **DTC pending** requires mobile to send `status: 'PENDING'` on upload.
4. **Geofence/GPS** exist in DB but excluded from approved UI.

## Next AI Session — Exact Steps

1. Read `docs/fleetnimble/AI_HANDOFF_PACKAGE.md` (this file).
2. Run `.\scripts\start.ps1` then `cd backend; npm run dev` and `cd frontend; npm run dev`.
3. Apply migration: ensure `DATABASE_URL` uses port **5433**, then `cd backend; npx prisma migrate deploy`.
4. Complete mobile PID list in `mobile/lib/utils/pid_parser.dart` + `obd_service.dart`.
5. Wire `FuelLogs.jsx` to show live `fuelLevel` from `/obd/latest/:id`.
6. Add driver behavior UI via `GET /api/drivers/behavior/:vehicleId` (endpoint TBD).
7. Do **not** add GPS map, geofencing UI, or UDS features.

**Login:** `admin@fleetnimble.com` / `Admin123!`
