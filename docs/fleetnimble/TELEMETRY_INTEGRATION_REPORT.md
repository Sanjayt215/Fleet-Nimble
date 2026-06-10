# Telemetry Integration Report

| Stage | Component | Status |
|-------|-----------|--------|
| 1 | Flutter OBD app | HTTP ingest working; MQTT optional |
| 2 | EMQX broker | Requires Docker (`docker-compose.telemetry.yml`) |
| 3 | MQTT consumer | `backend/src/mqtt/consumer.js` |
| 4 | Ingest | `obdIngest.js` → `obd_live_data` |
| 5 | Realtime | Socket `live:update` |
| 6 | UI | Dashboard, Diagnostics, LiveOBD |

**Gap:** Extended PIDs (0101 MIL, 0141 readiness, 01A6 odometer, 017F engine hours) need mobile + vehicle field updates on ingest.

**Ops:** Set `MQTT_ENABLED=false` when EMQX is not running to stop reconnect noise.
