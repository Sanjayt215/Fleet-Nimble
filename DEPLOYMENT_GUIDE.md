# FleetNimble Deployment Guide

This guide outlines steps to deploy the FleetNimble web stack (frontend + backend) to production using Render (backend + static) and Vercel (frontend).

Prerequisites
- git repo on branch `main`
- PostgreSQL instance (managed: Neon/Cloud/Heroku/Render Postgres)
- Redis instance (Upstash or managed Redis)
- Optional EMQX MQTT broker (cloud broker or disable MQTT)

Backend (Render) - quick steps
1. Create a Render Web Service named `fleet-backend` (or use provided `render.yaml`).
2. Set environment variables (see `ENVIRONMENT_VARIABLES` section below).
3. Build command: `npm ci && npx prisma generate`.
4. Start command: `npm start`.
5. If using Prisma migrations, either commit `prisma/migrations/` or run `prisma migrate deploy` during deploy hooks. If not using migrations, `prisma db push` is acceptable for schema sync.

Frontend (Vercel) - quick steps
1. Import the project into Vercel and set the root to the repository root.
2. Ensure `frontend` is selected as the project directory or use `vercel.json` included.
3. Build command: `npm ci && npm run build`.
4. Set `VITE_API_URL` to `https://<your-backend-host>/api` and `VITE_SOCKET_URL` accordingly.

CORS
- The backend reads `CORS_ORIGIN` (comma-separated). For production, set it to your frontend URL(s), e.g. `https://app.your-domain.com`.

Database
- Provide `DATABASE_URL` in standard postgres format: `postgresql://user:pass@host:port/dbname?schema=public&sslmode=require`.
- For migrations: commit `prisma/migrations` or run `npx prisma migrate deploy` as part of CI/deploy.
- For seeding: use `npm run db:seed` or `db:seed:phase2` as needed.

Redis
- Provide `REDIS_URL` (e.g., `rediss://:TOKEN@us1-upstash-redis.upstash.io:6379`).

MQTT
- If you use EMQX cloud, set `MQTT_ENABLED=true` and provide `MQTT_URL`, `MQTT_USERNAME`, and `MQTT_PASSWORD`.
- To disable MQTT in production, set `MQTT_ENABLED=false`.

Prisma notes
- `generator client` currently targets `native`. Ensure `npx prisma generate` runs on the build host.
- For Render, `npx prisma generate` should be part of the build.

Health checks
- Dockerfile healthcheck uses the container `PORT` env to validate backend readiness.

Local verification
- Build frontend locally:

```bash
cd frontend
npm ci
npm run build
```

- Run backend locally:

```bash
cd backend
npm ci
npm start
```

ENVIRONMENT_VARIABLES
See `DEPLOYMENT_ENV_VARS.md` for a consolidated list.
