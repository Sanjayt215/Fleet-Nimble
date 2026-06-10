import dotenv from 'dotenv';
dotenv.config();

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5000', 10),
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX || '1000', 10),
  },
  mqtt: {
    enabled: process.env.MQTT_ENABLED === 'true',
    url: process.env.MQTT_URL || 'mqtt://localhost:1883',
    clientId: process.env.MQTT_CLIENT_ID || `fleet-ingest-${process.pid}`,
    username: process.env.MQTT_USERNAME || 'backend-ingest',
    password: process.env.MQTT_PASSWORD || '',
    rejectUnauthorized: process.env.MQTT_REJECT_UNAUTHORIZED !== 'false',
    caPath: process.env.MQTT_CA_PATH || null,
    reconnectPeriodMs: parseInt(process.env.MQTT_RECONNECT_MS || '5000', 10),
    connectTimeoutMs: parseInt(process.env.MQTT_CONNECT_TIMEOUT_MS || '30000', 10),
    concurrency: parseInt(process.env.MQTT_CONCURRENCY || '10', 10),
    maxRetries: parseInt(process.env.MQTT_MAX_RETRIES || '5', 10),
    deadLetterBatchSize: parseInt(process.env.MQTT_DLQ_BATCH_SIZE || '25', 10),
  },
};
