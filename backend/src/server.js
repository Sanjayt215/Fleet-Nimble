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
  try {
    handleMediaStream(ws, request);
  } catch (error) {
    logger.error('Media stream handler error', { error: error.message });
    ws.close();
  }
});

server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url, `http://localhost`).pathname;

  if (pathname === '/api/ai-receptionist/twilio/media-stream') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
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

setInterval(async () => {
  const { cleanupStaleSessions } = await import('./services/receptionistAgent.service.js');
  const count = cleanupStaleSessions(1800000);
  if (count > 0) logger.info('STALE_AGENT_SESSIONS_CLEANED', { count });
}, 600000);

setInterval(async () => {
  const { cleanupStaleSessions: cleanupOld } = await import('./services/receptionistRealtime.service.js');
  cleanupOld(600000);
}, 600000);

server.listen(config.port, host, async () => {
  logger.info(`FleetNimble API running on http://${host}:${config.port}`);
  logger.info(`Environment: ${config.env}`);

  // Verify AI service startup
  verifyAIServiceStartup();

  if (config.mqtt.enabled) {
    logger.info('MQTT telematics ingest enabled');
  }

  logger.info('Digital twin auto-creation disabled');
  logger.info('AI Receptionist routes at /api/ai-receptionist');
  logger.info('AI Receptionist agent endpoints at /api/ai-receptionist/agent/*');
  logger.info('Twilio media stream WebSocket at /api/ai-receptionist/twilio/media-stream');
  logger.info('Public health endpoints: GET /api/health, GET /api/ai-receptionist/health');
});

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

  wss.close(() => {
    logger.info('WEBSOCKET_SERVER_CLOSED');
  });

  server.close(() => {
    logger.info('HTTP_SERVER_CLOSED');
    process.exit(0);
  });

  setTimeout(() => process.exit(0), 5000);
});