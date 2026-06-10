# Production Readiness

- **Auth:** JWT + refresh + role-based admin routes — ready
- **Data:** Prisma CRUD — ready; run migration `20260531120000_fleetnimble_obd_extended`
- **Realtime:** Socket.IO reconnect configured — ready
- **MQTT:** Infra-dependent
- **Security:** Helmet, validated bodies, no secrets in frontend env samples

**Pre-deploy checklist:** Start Postgres (`scripts/start.ps1`), migrate DB, set production `JWT_*`, enable TLS on API/MQTT in production.
