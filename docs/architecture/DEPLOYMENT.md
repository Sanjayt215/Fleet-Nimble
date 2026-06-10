# Deployment Architecture

## 1. Environment Tiers

| Tier | Purpose | Infrastructure |
|------|---------|----------------|
| Local | Dev | Docker Compose, PG on 5433 |
| Staging | QA + MQTT testing | Single VPS, staging subdomain |
| Production | Live fleet | VPS or cloud (AWS/GCP) |

## 2. Docker Compose Stack

### Core (`docker-compose.yml`)
- postgres, redis, backend, frontend, nginx

### Telemetry Overlay (`docker-compose.telemetry.yml`)
- emqx (MQTT broker)
- Optional: telemetry-worker (separate consumer process)

```powershell
docker compose -f docker-compose.yml -f docker-compose.telemetry.yml up -d
```

## 3. Production VPS Layout

```
Internet
   │
   ▼
[Nginx :443] ── TLS termination
   ├── /           → Next.js / React static
   ├── /api        → Backend :5000
   ├── /socket.io  → Backend (WebSocket upgrade)
   └── mqtts       → EMQX :8883 (stream proxy or direct)

Internal network (Docker bridge):
   backend ↔ postgres:5432
   backend ↔ redis:6379
   backend ↔ emqx:1883 (internal plain MQTT)
   emqx ↔ postgres (auth plugin, optional)
```

## 4. SSL / Domain Setup

```bash
# Certbot with Nginx
certbot --nginx -d fleet.example.com -d api.fleet.example.com -d mqtt.fleet.example.com

# MQTT TLS cert (same or separate)
cp /etc/letsencrypt/live/mqtt.fleet.example.com/fullchain.pem infra/certs/server.crt
cp /etc/letsencrypt/live/mqtt.fleet.example.com/privkey.pem infra/certs/server.key
```

## 5. Environment Variables (Production)

```env
NODE_ENV=production
DATABASE_URL=postgresql://fleet:***@postgres:5432/fleet_db
REDIS_URL=redis://:***@redis:6379
JWT_SECRET=<256-bit-random>
JWT_REFRESH_SECRET=<256-bit-random>
MQTT_ENABLED=true
MQTT_URL=mqtt://emqx:1883
MQTT_TLS_URL=mqtts://emqx:8883
MQTT_USERNAME=backend-ingest
MQTT_PASSWORD=<random>
CORS_ORIGIN=https://fleet.example.com
OBD_RETENTION_DAYS=90
```

## 6. CI/CD Pipeline (GitHub Actions)

```yaml
# .github/workflows/deploy.yml
on:
  push:
    branches: [main]
jobs:
  test:
    - npm ci && npm test (backend)
    - prisma migrate diff
  build:
    - docker build backend, frontend
  deploy:
    - ssh VPS: docker compose pull && docker compose up -d
    - npx prisma migrate deploy
    - health check /api/health
```

## 7. Scaling Strategy

| Vehicles | Architecture |
|----------|--------------|
| 1–100 | Single VPS, monolith |
| 100–1,000 | Separate EMQX, Redis adapter for Socket.IO |
| 1,000–10,000 | Telemetry worker replicas, TimescaleDB |
| 10,000+ | K8s, Kafka/NATS, multi-region |

### Horizontal API Scaling

```yaml
backend:
  deploy:
    replicas: 3
nginx:
  # sticky sessions for Socket.IO
  ip_hash;
```

Socket.IO Redis adapter:
```js
import { createAdapter } from '@socket.io/redis-adapter';
io.adapter(createAdapter(pubClient, subClient));
```

## 8. Monitoring

| Component | Tool |
|-----------|------|
| Uptime | UptimeRobot → `/api/health` |
| Metrics | Prometheus node_exporter + postgres_exporter |
| Dashboards | Grafana |
| Logs | Loki or CloudWatch |
| MQTT | EMQX built-in metrics |
| Alerts | PagerDuty on error rate > 1% |

## 9. Backup & DR

- **Postgres:** Daily pg_dump + WAL archiving
- **Redis:** RDB snapshots (non-critical cache)
- **EMQX:** Config in Git; persistent sessions optional
- **RTO:** 4 hours | **RPO:** 1 hour

## 10. Mobile App Distribution

- Android: Play Store internal testing → production
- Config: `MQTT_BROKER=mqtts://mqtt.fleet.example.com:8883`
- OTA config via MQTT `cmd/config` topic (no app update needed)

## 11. Cost Estimate (100 vehicles, single VPS)

| Resource | Spec | ~Cost/mo |
|----------|------|----------|
| VPS | 4 vCPU, 8GB | $40–80 |
| Domain + SSL | Let's Encrypt | Free |
| SMS alerts (optional) | Twilio | $10+ |
| **Total** | | **~$50–100** |

## 12. Go-Live Checklist

1. Domain + SSL configured
2. EMQX MQTTS enabled, 1883 firewalled
3. Secrets rotated from dev defaults
4. Migrations applied
5. Device provisioning tested end-to-end
6. Mobile app pointed to production MQTT
7. Monitoring + alerting active
8. Backup job verified
9. Load test: 100 msg/s sustained
10. Rollback plan documented
