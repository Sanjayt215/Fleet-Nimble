import { BaseAgent } from './baseAgent.js';
import { createAppointment } from '../../services/receptionistAppointment.service.js';
import { parseDateTime, resolveSchedulingText, assembleSchedulingPayload, formatSchedulingSummary } from '../../services/receptionistScheduling.service.js';
import { buildResponse, successResponse, TASK_STATUS } from '../protocol.js';
import logger from '../../utils/logger.js';

export class SchedulingAgent extends BaseAgent {
  constructor({ memory = null, health = null, deps = null } = {}) {
    super({ id: 'scheduling', memory, health });
    this.services = deps || { createAppointment, parseDateTime, resolveSchedulingText, assembleSchedulingPayload, formatSchedulingSummary };
  }

  async run(task, context) {
    const { type, payload } = task.task;
    const userId = task.context.userId || payload.userId;

    switch (type) {
      case 'parse':
        return this._parse(task, payload);
      case 'resolve':
        return this._resolve(task, payload);
      case 'book':
        return this._book(task, userId, payload);
      default:
        return buildResponse({
          task,
          status: TASK_STATUS.FAILED,
          error: new Error(`scheduling agent does not support task type "${type}"`),
          confidence: 0,
        });
    }
  }

  _parse(task, payload) {
    const parsed = this.services.parseDateTime(payload.text, payload.timezoneHint || null);
    if (this.memory) {
      this.memory.set('scheduling', 'identity', 'timezone', parsed.timezone);
    }
    return successResponse(task, parsed, {
      confidence: parsed.requiresClarification ? 0.4 : parsed.confidence,
      cost: { dbQueries: 0, cacheHits: 0 },
    });
  }

  async _resolve(task, payload) {
    const parsed = payload.parsed || this.services.parseDateTime(payload.text, payload.timezoneHint || null);
    const resolved = this.services.resolveSchedulingText(payload.details || {}, parsed);
    const summary = this.services.formatSchedulingSummary(parsed, payload.callerName || null);
    return successResponse(task, { parsed, resolved, summary }, { confidence: parsed.confidence });
  }

  async _book(task, userId, payload) {
    if (!payload.confirmed && payload.requireConfirmation !== false) {
      return buildResponse({
        task,
        status: TASK_STATUS.PARTIAL,
        result: { booked: false, reason: 'confirmation_required' },
        confidence: 0.3,
      });
    }

    const parsed = payload.parsed || this.services.parseDateTime(payload.text, payload.timezoneHint || null);
    const collected = {
      callerName: payload.callerName || this.memory?.get('identity', 'name') || 'Valued Customer',
      callerPhone: payload.callerPhone || this.memory?.get('identity', 'phone') || null,
      callerEmail: payload.callerEmail || this.memory?.get('identity', 'email') || null,
      companyName: payload.companyName || this.memory?.get('identity', 'company') || null,
      fleetSize: payload.fleetSize ?? this.memory?.get('identity', 'fleetSize') ?? null,
      meetingTitle: payload.meetingTitle || 'Scheduled Meeting',
      meetingPurpose: payload.meetingPurpose || null,
      durationMinutes: payload.durationMinutes || 30,
    };

    const assembled = this.services.assembleSchedulingPayload(collected, parsed);
    if (!assembled.scheduledDate) {
      return buildResponse({
        task,
        status: TASK_STATUS.FAILED,
        result: { booked: false, reason: 'unparseable_datetime' },
        error: new Error('could not assemble a valid scheduled date'),
        confidence: 0,
      });
    }

    try {
      const appointment = await this.services.createAppointment(userId, {
        ...collected,
        scheduledDate: assembled.scheduledDate,
        notes: payload.notes || null,
        callId: task.context.callId || null,
      });
      if (this.memory) {
        this.memory.set('scheduling', 'crm', 'appointmentId', appointment.id);
      }
      logger.info('SCHEDULING_AGENT_BOOKED', { userId, appointmentId: appointment.id, dateSource: assembled.dateSource });
      return successResponse(task, { booked: true, appointment, dateSource: assembled.dateSource }, {
        confidence: 0.98,
        cost: { dbQueries: 1 },
      });
    } catch (err) {
      logger.error('SCHEDULING_AGENT_BOOK_FAILED', { userId, error: err.message });
      return buildResponse({
        task,
        status: TASK_STATUS.FAILED,
        result: { booked: false, reason: 'persistence_failed' },
        error: err,
        confidence: 0,
      });
    }
  }
}
