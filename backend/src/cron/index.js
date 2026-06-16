import cron from 'node-cron';
import { checkMaintenanceDue } from '../services/alertEngine.js';
import { markStaleTelemetry, purgeOldTelemetry } from '../services/obdIngest.js';
import { purgeExpiredDedup } from '../mqtt/deduplication.js';
import { purgeOldDeadLetters, fetchRetryBatch, markDeadLetterProcessed, markDeadLetterRetry } from '../mqtt/deadLetter.js';
import { handleMqttMessage } from '../mqtt/handlers/telemetryHandler.js';
import { markStaleMqttDevices } from '../services/deviceAuthService.js';
import logger from '../utils/logger.js';

export function startCronJobs(app) {
  const getIo = () => app?.get?.('io');

  cron.schedule('0 8 * * *', async () => {
    try {
      const count = await checkMaintenanceDue();
      logger.info('Maintenance cron completed', { alertsChecked: count });
    } catch (err) {
      logger.error('Maintenance cron failed', { err: err.message });
    }
  });

  // Heartbeat: mark vehicles offline if no telemetry in 30s
  cron.schedule('*/30 * * * * *', async () => {
    try {
      const io = getIo();
      const count = await markStaleTelemetry(io);
      if (count > 0) logger.debug('Stale telemetry marked offline', { count });
    } catch (err) {
      logger.error('Stale telemetry cron failed', { err: err.message });
    }
  });

  // Vehicle simulator: generate realistic telemetry every 2 seconds
  // Disabled to stop random telemetry simulation.
  // cron.schedule('*/2 * * * * *', async () => {
  //   try {
  //     const io = getIo();
  //     await simulateLiveStateCycle(io);
  //   } catch (err) {
  //     logger.error('Telemetry simulator cron failed', { err: err.message });
  //   }
  // });

  // Real telemetry fallback is disabled to preserve only real telemetry sources.
  // cron.schedule('*/15 * * * * *', async () => {
  //   try {
  //     const io = getIo();
  //     const count = await markStaleRealLiveSources(io);
  //     if (count > 0) logger.debug('Stale REAL telemetry sources reverted', { count });
  //   } catch (err) {
  //     logger.error('Real telemetry fallback cron failed', { err: err.message });
  //   }
  // });

  // Daily retention purge (90 days default)
  cron.schedule('0 3 * * *', async () => {
    try {
      const days = parseInt(process.env.OBD_RETENTION_DAYS || '90', 10);
      const purged = await purgeOldTelemetry(days);
      const deduped = await purgeExpiredDedup();
      const dlqPurged = await purgeOldDeadLetters(30);
      logger.info('OBD telemetry purge completed', { purged, deduped, dlqPurged, days });
    } catch (err) {
      logger.error('OBD purge cron failed', { err: err.message });
    }
  });

  // MQTT dead-letter retry every minute
  cron.schedule('* * * * *', async () => {
    try {
      const io = getIo();
      const batch = await fetchRetryBatch(25);
      for (const row of batch) {
        try {
          await handleMqttMessage(row.topic, Buffer.from(JSON.stringify(row.payload)), io);
          await markDeadLetterProcessed(row.id);
        } catch (err) {
          await markDeadLetterRetry(row.id, err, row.retryCount + 1);
        }
      }
    } catch (err) {
      logger.error('MQTT DLQ retry cron failed', { err: err.message });
    }
  });

  // MQTT device heartbeat stale check every 60s
  cron.schedule('* * * * *', async () => {
    try {
      const io = getIo();
      await markStaleMqttDevices(io);
    } catch (err) {
      logger.error('MQTT heartbeat cron failed', { err: err.message });
    }
  });

  logger.info('Cron jobs started');
}
