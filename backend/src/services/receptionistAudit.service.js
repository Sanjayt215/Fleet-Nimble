import logger from '../utils/logger.js';
import prisma from '../utils/prisma.js';

export async function logCallEvent(userId, eventType, data = {}) {
  const logData = {
    userId,
    eventType,
    ...data,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  };

  logger.info('RECEPTIONIST_AUDIT', logData);

  try {
    await prisma.aiReceptionistAuditLog.create({
      data: {
        userId,
        eventType,
        metadata: data,
        ipAddress: data.ipAddress || null,
        userAgent: data.userAgent || null,
      },
    }).catch(() => {});
  } catch (err) {
    logger.warn('AUDIT_LOG_WRITE_FAILED', { error: err.message });
  }
}

export async function getAuditLogs(userId, { page = 1, limit = 20, eventType }) {
  const where = { userId };
  if (eventType) where.eventType = eventType;

  try {
    const [total, logs] = await Promise.all([
      prisma.aiReceptionistAuditLog.count({ where }),
      prisma.aiReceptionistAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { logs: logs || [], total, page, totalPages: Math.ceil(total / limit) };
  } catch {
    return { logs: [], total: 0, page: 1, totalPages: 1 };
  }
}

export function logToolCall(userId, tool, input, output, durationMs) {
  logger.info('TOOL_CALL', {
    userId,
    tool,
    input: typeof input === 'string' ? input.substring(0, 200) : JSON.stringify(input).substring(0, 200),
    output: typeof output === 'string' ? output.substring(0, 200) : 'success',
    durationMs,
  });
}

export function logPerformance(userId, action, durationMs, success = true) {
  logger.info('PERF_METRIC', {
    userId,
    action,
    durationMs,
    success,
    timestamp: new Date().toISOString(),
  });
}
