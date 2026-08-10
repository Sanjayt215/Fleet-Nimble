import logger from '../utils/logger.js';
import { config } from '../config/index.js';
import { emitToUser } from '../utils/socketHub.js';
import { getLiveTimeline } from '../services/conversationTimeline.service.js';

/**
 * Fleet Brain Context Engine.
 * Builds sub-contexts (conversation, CRM, fleet, knowledge, appointment,
 * support, sales) and merges them into a unified AI context. Contexts are
 * cached per userId with a TTL so repeated planning does not hammer the DB.
 */

const contexts = new Map();

export function buildConversationContext({ conversation = {}, transcriptEntries = [], timelineEvents = [] } = {}) {
  const lastTurns = Array.isArray(transcriptEntries) ? transcriptEntries.slice(-6) : [];
  const lastMessage = lastTurns.length > 0 ? lastTurns[lastTurns.length - 1]?.content || null : conversation.message || null;
  return {
    currentUtterance: conversation.message || null,
    lastMessage,
    intent: conversation.intent || null,
    stage: conversation.stage || 'IDLE',
    turnCount: conversation.turnCount || (Array.isArray(transcriptEntries) ? transcriptEntries.length : 0),
    lastTurns: lastTurns.map(t => ({ role: t.role, content: t.content, timestamp: t.timestamp })),
    keyFacts: conversation.keyFacts || [],
    unresolved: conversation.unresolved || [],
    timelineEventCount: Array.isArray(timelineEvents) ? timelineEvents.length : 0,
  };
}

export function buildCrmContext({ customer = null, crmData = {} } = {}) {
  return {
    customerId: customer?.id || crmData.customerId || null,
    name: customer?.name || null,
    companyName: customer?.companyName || null,
    phone: customer?.phone || null,
    email: customer?.email || null,
    fleetSize: customer?.fleetSize ?? null,
    status: customer?.status || null,
    leadScore: customer?.leadScore ?? null,
    salesStage: customer?.salesStage || null,
    tags: customer?.tags || [],
    notes: (customer?.notes || crmData.notes || []).map(n => n.content).slice(-5),
  };
}

export function buildFleetContext({ fleet = {}, vehicle = null, alerts = [], maintenance = [], kpis = {} } = {}) {
  const alertList = Array.isArray(alerts) ? alerts.slice(0, 10) : [];
  const maintenanceList = Array.isArray(maintenance) ? maintenance.slice(0, 10) : [];
  return {
    vehicleCount: fleet.vehicleCount ?? null,
    activeVehicles: fleet.activeVehicles ?? null,
    vehicle: vehicle ? { id: vehicle.id, name: vehicle.name, plateNumber: vehicle.plateNumber, status: vehicle.status } : null,
    alerts: alertList,
    openAlerts: alertList.length,
    maintenance: maintenanceList,
    maintenanceDue: maintenanceList.length,
    kpis,
  };
}

export function buildKnowledgeContext({ coveredTopics = [], lastAnswer = null, confidence = null } = {}) {
  return {
    coveredTopics: Array.isArray(coveredTopics) ? coveredTopics : [],
    lastAnswer,
    confidence,
    needsSearch: !lastAnswer && !(Array.isArray(coveredTopics) && coveredTopics.length > 0),
  };
}

export function buildAppointmentContext({ scheduled = false, appointment = null, slots = [] } = {}) {
  return {
    scheduled,
    appointment: appointment ? {
      id: appointment.id,
      scheduledDate: appointment.scheduledDate,
      durationMinutes: appointment.durationMinutes,
      status: appointment.status,
      meetingLink: appointment.meetingLink || null,
    } : null,
    slots: Array.isArray(slots) ? slots.slice(0, 5) : [],
  };
}

export function buildSupportContext({ ticketCreated = false, ticket = null, severity = null } = {}) {
  return {
    ticketCreated,
    ticket: ticket ? { id: ticket.id, issueTitle: ticket.issueTitle, status: ticket.status, urgency: ticket.urgency } : null,
    severity,
  };
}

export function buildSalesContext({ leadScore = null, qualified = false, stage = null, buyingSignals = [] } = {}) {
  return {
    leadScore,
    qualified,
    stage,
    buyingSignals: Array.isArray(buyingSignals) ? buyingSignals : [],
  };
}

export async function buildUnifiedContext({ userId, companyId = null, parts = {} } = {}) {
  const timelineEvents = parts.timelineEvents || (userId && parts.callId ? getLiveTimeline(parts.callId) : []);
  const unified = {
    userId,
    companyId,
    builtAt: new Date().toISOString(),
    conversation: buildConversationContext({
      conversation: parts.conversation,
      transcriptEntries: parts.transcriptEntries,
      timelineEvents,
    }),
    crm: buildCrmContext({ customer: parts.customer, crmData: parts.crmData }),
    fleet: buildFleetContext({
      fleet: parts.fleet,
      vehicle: parts.vehicle,
      alerts: parts.alerts,
      maintenance: parts.maintenance,
      kpis: parts.fleetKpis,
    }),
    knowledge: buildKnowledgeContext({
      coveredTopics: parts.coveredTopics,
      lastAnswer: parts.lastAnswer,
      confidence: parts.knowledgeConfidence,
    }),
    appointment: buildAppointmentContext({ scheduled: parts.appointmentScheduled, appointment: parts.appointment, slots: parts.slots }),
    support: buildSupportContext({ ticketCreated: parts.ticketCreated, ticket: parts.ticket, severity: parts.severity }),
    sales: buildSalesContext({
      leadScore: parts.leadScore,
      qualified: parts.qualified,
      stage: parts.salesStage,
      buyingSignals: parts.buyingSignals,
    }),
  };

  if (userId) {
    contexts.set(userId, { context: unified, cachedAt: Date.now() });
    if (contexts.size > config.fleetBrain.maxContexts) {
      const oldest = contexts.keys().next().value;
      if (oldest) contexts.delete(oldest);
    }
    emitToUser(userId, 'fleetbrain.context', { userId, context: unified });
  }

  return unified;
}

export function getCachedContext(userId, { maxAgeMs = null } = {}) {
  if (!userId) return null;
  const cached = contexts.get(userId);
  if (!cached) return null;
  const ttl = maxAgeMs || config.fleetBrain.contextTtlMs;
  if (Date.now() - cached.cachedAt > ttl) {
    contexts.delete(userId);
    return null;
  }
  return cached.context;
}

export async function getContext(userId, { useCache = true, maxAgeMs = null } = {}) {
  if (useCache) {
    const cached = getCachedContext(userId, { maxAgeMs });
    if (cached) return cached;
  }
  return null;
}

export function getContextStats() {
  return {
    cachedContexts: contexts.size,
  };
}

export function clearContext(userId) {
  if (userId) contexts.delete(userId);
  return true;
}

export function summarizeContext(context) {
  if (!context) return null;
  return {
    intent: context.conversation?.intent || null,
    stage: context.conversation?.stage || null,
    turnCount: context.conversation?.turnCount || 0,
    customer: context.crm?.name || null,
    company: context.crm?.companyName || null,
    leadScore: context.sales?.leadScore ?? null,
    vehicleCount: context.fleet?.vehicleCount ?? null,
    activeVehicles: context.fleet?.activeVehicles ?? null,
    alertCount: context.fleet?.openAlerts || 0,
    maintenanceDue: context.fleet?.maintenanceDue || 0,
    knowledgeNeedsSearch: context.knowledge?.needsSearch || false,
    appointmentScheduled: context.appointment?.scheduled || false,
    ticketCreated: context.support?.ticketCreated || false,
    missingInformation: context.conversation?.unresolved || [],
  };
}

export function mergeTimelineIntoContext(context, timelineEvents) {
  if (!context || !Array.isArray(timelineEvents)) return context;
  return {
    ...context,
    conversation: {
      ...context.conversation,
      timelineEventCount: timelineEvents.length,
    },
  };
}
