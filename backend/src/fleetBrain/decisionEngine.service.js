import logger from '../utils/logger.js';
import { emitToUser } from '../utils/socketHub.js';

/**
 * Fleet Brain Decision Engine.
 * Maps planner outputs (requiredTools) to concrete operations. The LLM/Gemini
 * never selects tools directly — it asks the brain, and the brain decides and
 * executes through existing services.
 */

const TOOL_CAPABILITIES = Object.freeze({
  search_knowledge: { label: 'Search knowledge base', executor: 'executeSearchKnowledge' },
  lookup_crm: { label: 'Look up CRM customer', executor: 'executeLookupCrm' },
  create_appointment: { label: 'Create appointment', executor: 'executeCreateAppointment' },
  create_ticket: { label: 'Create support ticket', executor: 'executeCreateTicket' },
  update_crm: { label: 'Update CRM customer', executor: 'executeUpdateCrm' },
  transfer_to_human: { label: 'Transfer to human', executor: 'executeTransferToHuman' },
  schedule_follow_up: { label: 'Schedule follow-up', executor: 'executeScheduleFollowUp' },
  query_fleet: { label: 'Query fleet intelligence', executor: 'executeQueryFleet' },
  run_analytics: { label: 'Run analytics', executor: 'executeRunAnalytics' },
  generate_insights: { label: 'Generate business insights', executor: 'executeGenerateInsights' },
});

const decisions = [];
const MAX_DECISIONS = 200;

export function decide({ userId, callId = null, plan = null, message = '', context = {} }) {
  const requiredTools = plan?.requiredTools || [];
  const decisionsForTurn = requiredTools
    .filter(tool => TOOL_CAPABILITIES[tool])
    .map(tool => ({
      tool,
      label: TOOL_CAPABILITIES[tool].label,
      reason: plan?.currentGoal || 'required by plan',
    }));

  const record = {
    id: `dec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    userId,
    callId,
    intent: plan?.intent || context.conversation?.intent || null,
    skill: plan?.skill || null,
    decisions: decisionsForTurn,
    at: new Date().toISOString(),
  };

  decisions.unshift(record);
  if (decisions.length > MAX_DECISIONS) decisions.length = MAX_DECISIONS;

  emitToUser(userId, 'fleetbrain.decision', record);
  logger.info('FLEET_BRAIN_DECISION', { userId, callId, intent: record.intent, tools: decisionsForTurn.map(d => d.tool) });
  return record;
}

export async function executeTool({ userId, callId = null, tool, args = {}, context = {} }) {
  const capability = TOOL_CAPABILITIES[tool];
  if (!capability) {
    logger.warn('FLEET_BRAIN_TOOL_UNKNOWN', { userId, tool });
    return { tool, ok: false, reason: 'unknown_tool' };
  }

  const start = Date.now();
  try {
    const result = await TOOL_EXECUTORS[capability.executor]({ userId, callId, args, context });
    emitToUser(userId, 'fleetbrain.tool', {
      tool,
      status: 'completed',
      durationMs: Date.now() - start,
      at: new Date().toISOString(),
    });
    return { tool, ok: true, durationMs: Date.now() - start, result };
  } catch (err) {
    logger.warn('FLEET_BRAIN_TOOL_FAILED', { userId, tool, error: err.message });
    emitToUser(userId, 'fleetbrain.tool', {
      tool,
      status: 'failed',
      durationMs: Date.now() - start,
      at: new Date().toISOString(),
    });
    return { tool, ok: false, durationMs: Date.now() - start, reason: err.message };
  }
}

async function executeSearchKnowledge({ args }) {
  const query = String(args.query || args.message || '').trim();
  if (!query) return { results: [] };
  const { searchKnowledgeBase } = await import('../services/aiKnowledgeBase.js');
  const results = searchKnowledgeBase(query);
  return { results: (results || []).slice(0, 5) };
}

async function executeLookupCrm({ userId, args }) {
  const prisma = (await import('../utils/prisma.js')).default;
  const phone = String(args.phone || args.callerPhone || '').replace(/[^\d+]/g, '');
  const email = args.email || null;
  if (!phone && !email) return { customer: null };
  const customer = await prisma.receptionistCustomer.findFirst({
    where: {
      userId,
      OR: [
        ...(phone ? [{ phone }] : []),
        ...(email ? [{ email }] : []),
      ],
    },
  });
  return { customer };
}

async function executeCreateAppointment({ userId, callId, args, context }) {
  const orchestrator = await import('../services/receptionistOrchestrator.service.js');
  const a = args.appointment || args;
  const session = {
    userId,
    companyId: args.companyId || context.companyId || null,
    callId,
    callerPhone: a.callerPhone || context.crm?.phone || null,
    collectedData: {
      preferredDate: a.scheduledDate || a.preferredDate || null,
      preferredTime: a.scheduledTime || a.preferredTime || null,
      callerName: a.callerName || context.crm?.name || 'Caller',
      phone: a.callerPhone || context.crm?.phone || null,
      email: a.callerEmail || context.crm?.email || null,
      company: a.companyName || context.crm?.companyName || null,
      fleetSize: a.fleetSize || context.crm?.fleetSize || null,
      meetingPurpose: a.meetingPurpose || 'Demo',
      durationMinutes: a.durationMinutes || 30,
      timezone: a.timezone || null,
    },
  };
  const result = await orchestrator.executeAppointmentCreation(session);
  return { appointment: result?.actionResult || (result?.success ? { id: result.appointmentId || null } : null), reply: result?.reply || null };
}

async function executeCreateTicket({ userId, callId, args, context }) {
  const orchestrator = await import('../services/receptionistOrchestrator.service.js');
  const session = {
    userId,
    companyId: args.companyId || context.companyId || null,
    callId,
    collectedData: {
      callerName: args.callerName || context.crm?.name || 'Caller',
      phone: args.callerPhone || context.crm?.phone || null,
      email: args.callerEmail || context.crm?.email || null,
      company: args.companyName || context.crm?.companyName || null,
      issue: args.issueTitle || args.issue || 'Support request',
      urgency: args.severity || 'MEDIUM',
    },
  };
  const result = await orchestrator.executeSupportTicketCreation(session);
  return { ticket: result?.actionResult || null, reply: result?.reply || null };
}

async function executeUpdateCrm({ userId, callId, args, context }) {
  const prisma = (await import('../utils/prisma.js')).default;
  const customerId = args.customerId || context.crm?.customerId || null;
  if (!customerId) return { customer: null };
  const data = {
    ...(args.name ? { name: args.name } : {}),
    ...(args.email ? { email: args.email } : {}),
    ...(args.phone ? { phone: args.phone } : {}),
    ...(args.companyName ? { companyName: args.companyName } : {}),
    ...(args.fleetSize != null ? { fleetSize: args.fleetSize } : {}),
    ...(args.leadScore != null ? { leadScore: args.leadScore } : {}),
    ...(args.salesStage ? { salesStage: args.salesStage } : {}),
    ...(args.metadata ? { metadata: args.metadata } : {}),
  };
  if (Object.keys(data).length === 0) return { customer: null };
  const customer = await prisma.receptionistCustomer.update({ where: { id: customerId }, data });
  return { customer };
}

async function executeTransferToHuman({ userId, callId, args }) {
  const { emitToUser } = await import('../utils/socketHub.js');
  emitToUser(userId, 'call.escalated', {
    callSid: callId || args.callSid || null,
    reason: args.reason || 'Fleet Brain decision engine: transfer to human',
    timestamp: new Date().toISOString(),
  });
  return { transferred: true, reason: args.reason || 'transferred' };
}

async function executeScheduleFollowUp({ userId, callId, args, context }) {
  const followUp = await import('../services/followUp.service.js');
  const appointment = args.appointment || context.appointment?.appointment || null;
  if (!appointment) return { followUps: [] };
  const result = await followUp.createFollowUpBundle({
    userId,
    callId,
    customerId: args.customerId || context.crm?.customerId || null,
    appointment,
  });
  return { followUps: result?.created || [] };
}

async function executeQueryFleet({ userId, args }) {
  const fleetIntelligence = await import('./fleetIntelligence.service.js');
  return fleetIntelligence.answerFleetQuery({ userId, query: args.query || args.message || '' });
}

async function executeRunAnalytics({ userId, args }) {
  const businessIntelligence = await import('./businessIntelligence.service.js');
  return businessIntelligence.getBusinessIntelligenceSnapshot(userId, { days: args.days || 30 });
}

async function executeGenerateInsights({ userId, args }) {
  const businessIntelligence = await import('./businessIntelligence.service.js');
  return businessIntelligence.generateBusinessInsights(userId, { days: args.days || 30 });
}

const TOOL_EXECUTORS = {
  executeSearchKnowledge,
  executeLookupCrm,
  executeCreateAppointment,
  executeCreateTicket,
  executeUpdateCrm,
  executeTransferToHuman,
  executeScheduleFollowUp,
  executeQueryFleet,
  executeRunAnalytics,
  executeGenerateInsights,
};

export function getRecentDecisions(userId = null, { limit = 25 } = {}) {
  const filtered = userId ? decisions.filter(d => d.userId === userId) : decisions;
  return filtered.slice(0, limit);
}

export function getToolCapabilities() {
  return TOOL_CAPABILITIES;
}
