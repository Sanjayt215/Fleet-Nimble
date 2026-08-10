import logger from '../utils/logger.js';
import { recordTimelineEvent, TIMELINE_EVENT_TYPES } from '../services/conversationTimeline.service.js';

export const CALL_LOG_EVENTS = Object.freeze({
  CALL_STARTED: 'CALL_STARTED',
  INTENT_DETECTED: 'INTENT_DETECTED',
  KNOWLEDGE_RETRIEVED: 'KNOWLEDGE_RETRIEVED',
  TOOL_STARTED: 'TOOL_STARTED',
  TOOL_COMPLETED: 'TOOL_COMPLETED',
  CRM_UPDATED: 'CRM_UPDATED',
  SUMMARY_CREATED: 'SUMMARY_CREATED',
  CALL_COMPLETED: 'CALL_COMPLETED',
});

const TIMELINE_MAP = Object.freeze({
  CALL_STARTED: TIMELINE_EVENT_TYPES.CALL_STARTED,
  INTENT_DETECTED: TIMELINE_EVENT_TYPES.INTENT_DETECTED,
  KNOWLEDGE_RETRIEVED: TIMELINE_EVENT_TYPES.KNOWLEDGE_SEARCHED,
  TOOL_STARTED: TIMELINE_EVENT_TYPES.TOOL_STARTED,
  TOOL_COMPLETED: TIMELINE_EVENT_TYPES.TOOL_COMPLETED,
  CRM_UPDATED: TIMELINE_EVENT_TYPES.CRM_UPDATED,
  SUMMARY_CREATED: TIMELINE_EVENT_TYPES.SUMMARY_CREATED,
  CALL_COMPLETED: TIMELINE_EVENT_TYPES.CALL_COMPLETED,
});

function syncLevel(event) {
  if (event === CALL_LOG_EVENTS.TOOL_STARTED || event === CALL_LOG_EVENTS.TOOL_COMPLETED) return 'info';
  return 'info';
}

export async function logCallEvent(event, { userId = null, callId = null, callSid = null, timeline = true, data = {} }) {
  logger[syncLevel(event)](event, { callSid, callId, userId, ...data });
  if (timeline && callId && TIMELINE_MAP[event]) {
    try {
      await recordTimelineEvent({
        userId,
        callId,
        callSid,
        eventType: TIMELINE_MAP[event],
        data,
      });
    } catch (err) {
      logger.warn('CALL_AUDIT_TIMELINE_FAILED', { event, callId, error: err.message });
    }
  }
}

export async function logCallStarted({ userId, callId, callSid, data = {} }) {
  return logCallEvent(CALL_LOG_EVENTS.CALL_STARTED, { userId, callId, callSid, data });
}

export async function logIntentDetected({ userId, callId, callSid, intent, confidence = null, data = {} }) {
  return logCallEvent(CALL_LOG_EVENTS.INTENT_DETECTED, {
    userId, callId, callSid,
    data: { intent, confidence, ...data },
  });
}

export async function logKnowledgeRetrieved({ userId, callId, callSid, query, found = false, data = {} }) {
  return logCallEvent(CALL_LOG_EVENTS.KNOWLEDGE_RETRIEVED, {
    userId, callId, callSid,
    data: { query, found, ...data },
  });
}

export async function logToolStarted({ userId, callId, callSid, tool, args = {}, data = {} }) {
  return logCallEvent(CALL_LOG_EVENTS.TOOL_STARTED, {
    userId, callId, callSid,
    data: { tool, args, ...data },
  });
}

export async function logToolCompleted({ userId, callId, callSid, tool, success = true, durationMs = null, error = null, data = {} }) {
  return logCallEvent(CALL_LOG_EVENTS.TOOL_COMPLETED, {
    userId, callId, callSid,
    data: { tool, success, durationMs, error: error || null, ...data },
  });
}

export async function logCrmUpdated({ userId, callId, callSid, customerId = null, operation = 'update', data = {} }) {
  return logCallEvent(CALL_LOG_EVENTS.CRM_UPDATED, {
    userId, callId, callSid,
    data: { customerId, operation, ...data },
  });
}

export async function logSummaryCreated({ userId, callId, callSid, summaryType = 'call', data = {} }) {
  return logCallEvent(CALL_LOG_EVENTS.SUMMARY_CREATED, {
    userId, callId, callSid,
    data: { summaryType, ...data },
  });
}

export async function logCallCompleted({ userId, callId, callSid, status = 'COMPLETED', data = {} }) {
  return logCallEvent(CALL_LOG_EVENTS.CALL_COMPLETED, {
    userId, callId, callSid,
    data: { status, ...data },
  });
}
