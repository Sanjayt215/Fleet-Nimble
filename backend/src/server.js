import http from 'http';
import { WebSocketServer } from 'ws';
import { Server } from 'socket.io';
import app from './app.js';
import { config } from './config/index.js';
import logger from './utils/logger.js';
import { initSockets } from './sockets/index.js';
import { startCronJobs } from './cron/index.js';
import { socketCorsOrigin } from './utils/corsOrigins.js';
import { startMqttConsumer, stopMqttConsumer } from './mqtt/consumer.js';
import { verifyAIServiceStartup } from './services/aiService.js';
import { handleMediaStream } from './services/mediaStreamHandler.js';
import * as providerHealth from './services/receptionistProviderHealth.service.js';
import { validateOwnerAtStartup } from './services/receptionistTenantResolver.service.js';
import { getRealtimeProviderHealth } from './providers/realtime/realtimeVoiceProviderFactory.js';
import { getAssistantProviderHealth } from './providers/assistant/assistantProviderFactory.js';

logger.info('BOOT_START');

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: socketCorsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  },
  pingInterval: 25000,
  pingTimeout: 20000,
});

app.set('io', io);
initSockets(io);
startCronJobs(app);

startMqttConsumer(io).catch((err) => {
  logger.error('MQTT consumer failed to start', { err: err.message });
});

// ── Twilio Media Stream WebSocket server ──
const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (ws, request) => {
  const pathname = request.url ? new URL(request.url, `http://${request.headers.host}`).pathname : 'unknown';
  logger.info('TWILIO_WS_CONNECTION_OPEN', { pathname });
  try {
    handleMediaStream(ws, request);
  } catch (error) {
    logger.error('MEDIA_STREAM_HANDLER_CRASH', { error: error.message, pathname });
    ws.close(1011, 'Handler error');
  }
});

server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;

  if (pathname === '/api/ai-receptionist/twilio/media-stream') {
    logger.info('TWILIO_WS_UPGRADE_RECEIVED', {
      pathname,
      hasCallSidParam: request.url.includes('callSid'),
    });
    wss.handleUpgrade(request, socket, head, (ws) => {
      logger.info('TWILIO_WS_UPGRADE_ACCEPTED', { pathname });
      wss.emit('connection', ws, request);
    });
  } else {
    // Socket.IO handles its own upgrade path — do not intercept
  }
});

const host = process.env.HOST || '0.0.0.0';

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    logger.error(`Port ${config.port} is already in use on ${host}.`, {
      err: err.message,
    });
    process.exit(1);
  }

  logger.error('Server error', { err: err.message });
  process.exit(1);
});

server.listen(config.port, host, async () => {
  logger.info('HTTP_SERVER_LISTENING', {
    port: config.port,
    host: '0.0.0.0',
    environment: config.env,
  });

  // ── Start database connection (non-blocking, retries with backoff) ──
  const { start: startDb } = await import('./utils/databaseStatusManager.js');
  startDb();

  verifyAIServiceStartup();

  if (config.mqtt.enabled) {
    logger.info('MQTT telematics ingest enabled');
  }

  logger.info('Digital twin auto-creation disabled');
  logger.info('AI Receptionist Twilio routes mounted at /api/ai-receptionist/twilio');
  logger.info('AI Receptionist routes at /api/ai-receptionist');
  logger.info('AI Receptionist agent endpoints at /api/ai-receptionist/agent/*');
  logger.info('Twilio media stream WebSocket at /api/ai-receptionist/twilio/media-stream');
  logger.info('Public health endpoints: GET /api/health/live, GET /api/health/ready, GET /api/health, GET /api/ai-receptionist/health');
  logger.info('TWILIO_CONFIG', {
    twilioConfigured: config.twilio.configured,
    phoneConfigured: config.twilio.phoneConfigured,
    validateSignature: config.twilio.validateSignature,
    aiReceptionistEnabled: config.aiReceptionist.enabled,
    voiceAgentMode: config.aiReceptionist.voiceAgentMode,
  });

  if (config.realtime.configured) {
    providerHealth.markConfigured();
  }

  // ── GeminiLiveProvider static info (shared between validation blocks) ──
  const { GeminiLiveProvider: GLP } = await import('./providers/realtime/geminiLive.provider.js');

  // ── Gemini startup validation ──
  if (config.realtimeProvider?.provider === 'gemini' || !config.realtimeProvider?.provider) {
    const apiVersion = GLP.getApiVersion();
    const geminiModel = config.gemini?.liveModel;
    const baseUrl = GLP.getBaseUrl();
    const supportedModels = GLP.getSupportedModels();
    const modelSupported = GLP.isModelSupported(geminiModel);

    if (!config.gemini?.apiKey && !process.env.GEMINI_API_KEY && !process.env.GEMINI_LIVE_API_KEY) {
      logger.error('GEMINI_CONFIG_ERROR', { reason: 'GEMINI_API_KEY not set. Set GEMINI_API_KEY or GEMINI_LIVE_API_KEY in .env' });
    } else if (!geminiModel) {
      logger.error('GEMINI_CONFIG_ERROR', { reason: 'GEMINI_LIVE_MODEL not set. Set GEMINI_LIVE_MODEL or GEMINI_MODEL in .env' });
    } else {
      logger.info('GEMINI_CONFIG_OK', {
        model: geminiModel,
        modelSupported,
        apiVersion,
        apiKeyPresent: true,
        endpoint: baseUrl,
        supportedModels,
      });
      if (!modelSupported) {
        logger.error('GEMINI_MODEL_UNSUPPORTED', {
          model: geminiModel,
          reason: 'Model does not support bidiGenerateContent (Gemini Live API)',
          supportedModels,
        });
      }
    }
  }

  // ── DIAG: Full voice pipeline startup diagnostics ──
  const { RealtimeModelValidator: RMV } = await import('./services/realtimeModelValidator.js');
  const modelCheck = RMV.validate(config.realtime.model);
  const rtHealth = getRealtimeProviderHealth();
  const asstHealth = getAssistantProviderHealth();
  const geminiModelSupported = GLP.isModelSupported(config.gemini?.liveModel);
  logger.info('DIAG_PIPELINE_CONFIG', {
    publicUrl: config.publicUrl,
    realtimeProvider: rtHealth.provider,
    realtimeProviderEnabled: config.realtimeProvider?.enabled !== false,
    realtimeProviderGeminiEnabled: config.realtimeProvider?.geminiEnabled,
    realtimeProviderOpenaiEnabled: config.realtimeProvider?.openaiEnabled,
    realtimeProviderFailoverEnabled: config.realtimeProvider?.failoverEnabled,
    realtimeModel: config.realtime.model,
    realtimeVoice: config.realtime.voice,
    realtimeConfigured: config.realtime.configured,
    realtimeProviderConfigured: rtHealth.configured,
    mediaStreamEnabled: config.realtime.mediaStreamEnabled,
    modelValid: modelCheck.valid,
    modelValidationReason: modelCheck.valid ? null : modelCheck.reason,
    maxCallSeconds: config.realtime.maxCallSeconds,
    silenceTimeoutSeconds: config.realtime.silenceTimeoutSeconds,
    geminiApiKeyPresent: Boolean(config.gemini?.apiKey),
    geminiConfigured: config.gemini.configured,
    geminiLiveApiVersion: GLP.getApiVersion(),
    geminiLiveModel: config.gemini?.liveModel,
    geminiLiveModelSupported: geminiModelSupported,
    geminiLiveEndpoint: GLP.getBaseUrl(),
    geminiLiveSupportedModels: GLP.getSupportedModels(),
    openaiApiKeyPresent: Boolean(config.openai.apiKey),
    assistantProvider: config.assistantProvider?.provider || 'groq',
    assistantProviderEnabled: config.assistantProvider?.enabled !== false,
    groqApiKeyPresent: Boolean(config.groq?.apiKey),
    aiReceptionistEnabled: config.aiReceptionist.enabled,
    voiceAgentMode: config.aiReceptionist.voiceAgentMode,
    sessionManagerVersion: '2.0',
  });

  (async function retryOwnerValidation() {
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        const result = await validateOwnerAtStartup();
        if (result.ownerValidated && result.companyValidated) break;
        if (result.ownerConfigured && !result.ownerValidated) {
          logger.warn('OWNER_VALIDATION_RETRY', { attempt: attempt + 1 });
        }
      } catch (err) {
        logger.warn('OWNER_VALIDATION_RETRY', { attempt: attempt + 1, error: err.message });
      }
      await new Promise(r => setTimeout(r, Math.min(1000 * Math.pow(2, attempt), 30000)));
    }
  })();

  logger.info('BOOT_COMPLETE');
});

// ── Server-side DB connectivity timer for cleanup ──
setInterval(async () => {
  const { cleanupStaleSessions } = await import('./services/receptionistAgent.service.js');
  const count = cleanupStaleSessions(1800000);
  if (count > 0) logger.info('STALE_AGENT_SESSIONS_CLEANED', { count });
}, 600000);

setInterval(async () => {
  const { cleanupStaleSessions: cleanupOld } = await import('./services/receptionistRealtime.service.js');
  cleanupOld(600000);
}, 600000);

setInterval(async () => {
  const { RealtimeSessionManager: RSM } = await import('./services/realtimeSessionManager.js');
  RSM.cleanup(600000);
}, 600000);

setInterval(async () => {
  const { cleanupOrchestrator } = await import('./services/receptionistOrchestrator.service.js');
  cleanupOrchestrator();
}, 3600000);

// ── Global error handlers for 24/7 reliability ──
process.on('unhandledRejection', (reason, promise) => {
  logger.error('UNHANDLED_REJECTION', { reason: reason?.message || reason, stack: reason?.stack });
});

process.on('uncaughtException', (err) => {
  logger.error('UNCAUGHT_EXCEPTION', { error: err?.message, stack: err?.stack });
});

process.on('SIGTERM', async () => {
  logger.info('SHUTDOWN_INITIATED');
  stopMqttConsumer();

  try {
    const { cleanupStaleSessions } = await import('./services/receptionistRealtime.service.js');
    const { flushPendingTranscripts } = await import('./services/receptionistTranscript.service.js');
    cleanupStaleSessions(0);
    await flushPendingTranscripts();
  } catch { }
  try {
    const { cleanupStaleSessions: cleanAgent } = await import('./services/receptionistAgent.service.js');
    cleanAgent(0);
  } catch { }

  const { stop: stopDb } = await import('./utils/databaseStatusManager.js');
  stopDb();

  wss.close(() => {
    logger.info('WEBSOCKET_SERVER_CLOSED');
  });

  server.close(() => {
    logger.info('HTTP_SERVER_CLOSED');
    process.exit(0);
  });

  setTimeout(() => process.exit(0), 5000);
});
