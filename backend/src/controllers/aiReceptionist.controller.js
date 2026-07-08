import * as callService from '../services/receptionistCall.service.js';
import * as appointmentService from '../services/receptionistAppointment.service.js';
import * as supportService from '../services/receptionistSupport.service.js';
import * as configService from '../services/receptionistConfig.service.js';
import * as memoryService from '../services/receptionistMemory.service.js';
import * as crmService from '../services/receptionistCRM.service.js';
import * as auditService from '../services/receptionistAudit.service.js';
import { processSimulatedCall } from '../services/receptionistAI.service.js';
import * as agentService from '../services/receptionistAgent.service.js';
import * as notificationService from '../services/receptionistNotification.service.js';
import * as calendarService from '../services/receptionistCalendar.service.js';
import { AppError } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';

// ── Summary ──
export async function getSummary(req, res, next) {
  try {
    const [summary, pipeline] = await Promise.all([
      callService.getSummary(req.userId),
      crmService.getLeadPipelineSummary(req.userId),
    ]);
    res.json({ success: true, data: { ...summary, ...pipeline } });
  } catch (err) { next(err); }
}

// ── Call Logs ──
export async function getCalls(req, res, next) {
  try {
    const { page = '1', limit = '20', status, type, startDate, endDate } = req.query;
    const result = await callService.getCallLogs(req.userId, {
      page: parseInt(page, 10), limit: Math.min(parseInt(limit, 10), 100),
      status, type, startDate, endDate,
    });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function getCallById(req, res, next) {
  try {
    const call = await callService.getCallById(req.userId, req.params.id);
    if (!call) throw new AppError('Call not found', 404, 'NOT_FOUND');
    res.json({ success: true, data: call });
  } catch (err) { next(err); }
}

export async function createCall(req, res, next) {
  try {
    const call = await callService.createCall(req.userId, req.body);
    res.status(201).json({ success: true, data: call });
  } catch (err) { next(err); }
}

export async function updateCallStatus(req, res, next) {
  try {
    const call = await callService.updateCallStatus(req.userId, req.params.id, req.body.callStatus);
    if (!call) throw new AppError('Call not found', 404, 'NOT_FOUND');
    res.json({ success: true, data: call });
  } catch (err) { next(err); }
}

// ── Appointments ──
export async function createAppointment(req, res, next) {
  try {
    const appointment = await appointmentService.createAppointment(req.userId, req.body);

    const calResult = await calendarService.createCalendarEvent(req.userId, appointment);
    if (calResult.provider !== 'internal') {
      await appointmentService.updateAppointment(req.userId, appointment.id, {
        calendarProvider: calResult.provider,
        calendarEventId: calResult.eventId,
        meetingLink: calResult.meetingLink || null,
      });
    }

    await notificationService.sendConfirmationEmail(req.userId, appointment);
    if (req.body.callerPhone) {
      await notificationService.sendSmsNotification(req.userId, req.body.callerPhone,
        `Your appointment "${appointment.meetingTitle}" has been scheduled for ${new Date(appointment.scheduledDate).toLocaleString()}.`);
    }

    const customer = await crmService.getCustomerById(req.userId, appointment.id).catch(() => null);

    res.status(201).json({ success: true, data: appointment });
  } catch (err) { next(err); }
}

export async function getAppointments(req, res, next) {
  try {
    const { page = '1', limit = '20', status, startDate, endDate } = req.query;
    const result = await appointmentService.getAppointments(req.userId, {
      page: parseInt(page, 10), limit: Math.min(parseInt(limit, 10), 100),
      status, startDate, endDate,
    });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function updateAppointment(req, res, next) {
  try {
    const appointment = await appointmentService.updateAppointment(req.userId, req.params.id, req.body);
    if (!appointment) throw new AppError('Appointment not found', 404, 'NOT_FOUND');
    res.json({ success: true, data: appointment });
  } catch (err) { next(err); }
}

// ── Support Tickets ──
export async function createSupportTicket(req, res, next) {
  try {
    const ticket = await supportService.createSupportTicket(req.userId, req.body);
    await notificationService.notifyAdmin(req.userId, 'support_ticket_created', { ticketId: ticket.id });
    res.status(201).json({ success: true, data: ticket });
  } catch (err) { next(err); }
}

export async function getSupportTickets(req, res, next) {
  try {
    const { page = '1', limit = '20', status, urgency } = req.query;
    const result = await supportService.getSupportTickets(req.userId, {
      page: parseInt(page, 10), limit: Math.min(parseInt(limit, 10), 100),
      status, urgency,
    });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

// ── Config ──
export async function getConfig(req, res, next) {
  try {
    const config = await configService.getConfig(req.userId);
    res.json({ success: true, data: config });
  } catch (err) { next(err); }
}

export async function updateConfig(req, res, next) {
  try {
    const config = await configService.updateConfig(req.userId, req.body);
    res.json({ success: true, data: config });
  } catch (err) { next(err); }
}

// ── CRM ──
export async function getCustomers(req, res, next) {
  try {
    const { page = '1', limit = '20', status, search, sortBy, sortOrder } = req.query;
    const result = await crmService.getCustomers(req.userId, {
      page: parseInt(page, 10), limit: Math.min(parseInt(limit, 10), 100),
      status, search, sortBy, sortOrder,
    });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function getCustomerById(req, res, next) {
  try {
    const customer = await crmService.getCustomerById(req.userId, req.params.id);
    if (!customer) throw new AppError('Customer not found', 404, 'NOT_FOUND');
    res.json({ success: true, data: customer });
  } catch (err) { next(err); }
}

export async function updateCustomerStatus(req, res, next) {
  try {
    const customer = await crmService.updateCustomerStatus(req.userId, req.params.id, req.body);
    if (!customer) throw new AppError('Customer not found', 404, 'NOT_FOUND');
    res.json({ success: true, data: customer });
  } catch (err) { next(err); }
}

export async function addCustomerNote(req, res, next) {
  try {
    const note = await crmService.addCustomerNote(req.userId, req.params.id, req.body.content, req.body.type);
    if (!note) throw new AppError('Customer not found', 404, 'NOT_FOUND');
    res.status(201).json({ success: true, data: note });
  } catch (err) { next(err); }
}

export async function getLeadPipeline(req, res, next) {
  try {
    const pipeline = await crmService.getLeadPipelineSummary(req.userId);
    const highPriority = await crmService.getHighPriorityLeads(req.userId, 10);
    res.json({ success: true, data: { ...pipeline, highPriority } });
  } catch (err) { next(err); }
}

export async function recalculateLeadScore(req, res, next) {
  try {
    const customer = await crmService.recalculateLeadScore(req.userId, req.params.id);
    if (!customer) throw new AppError('Customer not found', 404, 'NOT_FOUND');
    res.json({ success: true, data: customer });
  } catch (err) { next(err); }
}

// ── Audit ──
export async function getAuditLogs(req, res, next) {
  try {
    const { page = '1', limit = '20', eventType } = req.query;
    const result = await auditService.getAuditLogs(req.userId, {
      page: parseInt(page, 10), limit: Math.min(parseInt(limit, 10), 100),
      eventType,
    });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

// ── Simulated Call ──
export async function simulateCall(req, res, next) {
  try {
    const { message, callId } = req.body;

    let session = {};
    let customerMemory = null;

    if (callId) {
      const existing = await callService.getCallById(req.userId, callId);
      if (existing) {
        session = {
          details: existing.extractedData || {},
          messages: existing.transcript ? (() => { try { return typeof existing.transcript === 'string' ? JSON.parse(existing.transcript) : []; } catch { return []; } })() : [],
          intent: existing.callType?.toLowerCase(),
        };
      }
    }

    const details = extractBasicDetails(message);
    if (details.phone || details.email) {
      const customer = await memoryService.findOrCreateCustomer(req.userId, details);
      if (customer) {
        customerMemory = await memoryService.getCustomerMemory(customer.id);
        session.customerId = customer.id;
      }
    }

    const result = processSimulatedCall(message, session, customerMemory);

    if (result.confirmed) {
      if (result.intent === 'schedule_meeting') {
        const appointment = await appointmentService.createAppointment(req.userId, {
          callerName: result.extracted.callerName || 'Caller',
          callerPhone: result.extracted.phone || null,
          callerEmail: result.extracted.email || null,
          companyName: result.extracted.company || null,
          fleetSize: result.extracted.fleetSize || null,
          meetingPurpose: result.extracted.meetingPurpose || 'General inquiry',
          scheduledDate: result.extracted.preferredDate || new Date(Date.now() + 86400000).toISOString(),
          durationMinutes: 30,
        });
        result.createdAppointment = appointment;

        if (callId) {
          await callService.updateCall(req.userId, callId, {
            appointmentId: appointment.id, callStatus: 'COMPLETED', callEndedAt: new Date(),
          });
        }
        if (session.customerId) {
          await memoryService.updateCustomerAfterCall(session.customerId, {
            appointmentId: appointment.id, intent: 'schedule_meeting',
            summary: result.response, sentiment: result.extracted.urgency || 'neutral',
          }).catch(e => logger.warn('CRM_UPDATE_FAILED', { error: e.message }));
        }
      } else if (result.intent === 'support_request') {
        const ticket = await supportService.createSupportTicket(req.userId, {
          callerName: result.extracted.callerName || 'Caller',
          callerPhone: result.extracted.phone || null,
          callerEmail: result.extracted.email || null,
          companyName: result.extracted.company || null,
          issueTitle: result.extracted.issue || 'Support request',
          issueDescription: result.extracted.issue || null,
          urgency: result.extracted.urgency || 'MEDIUM',
          relatedVehicleId: null,
        });
        result.createdTicket = ticket;

        if (callId) {
          await callService.updateCall(req.userId, callId, {
            supportTicketId: ticket.id, callStatus: 'COMPLETED', callEndedAt: new Date(),
          });
        }
        if (session.customerId) {
          await memoryService.updateCustomerAfterCall(session.customerId, {
            ticketId: ticket.id, intent: 'support_request',
            summary: result.response, sentiment: 'neutral',
          }).catch(e => logger.warn('CRM_UPDATE_FAILED', { error: e.message }));
        }
      }
    }

    if (result.escalate && callId) {
      await callService.updateCall(req.userId, callId, { callStatus: 'ESCALATED', callEndedAt: new Date() });
    }

    if (!callId) {
      const call = await callService.createCall(req.userId, {
        callerName: result.extracted.callerName || 'Unknown Caller',
        callerPhone: result.extracted.phone || null,
        callerEmail: result.extracted.email || null,
        companyName: result.extracted.company || null,
        fleetSize: result.extracted.fleetSize || null,
        callType: mapIntentToType(result.intent),
        callStatus: result.escalate ? 'ESCALATED' : result.confirmed ? 'COMPLETED' : 'IN_PROGRESS',
        transcript: JSON.stringify(result.session.messages || []),
        summary: result.response,
        extractedData: result.extracted,
      });
      result.callId = call.id;

      if (session.customerId) {
        await callService.updateCall(req.userId, call.id, { /* customerId cascade handled */ });
      }

      if (result.createdAppointment) {
        await callService.updateCall(req.userId, call.id, { appointmentId: result.createdAppointment.id });
      }
      if (result.createdTicket) {
        await callService.updateCall(req.userId, call.id, { supportTicketId: result.createdTicket.id });
      }
    }

    result.session = undefined;
    if (customerMemory) {
      result.customer = { id: customerMemory.customer.id, name: customerMemory.customer.name, status: customerMemory.customer.status, leadScore: customerMemory.customer.leadScore, isReturning: customerMemory.isReturning };
    }

    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('SIMULATE_CALL_ERROR', { userId: req.userId, error: err.message });
    next(err);
  }
}

// ── Voice Agent ──
export async function startAgent(req, res, next) {
  try {
    const result = await agentService.startSession(req.userId);
    res.json({
      sessionId: result.sessionId,
      greeting: result.reply,
      status: 'started',
      conversationStage: result.conversationStage,
      suggestedReplies: result.suggestedReplies || [],
    });
  } catch (err) { next(err); }
}

export async function processAgentMessage(req, res, next) {
  try {
    const { sessionId, message, mode } = req.body;
    if (!sessionId || !message) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'sessionId and message are required',
        details: [
          { field: 'sessionId', message: !sessionId ? 'sessionId is required' : null },
          { field: 'message', message: !message ? 'message is required' : null },
        ].filter(d => d.message),
      });
    }
    const result = await agentService.processMessage(sessionId, message, mode || 'text');
    if (result.error) {
      return res.status(400).json({ error: 'Session error', message: result.reply });
    }
    const response = {
      success: true,
      sessionId: result.sessionId,
      reply: result.reply,
      currentIntent: result.intent || null,
      conversationStage: result.conversationStage,
      extractedData: result.extractedData || {},
      missingFields: result.missingFields || [],
      requiresConfirmation: !!result.requiresConfirmation,
      pendingAction: result.pendingAction || null,
      isComplete: !!result.isComplete,
      suggestedReplies: result.suggestedReplies || [],
    };
    res.json(response);
  } catch (err) { next(err); }
}

export async function confirmAgentAction(req, res, next) {
  try {
    const { sessionId, action } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: 'Validation failed', message: 'sessionId is required' });
    }
    const result = await agentService.confirmAction(sessionId, action);
    if (result.error) {
      return res.status(400).json({ error: 'Session error', message: result.message });
    }
    const response = {
      success: true,
      sessionId: result.sessionId,
      reply: result.reply,
      currentIntent: result.intent || null,
      conversationStage: result.conversationStage,
      extractedData: result.extractedData || {},
      missingFields: result.missingFields || [],
      requiresConfirmation: !!result.requiresConfirmation,
      pendingAction: result.pendingAction || null,
      isComplete: !!result.isComplete,
      suggestedReplies: result.suggestedReplies || [],
    };
    res.json(response);
  } catch (err) { next(err); }
}

export async function endAgent(req, res, next) {
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: 'Validation failed', message: 'sessionId is required' });
    }
    const result = agentService.endSession(sessionId);
    res.json({ ended: true, ...result });
  } catch (err) { next(err); }
}

function extractBasicDetails(message) {
  const nameMatch = message.match(/my name is (\w+\s*\w*)/i) || message.match(/I['"]?m (\w+\s*\w*)/i) || message.match(/this is (\w+\s*\w*)/i);
  const phoneMatch = message.match(/([\+\d][\d\s\-\(\)]{7,15}\d)/);
  const emailMatch = message.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  const companyMatch = message.match(/(?:from|at)\s+(\w+(?:\s+\w+)?)\s+(?:company|fleet|logistics)/i);
  const fleetMatch = message.match(/(\d+)\s*(?:vehicle|truck|fleet)/i);

  return {
    callerName: nameMatch ? nameMatch[1].trim() : null,
    phone: phoneMatch ? phoneMatch[1].trim() : null,
    email: emailMatch ? emailMatch[1].toLowerCase() : null,
    company: companyMatch ? companyMatch[1].trim() : null,
    fleetSize: fleetMatch ? parseInt(fleetMatch[1], 10) : null,
  };
}

function mapIntentToType(intent) {
  const map = {
    schedule_meeting: 'DEMO', support_request: 'SUPPORT', pricing: 'PRICING',
    onboarding: 'ONBOARDING', emergency: 'EMERGENCY', general: 'GENERAL',
    cancelled: 'OTHER', updated: 'OTHER', checking: 'OTHER',
  };
  return map[intent] || 'OTHER';
}
