import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import { buildForwardCallTwiML } from './twilioWebhook.service.js';

export async function escalateCall(callLogId, reason, department = 'support') {
  try {
    const call = await prisma.aiReceptionistCall.findUnique({
      where: { id: callLogId },
      include: { user: true },
    });
    if (!call) {
      logger.warn('ESCALATE_CALL_NOT_FOUND', { callLogId });
      return null;
    }

    const config = await prisma.aiReceptionistConfig.findUnique({
      where: { userId: call.userId },
    });

    const handoffNumber = resolveHandoffNumber(department, config);

    const updated = await prisma.aiReceptionistCall.update({
      where: { id: callLogId },
      data: {
        callStatus: 'ESCALATED',
        escalatedAt: new Date(),
        handoffReason: reason,
        handoffTo: handoffNumber || 'team',
      },
    });

    logger.info('CALL_ESCALATED', {
      callLogId,
      reason,
      department,
      handoffNumber: handoffNumber || 'none',
    });

    return {
      call: updated,
      handoffNumber,
      twiml: handoffNumber ? buildForwardCallTwiML(handoffNumber, call.twilioTo || '') : null,
    };
  } catch (err) {
    logger.error('ESCALATE_CALL_ERROR', { callLogId, error: err.message });
    return null;
  }
}

export async function getEscalatedCalls(userId, limit = 20) {
  return prisma.aiReceptionistCall.findMany({
    where: { userId, callStatus: 'ESCALATED' },
    orderBy: { escalatedAt: 'desc' },
    take: limit,
    include: {
      appointment: { select: { id: true, meetingTitle: true, status: true } },
      supportTicket: { select: { id: true, issueTitle: true, status: true } },
    },
  });
}

function resolveHandoffNumber(department, config) {
  if (!config) return null;
  switch (department) {
    case 'sales':
      return config.salesHandoffNumber || config.escalationPhone || null;
    case 'support':
      return config.supportHandoffNumber || config.escalationPhone || null;
    case 'emergency':
      return config.emergencyHandoffNumber || config.escalationPhone || null;
    default:
      return config.escalationPhone || null;
  }
}

export function checkEscalationTriggers(intent, sentiment, confidence = 1.0) {
  const triggers = [];

  if (intent === 'emergency_escalation') {
    triggers.push({ reason: 'Emergency situation detected', department: 'emergency', priority: 1 });
  }

  if (confidence < 0.4) {
    triggers.push({ reason: 'Low AI confidence', department: 'support', priority: 2 });
  }

  if (sentiment === 'angry' || sentiment === 'frustrated') {
    triggers.push({ reason: `Caller sentiment: ${sentiment}`, department: 'support', priority: 3 });
  }

  triggers.sort((a, b) => a.priority - b.priority);
  return triggers;
}