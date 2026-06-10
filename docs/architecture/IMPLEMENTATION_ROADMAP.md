# Implementation Roadmap

12-week phased rollout from current prototype to enterprise telematics platform.

---

## Phase 0 — Foundation (Week 1) ✅

**Goal:** Architecture docs + MQTT scaffold integrated with existing ingest.

| Task | Status |
|------|--------|
| Enterprise architecture documentation | ✅ |
| EMQX Docker config | ✅ |
| MQTT consumer → `obdIngest()` | ✅ |
| Device provisioning API (v1) | ✅ |
| Prisma: Company, TelematicsDevice, Geofence | ✅ |
| Mobile MQTT service skeleton | ✅ |

**Exit criteria:** Device can publish to MQTT; data appears in dashboard via existing Socket.IO.

---

## Phase 1 — Cloud Connectivity (Weeks 2–3)

**Goal:** Mobile app streams over internet via MQTTS.

| Task | Owner | Effort |
|------|-------|--------|
| Flutter: integrate `mqtt_client` package | Mobile | 3d |
| Offline queue → MQTT retry drain | Mobile | 2d |
| Device provisioning UI in Settings | Mobile | 2d |
| TLS cert pinning for production broker | Mobile | 1d |
| EMQX auth: PostgreSQL or HTTP auth plugin | Backend | 2d |
| Public VPS + domain + MQTTS | DevOps | 2d |
| Dual-write: HTTP + MQTT (feature flag) | Mobile | 1d |

**Exit criteria:** Phone on 5G publishes telemetry; dashboard updates without same WiFi.

---

## Phase 2 — Stream Processing (Weeks 4–5)

**Goal:** Event-driven pipeline for trips, behavior, geofencing.

| Task | Effort |
|------|--------|
| Redis Streams: `telemetry.events` | 2d |
| Trip engine (start/stop detection) | 3d |
| Driver behavior ingest (harsh brake/accel) | 2d |
| Geofence engine (point-in-polygon) | 3d |
| TimescaleDB hypertables | 2d |
| Telemetry dedup (messageId) | 1d |

**Exit criteria:** Trips auto-created; geofence alerts fire; behavior events scored.

---

## Phase 3 — Backend Hardening (Weeks 6–7)

**Goal:** Production API + optional NestJS extraction.

| Task | Effort |
|------|--------|
| API v1 full rollout | 3d |
| Audit logging middleware | 1d |
| Socket.IO Redis adapter | 2d |
| Webhook integrations | 2d |
| FCM push notifications | 2d |
| NestJS telemetry-service extraction (optional) | 5d |
| OpenTelemetry tracing | 2d |

**Exit criteria:** 99.9% uptime on staging; horizontal scale test with 3 API replicas.

---

## Phase 4 — Enterprise Frontend (Weeks 8–10)

**Goal:** Next.js fleet command center.

| Task | Effort |
|------|--------|
| Scaffold `frontend-next/` (Next.js 14 + TS) | 2d |
| Auth + tenant context (Zustand) | 2d |
| Fleet map (Mapbox GL, live markers) | 4d |
| Command center dashboard (KPI widgets) | 3d |
| Trip playback component | 3d |
| Alerts center + ack workflow | 2d |
| Driver scoring dashboard | 2d |
| Dark/light mode + responsive polish | 2d |
| Migrate remaining pages from React SPA | 5d |

**Exit criteria:** Feature parity + fleet map; production deploy on Vercel or VPS.

---

## Phase 5 — Advanced Telematics (Weeks 11–12)

**Goal:** UDS, predictive maintenance, AI insights.

| Task | Effort |
|------|--------|
| VIN decode on first connect | 1d |
| UDS remote diagnostic sessions | 5d |
| Predictive maintenance rules engine | 3d |
| Fuel theft detection algorithm | 2d |
| AI insights dashboard (anomaly summaries) | 3d |
| OTA firmware architecture (MQTT cmd topic) | 3d |
| CAN bus raw logging (gateway devices) | 5d |

**Exit criteria:** Remote DTC read via dashboard; maintenance predictions visible.

---

## Risk Register

| Risk | Mitigation |
|------|------------|
| MQTT message loss | QoS 1 + offline queue + dedup |
| Socket.IO scale limits | Redis adapter + sticky sessions |
| Mobile battery drain | Adaptive poll interval via `cmd/config` |
| Postgres write bottleneck | TimescaleDB + batch inserts |
| Tenant data leak | Middleware + integration tests |

---

## Team Sizing (Recommended)

| Role | FTE |
|------|-----|
| Backend / telematics engineer | 1.0 |
| Mobile (Flutter) engineer | 0.5 |
| Frontend (Next.js) engineer | 0.5 |
| DevOps | 0.25 |

---

## Success Metrics

| Metric | Target |
|--------|--------|
| End-to-end latency | < 500ms p95 |
| Device reconnect time | < 5s |
| Dashboard uptime | 99.9% |
| Message delivery | > 99.99% (QoS 1) |
| Offline sync success | > 99% within 1 hour |
