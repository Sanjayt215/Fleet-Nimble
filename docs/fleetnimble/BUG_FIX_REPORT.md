# Bug Fix Report (integration session)

| Issue | Resolution |
|-------|------------|
| v1 routes import path | `../../utils/prisma.js` |
| MQTT reconnect loop | Start EMQX or `MQTT_ENABLED=false` |
| Dashboard missing KPIs | Extended `dashboardStats` |
| DTC pending not distinguished | `DtcStatus` enum + mobile `status: PENDING` |
| Alerts separate from reports | Merged under `/reports?tab=alerts` |
| Nav clutter | 8-module approved nav in Layout |
