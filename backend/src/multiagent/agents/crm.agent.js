import { BaseAgent } from './baseAgent.js';
import * as crmService from '../../services/receptionistCRM.service.js';
import { buildResponse, TASK_STATUS, successResponse } from '../protocol.js';
import logger from '../../utils/logger.js';

export class CrmAgent extends BaseAgent {
  constructor({ memory = null, health = null, deps = null } = {}) {
    super({ id: 'crm', memory, health });
    this.services = deps || crmService;
    this.dbQueries = 0;
  }

  async run(task, context) {
    const { type, payload } = task.task;
    const userId = task.context.userId || payload.userId;

    switch (type) {
      case 'lookup':
        return this._lookup(task, userId, payload);
      case 'hydrate':
        return this._hydrate(task, userId, payload);
      case 'updateStatus':
        return this._updateStatus(task, userId, payload);
      case 'addNote':
        return this._addNote(task, userId, payload);
      case 'recalculateScore':
        return this._recalculateScore(task, userId, payload);
      default:
        return buildResponse({
          task,
          status: TASK_STATUS.FAILED,
          error: new Error(`crm agent does not support task type "${type}"`),
          confidence: 0,
        });
    }
  }

  async _lookup(task, userId, payload) {
    if (!userId) {
      return buildResponse({
        task,
        status: TASK_STATUS.PARTIAL,
        result: { customer: null, found: false, reason: 'missing_userId' },
        confidence: 0.1,
      });
    }
    if (!payload.phone && !payload.email) {
      return buildResponse({
        task,
        status: TASK_STATUS.PARTIAL,
        result: { customer: null, found: false, reason: 'missing_identity' },
        confidence: 0.1,
      });
    }
    this.dbQueries++;
    let customer = null;
    if (payload.phone) {
      const result = await this.services.getCustomers(userId, { search: payload.phone.replace(/\D/g, '').slice(-10), limit: 1 });
      customer = result.customers?.[0] || null;
    }
    if (!customer && payload.email) {
      this.dbQueries++;
      const result = await this.services.getCustomers(userId, { search: payload.email, limit: 1 });
      customer = result.customers?.[0] || null;
    }
    this.writeMemory('crm', 'crm', 'customerId', customer?.id || null);
    this.writeMemory('crm', 'crm', 'isReturning', Boolean(customer));
    if (customer) {
      this.writeMemory('crm', 'identity', 'name', customer.name || this.memory?.get('identity', 'name'));
      this.writeMemory('crm', 'identity', 'company', customer.companyName);
      this.writeMemory('crm', 'identity', 'fleetSize', customer.fleetSize);
      this.writeMemory('crm', 'lead', 'score', customer.leadScore || 0);
      this.writeMemory('crm', 'lead', 'stage', customer.salesStage || null);
    }
    return successResponse(task, { customer, found: Boolean(customer) }, {
      confidence: customer ? 0.95 : 0.6,
      cost: { dbQueries: this.dbQueries, cacheHits: 0 },
    });
  }

  async _hydrate(task, userId, payload) {
    if (!userId) {
      return successResponse(task, { hydrated: false, reason: 'missing_userId' }, { confidence: 0.2 });
    }
    this.dbQueries++;
    const customer = await this.services.getCustomerById(userId, payload.customerId);
    if (!customer) {
      return successResponse(task, { hydrated: false, reason: 'customer_not_found' }, { confidence: 0.3 });
    }
    const history = {
      calls: customer.totalCalls ?? 0,
      appointments: customer.totalAppointments ?? 0,
      lastContactAt: customer.lastContactAt,
    };
    this.writeMemory('crm', 'crm', 'customerId', customer.id);
    this.writeMemory('crm', 'crm', 'history', history);
    this.writeMemory('crm', 'identity', 'name', customer.name);
    this.writeMemory('crm', 'identity', 'company', customer.companyName);
    this.writeMemory('crm', 'identity', 'fleetSize', customer.fleetSize);
    this.writeMemory('crm', 'lead', 'score', customer.leadScore || 0);
    this.writeMemory('crm', 'lead', 'stage', customer.salesStage || null);
    return successResponse(task, { hydrated: true, customer, history }, {
      confidence: 0.95,
      cost: { dbQueries: 1 },
    });
  }

  async _updateStatus(task, userId, payload) {
    const { customerId, status } = payload;
    if (!customerId || !status) {
      return buildResponse({
        task,
        status: TASK_STATUS.PARTIAL,
        result: { updated: false, reason: 'missing_customerId_or_status' },
        confidence: 0.1,
      });
    }
    this.dbQueries++;
    const updated = await this.services.updateCustomerStatus(userId, customerId, { status });
    if (!updated) {
      return buildResponse({
        task,
        status: TASK_STATUS.FAILED,
        result: { updated: false, reason: 'customer_not_found' },
        error: new Error('customer not found'),
        confidence: 0,
      });
    }
    this.writeMemory('crm', 'lead', 'stage', status);
    logger.info('CRM_AGENT_STATUS_UPDATED', { userId, customerId, status });
    return successResponse(task, { updated: true, status }, { cost: { dbQueries: 1 } });
  }

  async _addNote(task, userId, payload) {
    const { customerId, content, type = 'GENERAL' } = payload;
    if (!customerId || !content) {
      return buildResponse({
        task,
        status: TASK_STATUS.PARTIAL,
        result: { added: false, reason: 'missing_customerId_or_content' },
        confidence: 0.1,
      });
    }
    this.dbQueries++;
    const note = await this.services.addCustomerNote(userId, customerId, content, type);
    if (!note) {
      return buildResponse({
        task,
        status: TASK_STATUS.FAILED,
        result: { added: false, reason: 'customer_not_found' },
        error: new Error('customer not found'),
        confidence: 0,
      });
    }
    return successResponse(task, { added: true, noteId: note.id }, { cost: { dbQueries: 1 } });
  }

  async _recalculateScore(task, userId, payload) {
    const { customerId } = payload;
    if (!customerId) {
      return buildResponse({
        task,
        status: TASK_STATUS.PARTIAL,
        result: { updated: false, reason: 'missing_customerId' },
        confidence: 0.1,
      });
    }
    this.dbQueries++;
    const customer = await this.services.recalculateLeadScore(userId, customerId);
    if (!customer) {
      return buildResponse({
        task,
        status: TASK_STATUS.FAILED,
        result: { updated: false, reason: 'customer_not_found' },
        error: new Error('customer not found'),
        confidence: 0,
      });
    }
    this.writeMemory('crm', 'lead', 'score', customer.leadScore);
    return successResponse(task, { updated: true, leadScore: customer.leadScore }, { cost: { dbQueries: 1 } });
  }
}
