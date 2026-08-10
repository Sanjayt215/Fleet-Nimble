import { BaseAgent } from './baseAgent.js';
import { createSupportTicket } from '../../services/receptionistSupport.service.js';
import { buildResponse, successResponse, TASK_STATUS } from '../protocol.js';
import logger from '../../utils/logger.js';

const URGENCY_PATTERNS = {
  CRITICAL: [/emergency/i, /\bdown\b/i, /\bcrash\b/i, /\boutage\b/i, /\bdata\s+loss\b/i, /\bstolen\b/i, /\bfire\b/i],
  HIGH: [/urgent/i, /\basap\b/i, /\btoday\b/i, /\bnot\s+working\b/i, /\bbroken\b/i, /\bcan'?t\s+(login|access|use)\b/i],
  MEDIUM: [/problem/i, /\bissue\b/i, /\bbug\b/i, /\berror\b/i, /\bwrong\b/i, /\bslow\b/i],
  LOW: [/question\b/i, /\bhow\s+do\b/i, /\badvice\b/i],
};

const CATEGORY_PATTERNS = [
  { category: 'BILLING', patterns: [/bill/i, /invoice/i, /payment/i, /refund/i, /price/i, /subscription/i, /charge/i] },
  { category: 'HARDWARE', patterns: [/device/i, /obd/i, /hardware/i, /dashcam/i, /sensor/i, /gps\s+unit/i, /adapter/i] },
  { category: 'SOFTWARE', patterns: [/app/i, /dashboard/i, /login/i, /website/i, /portal/i, /software/i, /update/i, /sync/i] },
  { category: 'CONNECTIVITY', patterns: [/connect/i, /signal/i, /network/i, /offline/i, /data\s+not\s+updating/i, /disconnect/i] },
  { category: 'ACCOUNT', patterns: [/account/i, /user\s+management/i, /permission/i, /team\s+member/i, /role/i] },
];

export class SupportAgent extends BaseAgent {
  constructor({ memory = null, health = null, deps = null } = {}) {
    super({ id: 'support', memory, health });
    this.services = deps || { createSupportTicket };
  }

  async run(task, context) {
    const { type, payload } = task.task;
    const userId = task.context.userId || payload.userId;

    switch (type) {
      case 'triage':
        return this._triage(task, payload);
      case 'createTicket':
        return this._createTicket(task, userId, payload);
      default:
        return buildResponse({
          task,
          status: TASK_STATUS.FAILED,
          error: new Error(`support agent does not support task type "${type}"`),
          confidence: 0,
        });
    }
  }

  _triage(task, payload) {
    const text = String(payload.text || '').trim();
    let urgency = 'MEDIUM';
    for (const [level, patterns] of Object.entries(URGENCY_PATTERNS)) {
      if (patterns.some(p => p.test(text))) {
        urgency = level;
        break;
      }
    }
    let category = 'GENERAL';
    for (const entry of CATEGORY_PATTERNS) {
      if (entry.patterns.some(p => p.test(text))) {
        category = entry.category;
        break;
      }
    }
    if (this.memory) {
      this.memory.set('support', 'businessIntelligence', 'urgency', urgency);
    }
    return successResponse(task, { urgency, category }, { confidence: urgency === 'MEDIUM' ? 0.7 : 0.9 });
  }

  async _createTicket(task, userId, payload) {
    if (!payload.confirmed && payload.requireConfirmation !== false) {
      return buildResponse({
        task,
        status: TASK_STATUS.PARTIAL,
        result: { created: false, reason: 'confirmation_required' },
        confidence: 0.3,
      });
    }

    const issueDescription = String(payload.issueDescription || payload.text || '').trim();
    if (!issueDescription) {
      return buildResponse({
        task,
        status: TASK_STATUS.FAILED,
        result: { created: false, reason: 'missing_description' },
        error: new Error('ticket description is required'),
        confidence: 0,
      });
    }

    const callerName = payload.callerName || this.memory?.get('identity', 'name') || 'Valued Customer';
    const ticketData = {
      callerName,
      callerPhone: payload.callerPhone || this.memory?.get('identity', 'phone') || null,
      callerEmail: payload.callerEmail || this.memory?.get('identity', 'email') || null,
      companyName: payload.companyName || this.memory?.get('identity', 'company') || null,
      issueTitle: payload.issueTitle || 'Support request',
      issueDescription,
      urgency: payload.urgency || 'MEDIUM',
      assignedTo: payload.assignedTo || null,
      relatedVehicleId: payload.relatedVehicleId || null,
      callId: task.context.callId || null,
    };

    try {
      const ticket = await this.services.createSupportTicket(userId, ticketData);
      logger.info('SUPPORT_AGENT_TICKET_CREATED', { userId, ticketId: ticket.id, urgency: ticket.urgency });
      return successResponse(task, { created: true, ticket }, {
        confidence: 0.98,
        cost: { dbQueries: 1 },
      });
    } catch (err) {
      logger.error('SUPPORT_AGENT_TICKET_FAILED', { userId, error: err.message });
      return buildResponse({
        task,
        status: TASK_STATUS.FAILED,
        result: { created: false, reason: 'persistence_failed' },
        error: err,
        confidence: 0,
      });
    }
  }
}
