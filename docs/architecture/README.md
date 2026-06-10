# FleetNimble Enterprise Telematics Architecture

Production-grade architecture for upgrading FleetNimble from local WiFi HTTP/Socket.IO to cloud MQTT telematics (enterprise telematics class).

## Documents

| Document | Description |
|----------|-------------|
| [ENTERPRISE_ARCHITECTURE.md](./ENTERPRISE_ARCHITECTURE.md) | Master system design, data flows, module map |
| [MQTT_TOPICS.md](./MQTT_TOPICS.md) | Topic hierarchy, QoS, payload schemas |
| [API_STRUCTURE.md](./API_STRUCTURE.md) | REST v1 API, versioning, services |
| [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) | Multi-tenant schema, migrations, TimescaleDB |
| [SECURITY_MODEL.md](./SECURITY_MODEL.md) | TLS, JWT, device auth, tenant isolation |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Docker, CI/CD, SSL, scaling, monitoring |
| [IMPLEMENTATION_ROADMAP.md](./IMPLEMENTATION_ROADMAP.md) | Phased rollout plan (12 weeks) |
| [FRONTEND_ARCHITECTURE.md](./FRONTEND_ARCHITECTURE.md) | Next.js command center UI modules |

## Phase 1 Code (Implemented)

```
backend/src/mqtt/          MQTT consumer → existing obdIngest pipeline
backend/src/services/      deviceProvisioningService, telemetryBroadcast
backend/src/routes/v1/     Device provisioning API
infra/emqx/                EMQX broker config + ACL
docker-compose.telemetry.yml
mobile/lib/services/mqtt_service.dart
```

## Quick Start (MQTT Dev Stack)

```powershell
docker compose -f docker-compose.yml -f docker-compose.telemetry.yml up -d emqx redis postgres
cd backend
npm install
# Set MQTT_ENABLED=true in .env
npm run dev
```

EMQX Dashboard: http://localhost:18083 (admin / public)
