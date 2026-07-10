import dotenv from 'dotenv';
dotenv.config();

function parseBool(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  return String(value).toLowerCase() === 'true';
}

function parseIntEnv(value, defaultValue) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function parseFloatEnv(value, defaultValue) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

const env = process.env.NODE_ENV || 'development';
const publicUrl = process.env.PUBLIC_BACKEND_URL || 'http://localhost:5000';

export const config = {
  env,
  port: parseIntEnv(process.env.PORT, 5000),
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
    windowMs: parseIntEnv(process.env.RATE_LIMIT_WINDOW_MS, 900000),
    max: parseIntEnv(process.env.RATE_LIMIT_MAX, 1000),
  },
  mqtt: {
    enabled: parseBool(process.env.MQTT_ENABLED, false),
    url: process.env.MQTT_URL || 'mqtt://localhost:1883',
    clientId: process.env.MQTT_CLIENT_ID || `fleet-ingest-${process.pid}`,
    username: process.env.MQTT_USERNAME || 'backend-ingest',
    password: process.env.MQTT_PASSWORD || '',
    rejectUnauthorized: process.env.MQTT_REJECT_UNAUTHORIZED !== 'false',
    caPath: process.env.MQTT_CA_PATH || null,
    reconnectPeriodMs: parseIntEnv(process.env.MQTT_RECONNECT_MS, 5000),
    connectTimeoutMs: parseIntEnv(process.env.MQTT_CONNECT_TIMEOUT_MS, 30000),
    concurrency: parseIntEnv(process.env.MQTT_CONCURRENCY, 10),
    maxRetries: parseIntEnv(process.env.MQTT_MAX_RETRIES, 5),
    deadLetterBatchSize: parseIntEnv(process.env.MQTT_DLQ_BATCH_SIZE, 25),
  },
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
    phoneNumber: process.env.TWILIO_PHONE_NUMBER || '',
    validateSignature: parseBool(process.env.TWILIO_VALIDATE_SIGNATURE, env === 'production'),
    configured: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
    phoneConfigured: Boolean(process.env.TWILIO_PHONE_NUMBER),
    publicUrl,
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    voice: process.env.AI_RECEPTIONIST_VOICE || 'alloy',
    model: process.env.AI_RECEPTIONIST_MODEL || 'gpt-4o-realtime-preview',
  },
  realtime: {
    model: process.env.AI_RECEPTIONIST_MODEL || 'gpt-4o-realtime-preview',
    voice: process.env.AI_RECEPTIONIST_VOICE || 'alloy',
    maxCallSeconds: parseIntEnv(process.env.AI_RECEPTIONIST_MAX_CALL_SECONDS, 600),
    silenceTimeoutSeconds: parseIntEnv(process.env.AI_RECEPTIONIST_SILENCE_TIMEOUT_SECONDS, 30),
    mediaStreamEnabled: parseBool(process.env.AI_RECEPTIONIST_MEDIA_STREAM_ENABLED, true),
    configured: Boolean(process.env.AI_RECEPTIONIST_MODEL) && Boolean(process.env.OPENAI_API_KEY),
  },
  ai: {
    provider: process.env.AI_PROVIDER || 'openrouter',
    model: process.env.AI_MODEL || 'openai/gpt-4.1-mini',
    providerMode: process.env.AI_PROVIDER_MODE || 'deterministic_first',
    maxTokens: parseIntEnv(process.env.AI_MAX_TOKENS, 300),
    temperature: parseFloatEnv(process.env.AI_TEMPERATURE, 0.2),
    timeoutMs: parseIntEnv(process.env.AI_TIMEOUT_MS, 15000),
    maxRetries: parseIntEnv(process.env.AI_MAX_RETRIES, 2),
    orchestratorEnabled: parseBool(process.env.AI_ORCHESTRATOR_ENABLED, true),
    memoryEnabled: parseBool(process.env.AI_MEMORY_ENABLED, true),
    cacheEnabled: parseBool(process.env.AI_CACHE_ENABLED, true),
    receptionistEnabled: parseBool(process.env.AI_RECEPTIONIST_ENABLED, true),
    voiceAgentMode: process.env.VOICE_AGENT_MODE || 'browser',
    sessionTimeoutMinutes: parseIntEnv(process.env.AI_SESSION_TIMEOUT_MINUTES, 30),
    maxMessagesPerMinute: parseIntEnv(process.env.AI_MAX_MESSAGES_PER_MINUTE, 30),
    healthCheckEnabled: parseBool(process.env.ENABLE_AI_HEALTH_CHECK, true),
  },
  aiReceptionist: {
    enabled: parseBool(process.env.AI_RECEPTIONIST_ENABLED, true),
    voiceAgentMode: process.env.VOICE_AGENT_MODE || 'hybrid',
    mediaStreamEnabled: parseBool(process.env.AI_RECEPTIONIST_MEDIA_STREAM_ENABLED, true),
    diagnostics: parseBool(process.env.AI_RECEPTIONIST_DIAGNOSTICS, true),
  },
  logLevel: process.env.LOG_LEVEL || 'info',
  publicUrl,
};
