import prisma from '../utils/prisma.js';

const DEDUP_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Idempotency guard for MQTT telemetry (at-least-once QoS 1 delivery).
 */
export async function isDuplicateMessage(messageId, vehicleId) {
  if (!messageId) return false;

  const existing = await prisma.telemetryDedup.findUnique({ where: { messageId } });
  if (existing) return true;

  try {
    await prisma.telemetryDedup.create({
      data: {
        messageId,
        vehicleId,
        expiresAt: new Date(Date.now() + DEDUP_TTL_MS),
      },
    });
    return false;
  } catch (err) {
    if (err.code === 'P2002') return true;
    throw err;
  }
}

export async function purgeExpiredDedup() {
  const result = await prisma.telemetryDedup.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return result.count;
}
