# FleetNimble — Fleet Intelligence + OBD-II Telematics

Production-grade fleet intelligence platform (fleetnimble.com) with ELM327 OBD-II telemetry, real-time Socket.IO updates, React dashboard, and Flutter mobile app.

## Enterprise Telematics Architecture

Full production architecture (MQTT + TLS, multi-tenant, NestJS/Next.js roadmap):

**→ [docs/architecture/README.md](./docs/architecture/README.md)**

Phase 1 adds **MQTT ingest** (EMQX) feeding the existing `obdIngest` pipeline — dashboard works unchanged while mobile migrates from WiFi HTTP to cloud MQTTS.

## Architecture

```
Vehicle ECU → ELM327 → Flutter App ──MQTTS──→ EMQX Broker → MQTT Consumer → PostgreSQL
                      │                                              ↓
                      └── HTTP (legacy) ──→ Express API ──→ Socket.IO → React Dashboard
```

## Tech Stack

| Layer | Stack |
|-------|--------|
| Web | React, Vite, Tailwind, Recharts, Axios, JWT |
| Mobile | Flutter, Riverpod, flutter_blue_plus, MQTT (Phase 1) |
| API | Node.js, Express, Prisma, PostgreSQL, Redis, Socket.IO, MQTT.js |
| Telematics | EMQX 5 (MQTT broker), MQTTS TLS |
| Deploy | Docker Compose, Nginx |

## Quick Start (Local)

### Prerequisites

- Node.js 20+
- PostgreSQL 16 (or Docker)
- Redis 7 (optional; cache degrades gracefully)
- Flutter 3.16+ (for mobile)

### Automated setup (Windows)

```powershell
.\scripts\setup.ps1
```

### 1. Database & Redis (+ optional EMQX MQTT)

```bash
docker compose up postgres redis -d
# With MQTT telematics broker:
docker compose -f docker-compose.yml -f docker-compose.telemetry.yml up postgres redis emqx -d
```

Or install PostgreSQL locally and create database `fleet_db` with user `fleet` / password `fleet_secret` (match `backend/.env`).

### 2. Backend

```bash
cd backend
cp .env.example .env
npm install
npx prisma migrate deploy
npm run db:seed
npm run dev
```

API: http://localhost:5000  
Health: http://localhost:5000/api/health

**Default admin:** `admin@fleetnimble.com` / `Admin123!`

### 3. Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Dashboard: http://localhost:3000

### 4. Mobile (Android emulator)

```bash
cd mobile
flutter pub get
flutter run --dart-define=API_URL=http://10.0.2.2:5000/api --dart-define=SOCKET_URL=http://10.0.2.2:5000
```

Physical device: use your machine LAN IP instead of `10.0.2.2`.

## Docker (Full Stack)

```bash
docker compose up --build
```

| Service | URL |
|---------|-----|
| Dashboard | http://localhost:3000 |
| API | http://localhost:5000 |
| Nginx proxy | http://localhost:80 |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |

## API Overview

All routes under `/api` unless noted.

### Auth
- `POST /auth/register` · `POST /auth/login` · `POST /auth/logout` · `GET /auth/profile` · `POST /auth/refresh`

### Core resources
- Vehicles, OBD live data, DTC, Trips, GPS, Fuel, Maintenance, Alerts, Reports, Drivers, Work Orders, Admin

### Socket.IO (authenticated)

**Mobile emits:** `vehicle:liveData`, `vehicle:alert`, `vehicle:dtcDetected`, `trip:gps`  
**Dashboard listens:** `live:update`, `alert:new`, `dtc:new`, `trip:update`

## OBD-II Support

ELM327 init: `ATZ`, `ATE0`, `ATL0`, `ATH0`, `ATSP0`

| PID | Metric |
|-----|--------|
| 010C | RPM |
| 010D | Speed |
| 0105 | Coolant temp |
| 012F | Fuel level |
| 0104 | Engine load |
| 0110 | MAF |
| 010F | Intake temp |
| 0111 | Throttle |
| ATRV | Battery |
| 0902 | VIN |
| 03/04 | Read/Clear DTC |

## Project Structure

```
fleet/
├── backend/          # Express API + Prisma + Socket.IO
├── frontend/         # React dashboard
├── mobile/           # Flutter OBD app
├── nginx/            # Reverse proxy config
└── docker-compose.yml
```

## Security

- bcrypt passwords
- JWT access + refresh tokens
- Helmet, CORS, rate limiting
- Role-based access (ADMIN, MANAGER, DRIVER, VIEWER)
- Prisma parameterized queries

## License

MIT
