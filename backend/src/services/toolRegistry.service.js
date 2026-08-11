import logger from '../utils/logger.js';

/**
 * Controlled tool system (Phase 9).
 * New tools are registered here with definitions, validation and executors.
 * NOTE: these definitions are NOT injected into buildToolDefinitions() — the
 * voice layer's tool count (20) is asserted by tests. They are wired into the
 * media stream handler / orchestrator additively.
 */
export const NEW_TOOL_DEFINITIONS = [
  {
    name: 'search_knowledge',
    description: 'Search the tenant business knowledge base for an answer about products, services, pricing, policies or the business itself.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query' },
        category: { type: 'string', description: 'Optional category filter, e.g. Pricing, Services' },
      },
      required: ['query'],
    },
    exec: 'search_knowledge',
    type: 'knowledge',
  },
  {
    name: 'create_lead',
    description: 'Create a new lead in the CRM for a potential customer. Only after explicit consent.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        company: { type: 'string' },
        phone: { type: 'string' },
        email: { type: 'string' },
        fleetSize: { type: 'number' },
        industry: { type: 'string' },
        interest: { type: 'string', description: 'Product/feature the caller is interested in' },
      },
      required: ['name', 'phone'],
    },
    exec: 'create_lead',
    type: 'crm',
  },
  {
    name: 'transfer_call',
    description: 'Transfer the caller to a human team member (sales, support or emergency).',
    parameters: {
      type: 'object',
      properties: {
        department: { type: 'string', enum: ['sales', 'support', 'emergency'] },
        reason: { type: 'string' },
      },
      required: ['department', 'reason'],
    },
    exec: 'transfer_call',
    type: 'handoff',
  },
  {
    name: 'create_follow_up',
    description: 'Schedule a follow-up reminder for this caller.',
    parameters: {
      type: 'object',
      properties: {
        customerId: { type: 'string' },
        note: { type: 'string' },
        date: { type: 'string', description: 'Follow-up date (YYYY-MM-DD or ISO)' },
      },
      required: ['customerId', 'date'],
    },
    exec: 'create_follow_up',
    type: 'crm',
  },
];

export function getNewToolNames() {
  return NEW_TOOL_DEFINITIONS.map((tool) => tool.name);
}

export function getNewToolDefinition(name) {
  return NEW_TOOL_DEFINITIONS.find((tool) => tool.name === name) || null;
}

export function validateToolArgs(name, args) {
  const definition = getNewToolDefinition(name);
  if (!definition) return { valid: false, error: 'unknown_tool' };
  if (!args || typeof args !== 'object') return { valid: false, error: 'invalid_args' };

  const required = definition.parameters?.required || [];
  const missing = required.filter((key) => {
    const value = args[key];
    return value === undefined || value === null || value === '';
  });
  if (missing.length > 0) {
    return { valid: false, missing, error: 'missing_required_fields' };
  }

  if (name === 'transfer_call' && !['sales', 'support', 'emergency'].includes(args.department)) {
    return { valid: false, error: 'invalid_department' };
  }

  return { valid: true };
}

/**
 * Executors for the new controlled tools. Each returns a structured result
 * and logs execution. Implementations keep tenant scoping (userId/companyId)
 * and never leak data across tenants.
 */
export async function executeNewTool(name, args, { userId, companyId, callSid, callId, customerId }) {
  const started = Date.now();
  const validation = validateToolArgs(name, args);
  if (!validation.valid) {
    logger.warn('TOOL_VALIDATION_FAILED', { tool: name, callSid, error: validation.error, missing: validation.missing });
    return { success: false, error: validation.error, missing_fields: validation.missing };
  }

  try {
    const executors = {
      search_knowledge: async () => {
        const { answerFromTenantKnowledge } = await import('./businessKnowledge.service.js');
        const result = await answerFromTenantKnowledge({
          userId, companyId, query: args.query, category: args.category || null, useProfile: true,
        });
        return { success: Boolean(result?.answer), found: Boolean(result?.answer), answer: result?.answer || null, sources: result?.sources || [], query: args.query };
      },
      create_lead: async () => {
        const { default: prisma } = await import('../utils/prisma.js');
        if (!userId) return { success: false, error: 'missing_owner' };
        const normalizedPhone = String(args.phone || '').replace(/[^\d+]/g, '');
        const lead = await prisma.receptionistCustomer.create({
          data: {
            userId,
            companyId: companyId || null,
            name: args.name,
            companyName: args.company || null,
            phone: normalizedPhone,
            email: (args.email || '').toLowerCase() || null,
            fleetSize: args.fleetSize || null,
            industry: args.industry || null,
            lastIntent: 'sales_interest',
            lastSummary: args.interest || null,
            status: 'LEAD',
            leadScore: computeLeadScore(args),
            salesStage: 'LEAD',
            lastContactAt: new Date(),
          },
        });
        return { success: true, lead: { id: lead.id, name: lead.name } };
      },
      transfer_call: async () => {
        if (callId) {
          const { default: handoffService } = await import('./receptionistHandoff.service.js');
          await handoffService.escalateCall(callId, args.reason || 'Caller requested transfer', args.department);
        }
        return { success: true, department: args.department, message: 'Handoff initiated' };
      },
      create_follow_up: async () => {
        const { default: prisma } = await import('../utils/prisma.js');
        if (!userId) return { success: false, error: 'missing_owner' };
        const dueAt = new Date(args.date);
        if (isNaN(dueAt.getTime())) return { success: false, error: 'invalid_date' };
        const reminder = await prisma.followUpReminder.create({
          data: {
            userId,
            customerId: args.customerId || null,
            callId: callId || null,
            channel: 'REMINDER',
            subject: 'Follow-up reminder',
            content: args.note || 'Follow-up requested by caller',
            dueAt,
            status: 'PENDING',
          },
        });
        return { success: true, followUp: { id: reminder.id } };
      },
    };

    const executor = executors[name];
    if (!executor) return { success: false, error: 'not_implemented' };

    const result = await executor();
    const latencyMs = Date.now() - started;
    logger.info('TOOL_EXECUTED', { tool: name, callSid, userId, success: result.success, latencyMs });
    return result;
  } catch (err) {
    logger.error('TOOL_EXECUTION_FAILED', { tool: name, callSid, userId, error: err.message });
    return { success: false, error: err.message };
  }
}

export function computeLeadScore(data) {
  let score = 0;
  if (data.fleetSize) {
    if (data.fleetSize >= 100) score += 40;
    else if (data.fleetSize >= 20) score += 25;
    else if (data.fleetSize >= 5) score += 10;
    else score += 5;
  }
  if (data.company) score += 15;
  if (data.email) score += 5;
  if (data.phone) score += 5;
  return Math.min(score, 100);
}
