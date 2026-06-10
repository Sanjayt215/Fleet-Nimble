# Required Environment Variables (consolidated)

## Backend
- NODE_ENV (production)
- PORT (5000)
- DATABASE_URL (postgresql://user:pass@host:port/dbname?schema=public&sslmode=require)
- REDIS_URL (redis:// or rediss://)
- JWT_SECRET
- JWT_REFRESH_SECRET
- JWT_EXPIRES_IN (e.g., 15m)
- JWT_REFRESH_EXPIRES_IN (e.g., 7d)
- CORS_ORIGIN (comma-separated frontend URLs)
- RATE_LIMIT_WINDOW_MS
- RATE_LIMIT_MAX

## MQTT (optional)
- MQTT_ENABLED (true|false)
- MQTT_URL
- MQTT_PUBLIC_URL (optional)
- MQTT_CLIENT_ID
- MQTT_USERNAME
- MQTT_PASSWORD
- MQTT_REJECT_UNAUTHORIZED

## Frontend
- VITE_API_URL (https://api.your-domain.com/api)
- VITE_SOCKET_URL (https://api.your-domain.com)

## Optional (seeding/backups)
- PGPASSWORD (used by backups scripts)
- Any cloud provider credentials for managed Postgres/Redis
