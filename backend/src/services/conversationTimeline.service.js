import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import { emitToUser } from '../utils/socketHub.js';
import { isPersistenceAvailable } from './receptionistTenantResolver.service.js';

export const TIMELINE_EVENT_TYPES = Object.freeze({
  CALL_STARTED: 'CALL_STARTED',
  GREETING_SENT: 'GREETING_SENT',
  INTENT_DETECTED: 'INTENT_DETECTED',
  KNOWLEDGE_SEARCHED: 'KNOWLEDGE_SEARCHED',
  LEAD_QUALIFIED: 'LEAD_QUALIFIED',
  TOOL_STARTED: 'TOOL_STARTED',
  TOOL_COMPLETED: 'TOOL_COMPLETED',
  APPOINTMENT_CONFIRMED: 'APPOINTMENT_CONFIRMED',
  SUPPORT_TICKET_CREATED: 'SUPPORT_TICKET_CREATED',
  CRM_UPDATED: 'CRM_UPDATED',
  SUMMARY_CREATED: 'SUMMARY_CREATED',
  MEMORY_UPDATED: 'MEMORY_UPDATED',
  FSM_TRANSITION: 'FSM_TRANSITION',
  AGENT_RUN_STARTED: 'AGENT_RUN_STARTED',
  AGENT_RUN_COMPLETED: 'AGENT_RUN_COMPLETED',
  SUPERVISOR_RETRY: 'SUPERVISOR_RETRY',
  SUPERVISOR_RECOVERED: 'SUPERVISOR_RECOVERED',
  FLEET_BRAIN_PLAN: 'FLEET_BRAIN_PLAN',
  FLEET_BRAIN_WORKFLOW: 'FLEET_BRAIN_WORKFLOW',
  FLEET_BRAIN_LEARNED: 'FLEET_BRAIN_LEARNED',
  CALL_COMPLETED: 'CALL_COMPLETED',
});

const DEFAULT_LABELS = Object.freeze({
  CALL_STARTED: 'Call started',
  GREETING_SENT: 'Greeting sent',
  INTENT_DETECTED: 'Intent detected',
  KNOWLEDGE_SEARCHED: 'Knowledge search',
  LEAD_QUALIFIED: 'Lead qualified',
  TOOL_STARTED: 'Tool started',
  TOOL_COMPLETED: 'Tool completed',
  APPOINTMENT_CONFIRMED: 'Appointment confirmed',
  SUPPORT_TICKET_CREATED: 'Support ticket created',
  CRM_UPDATED: 'CRM updated',
  SUMMARY_CREATED: 'Summary generated',
  MEMORY_UPDATED: 'Memory updated',
  FSM_TRANSITION: 'FSM transition',
  AGENT_RUN_STARTED: 'Agent run started',
  AGENT_RUN_COMPLETED: 'Agent run completed',
  SUPERVISOR_RETRY: 'Retrying failed operation',
  SUPERVISOR_RECOVERED: 'Operation recovered',
  FLEET_BRAIN_PLAN: 'Fleet Brain plan',
  FLEET_BRAIN_WORKFLOW: 'Fleet Brain workflow',
  FLEET_BRAIN_LEARNED: 'Fleet Brain learned',
  CALL_COMPLETED: 'Call completed',
});

const MAX_LIVE_EVENTS_PER_CALL = 500;
const MAX_LIVE_CALLS = 200;

const liveTimelines = new Map();

export function getLiveTimeline(callId) {
  return liveTimelines.get(callId) || [];
}

export function getAllLiveTimelines() {
  return Array.from(liveTimelines.entries()).map(([callId, events]) => ({ callId, events }));
}

export async function recordTimelineEvent({ userId, callId, callSid = null, eventType, label = null, data = {}, persist = true }) {
  const entry = {
    id: null,
    callId,
    callSid,
    userId,
    eventType,
    label: label || DEFAULT_LABELS[eventType] || eventType,
    data: data || {},
    at: new Date().toISOString(),
  };

  const existing = liveTimelines.get(callId);
  if (existing) {
    existing.push(entry);
    if (existing.length > MAX_LIVE_EVENTS_PER_CALL) existing.shift();
  } else {
    if (liveTimelines.size >= MAX_LIVE_CALLS && !liveTimelines.has(callId)) {
      const oldestKey = liveTimelines.keys().next().value;
      if (oldestKey) liveTimelines.delete(oldestKey);
    }
    liveTimelines.set(callId, [entry]);
  }

  emitToUser(userId, 'timeline.event', entry);

  if (persist && callId && isPersistenceAvailable()) {
    try {
      const created = await prisma.conversationTimelineEvent.create({
        data: {
          callId,
          callSid,
          userId,
          eventType,
          label: entry.label,
          data,
        },
        select: { id: true, at: true },
      });
      entry.id = created.id;
      entry.at = created.at.toISOString();
      return entry;
    } catch (err) {
      logger.warn('TIMELINE_EVENT_PERSIST_FAILED', { callId, eventType, error: err.message });
    }
  }

  return entry;
}

export async function getTimelineByCall(userId, callId) {
  const live = getLiveTimeline(callId);
  if (live.length > 0 && !isPersistenceAvailable()) {
    return live;
  }
  try {
    const events = await prisma.conversationTimelineEvent.findMany({
      where: { callId, userId },
      orderBy: { at: 'asc' },
    });
    if (events.length > 0) return events;
  } catch (err) {
    logger.warn('TIMELINE_QUERY_FAILED', { callId, error: err.message });
  }
  return live;
}

export async function getTimelinesByUser(userId, { limit = 50, callId = null } = {}) {
  const where = { userId };
  if (callId) where.callId = callId;
  try {
    const events = await prisma.conversationTimelineEvent.findMany({
      where,
      orderBy: { at: 'desc' },
      take: limit,
    });
    return events;
  } catch (err) {
    logger.warn('TIMELINES_QUERY_FAILED', { userId, error: err.message });
    return [];
  }
}

export async function clearLiveTimeline(callId) {
  liveTimelines.delete(callId);
}

export async function getTimelineStats(userId = null) {
  let entries = liveTimelines.values();
  if (userId) {
    const mine = [];
    for (const list of liveTimelines.values()) {
      for (const e of list) {
        if (e.userId === userId) mine.push(e);
      }
    }
    entries = [mine];
  }
  return {
    liveCalls: userId ? 0 : liveTimelines.size,
    events: Array.from(entries).reduce((sum, list) => sum + list.length, 0),
  };
}
