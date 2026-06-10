import http from 'http';
import { Server } from 'socket.io';
import app from './app.js';
import { config } from './config/index.js';
import logger from './utils/logger.js';
import { initSockets } from './sockets/index.js';
import { startCronJobs } from './cron/index.js';
import { socketCorsOrigin } from './utils/corsOrigins.js';
import { startMqttConsumer, stopMqttConsumer } from './mqtt/consumer.js';
import { backfillAllTwins } from './services/digitalTwinService.js';

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: socketCorsOrigin,
    credentials: true,
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

const host = process.env.HOST || '0.0.0.0';
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    logger.error(`Port ${config.port} is already in use on ${host}.`, { err: err.message });
    process.exit(1);
  }
  logger.error('Server error', { err: err.message });
  process.exit(1);
});

server.listen(config.port, host, async () => {
  logger.info(`FleetNimble API running on http://${host}:${config.port}`);
  logger.info(`Environment: ${config.env}`);
  if (config.mqtt.enabled) {
    logger.info('MQTT telematics ingest enabled');
  }

  // Backfill any vehicles without a digital twin, then start simulator
  try {
    const created = await backfillAllTwins();
    logger.info('Digital twin backfill complete', { created });
  } catch (err) {
    logger.error('Digital twin backfill failed', { err: err.message });
  }

  // Telemetry generation is handled by the cron scheduler in src/cron/index.js.
});

process.on('SIGTERM', () => {
  stopMqttConsumer();
  server.close(() => process.exit(0));
});
