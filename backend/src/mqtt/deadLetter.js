import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import { config } from '../config/index.js';

/**
 * Persist failed MQTT messages for retry (dead-letter queue).
 */
export async function enqueueDeadLetter(topic, payload, error, retryCount = 0) {
  const maxRetries = config.mqtt.maxRetries;
  const delayMs = Math.min(60_000, 1000 * 2 ** retryCount);

  const record = await prisma.mqttDeadLetter.create({
    data: {
      topic,
      payload: typeof payload === 'object' ? payload : { raw: String(payload) },
      error: String(error?.message || error).slice(0, 2000),
      retryCount,
      maxRetries,
      nextRetryAt: retryCount < maxRetries ? new Date(Date.now() + delayMs) : null,
      status: retryCount >= maxRetries ? 'FAILED' : 'PENDING',
    },
  });

  logger.warn('MQTT message dead-lettered', {
    id: record.id,
    topic,
    retryCount,
    status: record.status,
  });

  return record;
}

export async function fetchRetryBatch(limit = 50) {
  return prisma.mqttDeadLetter.findMany({
    where: {
      status: 'PENDING',
      nextRetryAt: { lte: new Date() },
    },
    orderBy: { nextRetryAt: 'asc' },
    take: limit,
  });
}

export async function markDeadLetterProcessed(id) {
  await prisma.mqttDeadLetter.update({
    where: { id },
    data: { status: 'PROCESSED', updatedAt: new Date() },
  });
}

export async function markDeadLetterRetry(id, error, retryCount) {
  const maxRetries = config.mqtt.maxRetries;
  const delayMs = Math.min(60_000, 1000 * 2 ** retryCount);

  await prisma.mqttDeadLetter.update({
    where: { id },
    data: {
      retryCount,
      error: String(error?.message || error).slice(0, 2000),
      nextRetryAt: retryCount < maxRetries ? new Date(Date.now() + delayMs) : null,
      status: retryCount >= maxRetries ? 'FAILED' : 'PENDING',
      updatedAt: new Date(),
    },
  });
}

export async function purgeOldDeadLetters(days = 30) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const result = await prisma.mqttDeadLetter.deleteMany({
    where: {
      status: { in: ['PROCESSED', 'FAILED'] },
      updatedAt: { lt: cutoff },
    },
  });
  return result.count;
}
