import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger.js';
import { queryKnowledgeBase } from './receptionistKnowledgeBase.service.js';
import * as callService from './receptionistCall.service.js';
import * as appointmentService from './receptionistAppointment.service.js';
import * as supportService from './receptionistSupport.service.js';
import * as memoryService from './receptionistMemory.service.js';
import * as crmService from './receptionistCRM.service.js';
import * as auditService from './receptionistAudit.service.js';
import * as handoffService from './receptionistHandoff.service.js';
import * as notificationService from './receptionistNotification.service.js';
import * as calendarService from './receptionistCalendar.service.js';
import * as transcriptService from './receptionistTranscript.service.js';
import { config } from '../config/index.js';
import prisma from '../utils/prisma.js';

const PENDING_ACTIONS = new Map();

const INTENTS = {
  SCHEDULE_MEETING: 'schedule_meeting',
  SUPPORT_REQUEST: 'support_request',
  PRICING_QUESTION: 'pricing_question',
  GENERAL_QUESTION: 'general_question',
  PRODUCT_QUESTION: 'product_question',
  EMERGENCY: 'emergency',
  UNKNOWN: 'unknown',
};

export async function processReceptionistTurn({ session, userText, channel, userContext }) {
  const { callSid, userId, callId, customerId, customerMemory, currentStage, collectedData, pendingAction } = session;

  const intent = await classifyIntent(userText, session);

  if (intent === INTENTS.EMERGENCY) {
    const reply = 'I understand this is an urgent situation. I am notifying our team immediately. Please stay safe.';
    await auditService.logCallEvent(userId, 'emergency_detected', { callSid, message: userText });
    return { reply, intent, escalate: true, department: 'emergency' };
  }

  if (intent === INTENTS.PRODUCT_QUESTION) {
    const answer = queryKnowledgeBase(userText);
    if (answer) {
      return { reply: answer, intent, isKnowledgeBase: true };
    }
  }

  if (intent === INTENTS.SCHEDULE_MEETING) {
    return handleAppointmentIntent(session, userText);
  }

  if (intent === INTENTS.SUPPORT_REQUEST) {
    return handleSupportIntent(session, userText);
  }

  if (userText && userText.length < 60 && currentStage === 'confirming') {
    return handleConfirmation(session, userText);
  }

  if (collectedData?.callerName || userText.length > 10) {
    return {
      reply: 'How can I assist you today? I can help schedule a demo, create a support ticket, or answer questions about FleetNimble.',
      intent: 'clarifying',
    };
  }

  const greeting = customerMemory?.isReturning && customerMemory?.customer?.name
    ? `Welcome back, ${customerMemory.customer.name}. How may I help you today?`
    : 'Hello. Thank you for calling FleetNimble. How may I help you today?';

  return { reply: greeting, intent: 'greeting' };
}

async function classifyIntent(message, session) {
  const lower = message.toLowerCase().trim();

  if (lower.includes('emergency') || lower.includes('accident') || lower.includes('breakdown') || lower.includes('stranded') || lower.includes('urgent help')) {
    return INTENTS.EMERGENCY;
  }
  if ((lower.includes('schedule') || lower.includes('book') || lower.includes('appointment') || lower.includes('demo')) && (lower.includes('want') || lower.includes('like') || lower.includes('need') || lower.includes('can') || lower.includes('would') || lower.includes('book') || lower.includes('schedule'))) {
    return INTENTS.SCHEDULE_MEETING;
  }
  if (lower.includes('support') || lower.includes('ticket') || lower.includes('problem') || lower.includes('broken') || lower.includes('not working') || lower.includes('error') || lower.includes('issue with') || lower.includes('help with')) {
    return INTENTS.SUPPORT_REQUEST;
  }
  if (lower.includes('price') || lower.includes('pricing') || lower.includes('cost') || lower.includes('how much') || lower.includes('plan') || lower.includes('subscription')) {
    return INTENTS.PRICING_QUESTION;
  }

  const knowledgeAnswer = queryKnowledgeBase(message);
  if (knowledgeAnswer) {
    return INTENTS.PRODUCT_QUESTION;
  }

  if (lower.includes('how') || lower.includes('what') || lower.includes('where') || lower.includes('tell me') || lower.includes('explain') || lower.includes('can you')) {
    return INTENTS.GENERAL_QUESTION;
  }

  if (session.currentStage === 'confirming') {
    return 'confirmation';
  }

  return INTENTS.UNKNOWN;
}

export async function handleAppointmentIntent(session, userText) {
  const { userId, collectedData = {} } = session;
  const data = extractDetails(userText, collectedData);

  if (!data.callerName) {
    return { reply: 'Certainly. May I know your name?', intent: INTENTS.SCHEDULE_MEETING, conversationStage: 'collecting_name', collectedData: data, missingFields: ['callerName'] };
  }
  if (!data.company) {
    return { reply: `Thank you, ${data.callerName}. Which company are you with?`, intent: INTENTS.SCHEDULE_MEETING, conversationStage: 'collecting_company', collectedData: data, missingFields: ['company'] };
  }
  if (!data.phone && !data.email) {
    return { reply: `Great. What is the best phone number or email to reach you at?`, intent: INTENTS.SCHEDULE_MEETING, conversationStage: 'collecting_contact', collectedData: data, missingFields: ['phone', 'email'] };
  }
  if (!data.fleetSize) {
    return { reply: `Approximately how many vehicles does your fleet manage?`, intent: INTENTS.SCHEDULE_MEETING, conversationStage: 'collecting_fleet_size', collectedData: data, missingFields: ['fleetSize'] };
  }
  if (!data.meetingPurpose) {
    return { reply: `What would you like the meeting to cover? For example, a product demo, pricing discussion, or technical consultation?`, intent: INTENTS.SCHEDULE_MEETING, conversationStage: 'collecting_purpose', collectedData: data, missingFields: ['meetingPurpose'] };
  }
  if (!data.preferredDate) {
    return { reply: `What date works best for the meeting?`, intent: INTENTS.SCHEDULE_MEETING, conversationStage: 'collecting_date', collectedData: data, missingFields: ['preferredDate'] };
  }
  if (!data.preferredTime) {
    return { reply: `What time would you prefer?`, intent: INTENTS.SCHEDULE_MEETING, conversationStage: 'collecting_time', collectedData: data, missingFields: ['preferredTime'] };
  }

  const summary = `I have a meeting request for ${data.callerName} from ${data.company || 'your company'}, managing ${data.fleetSize || 'your'} vehicles, on ${data.preferredDate} at ${data.preferredTime}, regarding ${data.meetingPurpose || 'a discussion'}. Should I go ahead and schedule this?`;

  return {
    reply: summary,
    intent: INTENTS.SCHEDULE_MEETING,
    conversationStage: 'confirming',
    collectedData: data,
    requiresConfirmation: true,
    pendingAction: 'create_appointment',
  };
}

export async function handleSupportIntent(session, userText) {
  const { userId, collectedData = {} } = session;
  const data = extractDetails(userText, collectedData);

  if (!data.callerName) {
    return { reply: 'I am sorry to hear you are experiencing an issue. May I know your name?', intent: INTENTS.SUPPORT_REQUEST, conversationStage: 'collecting_name', collectedData: data, missingFields: ['callerName'] };
  }
  if (!data.issue) {
    return { reply: `Thank you, ${data.callerName || ''}. Could you briefly describe the issue you are facing?`, intent: INTENTS.SUPPORT_REQUEST, conversationStage: 'collecting_issue', collectedData: data, missingFields: ['issue'] };
  }
  if (!data.phone && !data.email) {
    return { reply: 'What is the best phone number or email where we can follow up with you?', intent: INTENTS.SUPPORT_REQUEST, conversationStage: 'collecting_contact', collectedData: data, missingFields: ['phone', 'email'] };
  }

  const summary = `I have a support ticket for ${data.callerName}. Issue: ${data.issue}. Urgency: ${data.urgency || 'MEDIUM'}. Should I create this support ticket?`;

  return {
    reply: summary,
    intent: INTENTS.SUPPORT_REQUEST,
    conversationStage: 'confirming',
    collectedData: data,
    requiresConfirmation: true,
    pendingAction: 'create_support_ticket',
  };
}

export async function handleConfirmation(session, userText) {
  const { userId, callId, customerId, pendingAction, collectedData = {} } = session;
  const lower = userText.toLowerCase().trim();
  const confirmed = /^(yes|yeah|sure|ok|okay|correct|right|go ahead|please do|confirm|yep|do it|schedule it|that is correct)/i.test(lower);

  if (!confirmed) {
    return { reply: 'No problem. Please let me know what you would like to change or how I can help.', intent: 'clarifying', conversationStage: 'clarifying' };
  }

  const executionId = `${callId}_${pendingAction}`;
  if (PENDING_ACTIONS.has(executionId)) {
    return { reply: 'This has already been processed. Is there anything else I can help you with?', intent: 'completed' };
  }

  if (pendingAction === 'create_appointment') {
    return executeAppointmentCreation(session);
  }

  if (pendingAction === 'create_support_ticket') {
    return executeSupportTicketCreation(session);
  }

  return { reply: 'How else can I help you today?', intent: 'clarifying' };
}

export async function executeAppointmentCreation(session) {
  const { userId, callId, customerId, collectedData = {} } = session;
  const executionId = `${callId}_create_appointment`;
  if (PENDING_ACTIONS.has(executionId)) {
    return { reply: 'The appointment has already been created. Is there anything else?', intent: 'completed' };
  }

  try {
    const scheduledDate = collectedData.preferredDate && collectedData.preferredTime
      ? new Date(`${collectedData.preferredDate}T${collectedData.preferredTime}:00`)
      : new Date(Date.now() + 86400000);
    if (isNaN(scheduledDate.getTime())) {
      throw new Error('Invalid date/time');
    }

    const appointment = await appointmentService.createAppointment(userId, {
      callerName: collectedData.callerName || 'Caller',
      callerPhone: collectedData.phone || null,
      callerEmail: collectedData.email || null,
      companyName: collectedData.company || null,
      fleetSize: collectedData.fleetSize || null,
      meetingPurpose: collectedData.meetingPurpose || 'General inquiry',
      meetingTitle: collectedData.meetingPurpose ? `${collectedData.meetingPurpose} - FleetNimble` : 'FleetNimble Meeting',
      scheduledDate: scheduledDate.toISOString(),
      durationMinutes: 30,
    });

    PENDING_ACTIONS.set(executionId, { id: appointment.id, timestamp: Date.now() });

    if (callId) {
      await callService.updateCall(userId, callId, {
        appointmentId: appointment.id,
        callType: 'DEMO',
      }).catch(e => logger.warn('CALL_APPOINTMENT_LINK_FAILED', { callId, error: e.message }));
    }

    const calResult = await calendarService.createCalendarEvent(userId, appointment).catch(() => ({ provider: 'internal', eventId: null }));
    if (calResult.provider !== 'internal') {
      await appointmentService.updateAppointment(userId, appointment.id, {
        calendarProvider: calResult.provider,
        calendarEventId: calResult.eventId,
        meetingLink: calResult.meetingLink || null,
      }).catch(() => {});
    }

    await notificationService.sendConfirmationEmail(userId, appointment).catch(() => {});
    if (collectedData.phone) {
      await notificationService.sendSmsNotification(userId, collectedData.phone,
        `Your FleetNimble meeting has been scheduled for ${scheduledDate.toLocaleString()}. Confirmation: ${appointment.id.substring(0, 8)}`
      ).catch(() => {});
    }
    await notificationService.notifyAdmin(userId, 'appointment_booked', {
      appointmentId: appointment.id,
      callerName: collectedData.callerName,
      company: collectedData.company,
      date: collectedData.preferredDate,
    }).catch(() => {});

    if (customerId) {
      await memoryService.updateCustomerAfterCall(customerId, {
        appointmentId: appointment.id,
        intent: 'schedule_meeting',
        summary: `Scheduled: ${collectedData.meetingPurpose || 'General'} on ${collectedData.preferredDate}`,
        sentiment: 'positive',
      }).catch(() => {});
    }

    await auditService.logCallEvent(userId, 'appointment_created', {
      appointmentId: appointment.id,
      callerName: collectedData.callerName,
      company: collectedData.company,
    }).catch(() => {});

    const reply = `Perfect! Your meeting has been scheduled.\n\n- Purpose: ${collectedData.meetingPurpose || 'General'}\n- Date: ${collectedData.preferredDate}\n- Time: ${collectedData.preferredTime || '10:00'}\n- Confirmation: ${appointment.id.substring(0, 8)}\n\nIs there anything else I can help you with?`;

    return { reply, intent: 'appointment_created', isComplete: true, actionResult: { type: 'appointment', id: appointment.id }, collectedData };
  } catch (err) {
    logger.error('VOICE_AGENT_TOOL_FAILED', {
      tool: 'create_appointment',
      error: err.message,
      stack: err.stack,
      userId,
      callId,
      customerId,
      payload: collectedData,
      prismaError: err.code || null,
      constraint: err.meta?.constraint || null,
      field: err.meta?.field_name || null,
    });
    return { reply: 'I apologize, but I encountered an issue creating the appointment. Our team has been notified and will follow up. Is there anything else?', intent: 'error', error: err.message };
  }
}

export async function executeSupportTicketCreation(session) {
  const { userId, callId, customerId, collectedData = {} } = session;
  const executionId = `${callId}_create_support_ticket`;
  if (PENDING_ACTIONS.has(executionId)) {
    return { reply: 'The support ticket has already been created. Is there anything else?', intent: 'completed' };
  }

  try {
    const ticket = await supportService.createSupportTicket(userId, {
      callerName: collectedData.callerName || 'Caller',
      callerPhone: collectedData.phone || null,
      callerEmail: collectedData.email || null,
      companyName: collectedData.company || null,
      issueTitle: collectedData.issue?.substring(0, 200) || 'Support request',
      issueDescription: collectedData.issue || null,
      urgency: collectedData.urgency || 'MEDIUM',
      relatedVehicleId: collectedData.vehicleReference || null,
    });

    PENDING_ACTIONS.set(executionId, { id: ticket.id, timestamp: Date.now() });

    if (callId) {
      await callService.updateCall(userId, callId, {
        supportTicketId: ticket.id,
        callType: 'SUPPORT',
      }).catch(e => logger.warn('CALL_TICKET_LINK_FAILED', { callId, error: e.message }));
    }

    await notificationService.notifyAdmin(userId, 'support_ticket_created', {
      ticketId: ticket.id,
      issue: collectedData.issue?.substring(0, 100),
      caller: collectedData.callerName,
      urgency: collectedData.urgency || 'MEDIUM',
    }).catch(() => {});

    if (collectedData.phone) {
      await notificationService.sendSmsNotification(userId, collectedData.phone,
        `Your support ticket has been created (Ref: ${ticket.id.substring(0, 8)}). Our team will follow up soon.`
      ).catch(() => {});
    }

    if (customerId) {
      await memoryService.updateCustomerAfterCall(customerId, {
        ticketId: ticket.id,
        intent: 'support_request',
        summary: `Support ticket: ${collectedData.issue?.substring(0, 100)}`,
        sentiment: 'neutral',
      }).catch(() => {});
    }

    await auditService.logCallEvent(userId, 'support_ticket_created', {
      ticketId: ticket.id,
      issue: collectedData.issue?.substring(0, 100),
      urgency: collectedData.urgency,
    }).catch(() => {});

    const reply = `Done! I have created a support ticket for your issue.\n\n- Reference: ${ticket.id.substring(0, 8)}\n- Issue: ${collectedData.issue}\n- Urgency: ${collectedData.urgency || 'MEDIUM'}\n\nOur support team will follow up with you soon. Is there anything else I can help you with?`;

    return { reply, intent: 'support_ticket_created', isComplete: true, actionResult: { type: 'support_ticket', id: ticket.id }, collectedData };
  } catch (err) {
    logger.error('VOICE_AGENT_TOOL_FAILED', {
      tool: 'create_support_ticket',
      error: err.message,
      stack: err.stack,
      userId,
      callId,
      customerId,
      payload: collectedData,
      prismaError: err.code || null,
      constraint: err.meta?.constraint || null,
    });
    return { reply: 'I apologize, but I encountered an issue creating the support ticket. Our team has been notified. Is there anything else?', intent: 'error', error: err.message };
  }
}

export async function lookupCustomerByPhone(userId, phone) {
  if (!phone) return null;
  try {
    const normalized = phone.replace(/[^\d+]/g, '');
    const customer = await prisma.receptionistCustomer.findFirst({
      where: { userId, phone: { contains: normalized.slice(-10) } },
    });
    if (!customer) return null;
    const memory = await memoryService.getCustomerMemory(customer.id);
    return memory;
  } catch (err) {
    logger.warn('CUSTOMER_LOOKUP_FAILED', { userId, error: err.message });
    return null;
  }
}

export async function createCallRecord({ userId, callSid, from, to, twilioAccountSid }) {
  try {
    const existing = await prisma.aiReceptionistCall.findFirst({
      where: { twilioCallSid: callSid },
    });
    if (existing) {
      logger.info('CALL_RECORD_ALREADY_EXISTS', { callSid, callId: existing.id });
      return existing;
    }

    const call = await callService.createCall(userId, {
      twilioCallSid: callSid,
      twilioAccountSid: twilioAccountSid || null,
      callerPhone: from || null,
      twilioFrom: from || null,
      twilioTo: to || null,
      callStatus: 'IN_PROGRESS',
      callStartedAt: new Date(),
      callerName: 'Caller',
      detectedLanguage: 'en',
    });

    logger.info('CALL_RECORD_CREATED', { callSid, callId: call.id });
    return call;
  } catch (err) {
    logger.error('CALL_RECORD_CREATE_FAILED', { callSid, error: err.message });
    return null;
  }
}

export async function updateCallRecordAtEnd({ callId, callSid, userId, intent, summary, transcript, sentiment, customerId, appointmentId, supportTicketId, handoffReason, aiConfidence }) {
  if (!callId && !callSid) return;
  try {
    const updates = {
      callEndedAt: new Date(),
      callStatus: handoffReason ? 'ESCALATED' : 'COMPLETED',
    };
    if (summary) updates.summary = summary;
    if (transcript) updates.transcript = transcript;
    if (sentiment) updates.sentiment = sentiment;
    if (appointmentId) updates.appointmentId = appointmentId;
    if (supportTicketId) updates.supportTicketId = supportTicketId;
    if (customerId) updates.customerId = customerId;
    if (handoffReason) {
      updates.handoffReason = handoffReason;
      updates.escalatedAt = new Date();
    }
    if (aiConfidence != null) updates.aiConfidence = aiConfidence;

    if (callSid) {
      const existing = await prisma.aiReceptionistCall.findFirst({ where: { twilioCallSid: callSid } });
      if (existing) {
        if (updates.callEndedAt && existing.callStartedAt) {
          updates.durationSeconds = Math.round((updates.callEndedAt.getTime() - new Date(existing.callStartedAt).getTime()) / 1000);
        }
        await prisma.aiReceptionistCall.update({ where: { id: existing.id }, data: updates });
        logger.info('CALL_RECORD_ENDED', { callSid, callId: existing.id, status: updates.callStatus });
      }
    } else if (callId) {
      await callService.updateCall(userId, callId, updates).catch(() => {});
    }
  } catch (err) {
    logger.error('CALL_RECORD_UPDATE_FAILED', { callSid, error: err.message });
  }
}

export async function generateCallSummary(session) {
  const { collectedData = {}, transcript = [] } = session;
  const summary = {
    callerName: collectedData.callerName || 'Unknown',
    company: collectedData.company || null,
    intent: collectedData.intent || 'general',
    questionsAsked: transcript.filter(t => t.role === 'caller').length,
    appointmentCreated: !!collectedData.appointmentCreated,
    supportTicketCreated: !!collectedData.supportTicketCreated,
    sentiment: collectedData.sentiment || 'neutral',
    outcome: collectedData.appointmentCreated ? 'appointment_booked' : collectedData.supportTicketCreated ? 'ticket_created' : 'information_provided',
  };
  return summary;
}

export async function updateCRMAfterCall({ userId, customerId, collectedData, intent, summary, sentiment, appointmentId, ticketId }) {
  if (!customerId) return;
  try {
    const updates = {
      lastIntent: intent,
      lastSummary: summary?.substring(0, 500),
      lastContactAt: new Date(),
    };
    if (collectedData?.company) updates.companyName = collectedData.company;
    if (collectedData?.fleetSize != null) updates.fleetSize = collectedData.fleetSize;
    if (collectedData?.callerName) updates.name = collectedData.callerName;
    if (collectedData?.phone) {
      const existing = await prisma.receptionistCustomer.findUnique({ where: { id: customerId }, select: { phone: true } });
      if (!existing?.phone) updates.phone = collectedData.phone;
    }
    if (collectedData?.email) {
      const existing = await prisma.receptionistCustomer.findUnique({ where: { id: customerId }, select: { email: true } });
      if (!existing?.email) updates.email = collectedData.email;
    }

    await prisma.receptionistCustomer.update({ where: { id: customerId }, data: updates });
  } catch (err) {
    logger.warn('CRM_UPDATE_FAILED', { customerId, error: err.message });
  }
}

function extractDetails(message, existing = {}) {
  const extracted = { ...existing };

  const nameMatch = message.match(/my name is (\w+\s*\w*)/i)
    || message.match(/name['"]?s?\s*(\w+\s*\w*)/i)
    || message.match(/I['"]?m (\w+\s*\w*)/i)
    || message.match(/this is (\w+\s*\w*)/i)
    || message.match(/I am (\w+\s*\w*)/i)
    || message.match(/calling (?:from|as)\s+(\w+\s*\w*)/i);
  const nameStopWords = ['from', 'for', 'with', 'to', 'the', 'a', 'an', 'in', 'on', 'at', 'by', 'and', 'or', 'of'];
  if (nameMatch && !extracted.callerName && !nameStopWords.includes(nameMatch[1].trim().toLowerCase())) extracted.callerName = nameMatch[1].trim();
  if (!extracted.callerName && message.length < 30) {
    const words = message.trim().split(/\s+/);
    if (words.length >= 1 && words.length <= 3 && !message.match(/^(yes|no|sure|okay|ok|correct|right|yeah|yep|nope|nah)/i)) {
      extracted.callerName = message.trim();
    }
  }

  const phoneMatch = message.match(/([\+\d][\d\s\-\(\)]{7,15}\d)/);
  if (phoneMatch) extracted.phone = phoneMatch[1].trim().replace(/[\s\-\(\)]/g, '');

  const emailMatch = message.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (emailMatch) extracted.email = emailMatch[1].toLowerCase();

  const companyMatch = message.match(/(?:from|at|for|work at|work for)\s+(\w+(?:\s+\w+)?)\s*(?:company|fleet|logistics|transport|corp|inc|llc|ltd|solutions|group|technologies|tech)?/i)
    || message.match(/(?:company|company name|organization|business)\s*(?:is|name)?\s*['"]?(\w+(?:\s+\w+)?)['"]?/i);
  if (companyMatch) extracted.company = companyMatch[1].trim();

  const fleetMatch = message.match(/(\d+)\s*(?:vehicle|truck|car|van|bus|fleet|units)/i)
    || message.match(/(?:fleet|have|operate|manage|about|around)\s*(?:of|about|around)?\s*(\d+)/i);
  if (fleetMatch) extracted.fleetSize = parseInt(fleetMatch[1], 10);

  const vehicleMatch = message.match(/(?:vehicle|truck|car|van|bus)\s*(?:number|name|id|#)?\s*[#:]?\s*([A-Za-z0-9\-\s]{2,15})/i);
  if (vehicleMatch) extracted.vehicleReference = vehicleMatch[1].trim();

  const dateMatch = message.match(/(?:next\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow)/i);
  if (dateMatch) {
    extracted.preferredDate = resolveDayToDate(dateMatch[0]);
  } else {
    const dateStr = message.match(/(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)/i);
    if (dateStr) {
      const months = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
      const monthKey = dateStr[2].toLowerCase().substring(0, 3);
      const month = months[monthKey];
      if (month !== undefined) {
        const day = parseInt(dateStr[1], 10);
        const now = new Date();
        let year = now.getFullYear();
        const date = new Date(year, month, day);
        if (date < now) year++;
        extracted.preferredDate = new Date(year, month, day).toISOString().split('T')[0];
      }
    }
  }

  const timeMatch = message.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1], 10);
    const mins = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    if (timeMatch[3].toLowerCase() === 'pm' && hours < 12) hours += 12;
    if (timeMatch[3].toLowerCase() === 'am' && hours === 12) hours = 0;
    extracted.preferredTime = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }

  const issueMatch = message.match(/(?:issue|problem|help with|trouble|error|broken|not working)\s*(?:is|with|:)?\s*(.+?)(?:\.|,|$)/i)
    || message.match(/(.+?)\s*(?:is|are)\s*(?:not working|broken|having issue)/i);
  if (issueMatch) extracted.issue = issueMatch[1].trim();

  const purposeMatch = message.match(/(?:for|regarding|about|wanted to discuss|interested in|looking for)\s*(.+?)(?:\.|,|$)/i);
  if (purposeMatch && !extracted.issue && !extracted.meetingPurpose) {
    extracted.meetingPurpose = purposeMatch[1].trim();
  }

  if (message.match(/urgent|asap|immediately|critical|emergency/i)) {
    extracted.urgency = 'HIGH';
  } else if (message.match(/important|soon|needed|priority/i)) {
    extracted.urgency = 'MEDIUM';
  }

  return extracted;
}

function resolveDayToDate(dayStr) {
  const days = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
  const dayNum = days[dayStr.toLowerCase()];
  if (dayNum === undefined) return dayStr;
  const now = new Date();
  const today = now.getDay();
  let diff = dayNum - today;
  if (diff <= 0) diff += 7;
  if (dayStr.toLowerCase() === 'tomorrow') diff = 1;
  const target = new Date(now);
  target.setDate(now.getDate() + diff);
  return target.toISOString().split('T')[0];
}

export function cleanupOrchestrator() {
  const now = Date.now();
  let count = 0;
  PENDING_ACTIONS.forEach((value, key) => {
    if (now - value.timestamp > 3600000) {
      PENDING_ACTIONS.delete(key);
      count++;
    }
  });
  if (count > 0) logger.info('ORCHESTRATOR_PENDING_ACTIONS_CLEANED', { count });
}
