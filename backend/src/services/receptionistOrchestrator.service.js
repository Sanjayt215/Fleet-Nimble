import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger.js';
import { queryKnowledgeBase } from './receptionistKnowledgeBase.service.js';
import { getKnowledgeEngine } from '../knowledge/index.js';
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
import * as metrics from './receptionistMetrics.service.js';
import { config } from '../config/index.js';
import prisma from '../utils/prisma.js';
import { createAssistantProvider } from '../providers/assistant/assistantProviderFactory.js';
import { emitToUser } from '../utils/socketHub.js';
import { resolveScheduledDate, missingBookingFields, toSafeBookingLog } from '../utils/scheduling.js';

const PENDING_ACTIONS = new Map();

const INTENTS = {
  SCHEDULE_MEETING: 'schedule_meeting',
  SUPPORT_REQUEST: 'support_request',
  PRICING_QUESTION: 'pricing_question',
  GENERAL_QUESTION: 'general_question',
  PRODUCT_QUESTION: 'product_question',
  SALES_INTEREST: 'sales_interest',
  EMERGENCY: 'emergency',
  UNKNOWN: 'unknown',
};

const CONVERSATION_MODES = {
  SALES: 'sales',
  SUPPORT: 'support',
  BOTH: 'both',
};

export async function processReceptionistTurn({ session, userText, channel, userContext }) {
  const { callSid, userId, callId, customerId, customerMemory, currentStage, collectedData, pendingAction } = session;

  let conversationMode = session.conversationMode || CONVERSATION_MODES.BOTH;

  const intent = await classifyIntent(userText, session);

  if (intent === INTENTS.EMERGENCY) {
    const reply = 'I understand this is an urgent situation. I am notifying our team immediately. Please stay safe.';
    await auditService.logCallEvent(userId, 'emergency_detected', { callSid, message: userText });
    return { reply, intent, escalate: true, department: 'emergency' };
  }

  if (intent === INTENTS.PRODUCT_QUESTION || intent === INTENTS.PRICING_QUESTION || intent === INTENTS.SALES_INTEREST) {
    if (intent === INTENTS.SALES_INTEREST || intent === INTENTS.PRICING_QUESTION) {
      conversationMode = CONVERSATION_MODES.SALES;
    }

    const engine = await getKnowledgeEngine();
    const results = await engine.search(userText, {
      mode: conversationMode,
      limit: 3,
    });

    const answer = engine.getAnswer(results, conversationMode);
    const salesTip = engine.getProactiveSalesSuggestion(results);

    const response = { reply: answer, intent, isKnowledgeBase: true, results };

    if (salesTip && conversationMode === CONVERSATION_MODES.SALES) {
      response.proactiveSalesTip = salesTip;
      response.reply = `${answer} ${salesTip}`;
    }

    return response;
  }

  if (intent === INTENTS.SCHEDULE_MEETING) {
    conversationMode = CONVERSATION_MODES.SALES;
    return handleAppointmentIntent(session, userText);
  }

  if (intent === INTENTS.SUPPORT_REQUEST) {
    conversationMode = CONVERSATION_MODES.SUPPORT;
    return handleSupportIntent(session, userText);
  }

  if (userText && userText.length < 60 && currentStage === 'confirming') {
    return handleConfirmation(session, userText);
  }

  if (collectedData?.callerName || userText.length > 10) {
    return {
      reply: 'How can I assist you today? I can help schedule a demo, create a support ticket, or answer questions about FleetNimble.',
      intent: 'clarifying',
      conversationMode,
    };
  }

  const greeting = customerMemory?.isReturning && customerMemory?.customer?.name
    ? `Welcome back, ${customerMemory.customer.name}. How may I help you today?`
    : 'Hello. Thank you for calling FleetNimble. How may I help you today?';

  return { reply: greeting, intent: 'greeting', conversationMode };
}

const SALES_KEYWORDS = [
  'interested in', 'looking for', 'want to buy', 'purchase', 'upgrade',
  'add vehicle', 'new feature', 'capabilities', 'what can', 'offer',
  'benefit', 'advantage', 'help my fleet', 'improve', 'reduce cost',
  'save money', 'increase efficiency', 'grow my fleet',
];

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

  if (SALES_KEYWORDS.some(kw => lower.includes(kw))) {
    return INTENTS.SALES_INTEREST;
  }

  try {
    const engine = await getKnowledgeEngine();
    const results = await engine.search(message, { strict: false, limit: 1 });
    if (results.length > 0 && results[0].score >= 3) {
      return INTENTS.PRODUCT_QUESTION;
    }
  } catch (err) {
    const knowledgeAnswer = await queryKnowledgeBase(message);
    if (knowledgeAnswer) {
      return INTENTS.PRODUCT_QUESTION;
    }
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

  const executionId = `${userId || 'u'}_${callId || 'call'}_${pendingAction}`;
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

async function checkSlotConflict(userId, scheduledDate, durationMinutes = 30) {
  const startWindow = new Date(scheduledDate.getTime() - durationMinutes * 60000);
  const endWindow = new Date(scheduledDate.getTime() + durationMinutes * 60000);
  const conflicting = await prisma.aiReceptionistAppointment.findFirst({
    where: {
      userId,
      scheduledDate: { gte: startWindow, lte: endWindow },
      status: { in: ['SCHEDULED', 'CONFIRMED'] },
    },
    select: { id: true, scheduledDate: true, callerName: true },
  });
  return conflicting;
}

function computeLeadScore(data) {
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

export async function generateAISummary(transcriptEntries, collectedData) {
  if (!transcriptEntries || transcriptEntries.length === 0) return null;
  try {
    const provider = createAssistantProvider();
    if (!provider) {
      logger.warn('SUMMARY_GENERATION_SKIPPED', { reason: 'no_assistant_provider' });
      return null;
    }
    const transcriptText = transcriptEntries
      .map(t => `${t.role === 'caller' ? 'Customer' : 'AI'}: ${t.content}`)
      .join('\n')
      .substring(0, 3000);
    const messages = [
      { role: 'system', content: 'You are a summarization assistant. Summarize the following customer support/sales call conversation in 2-3 concise sentences. Include the caller name, company, purpose, and outcome.' },
      { role: 'user', content: `Conversation:\n${transcriptText}\n\nSummary:` },
    ];
    const response = await provider.sendMessage(messages);
    const summary = (typeof response === 'string' ? response : response?.content || response?.text || '').trim();
    if (summary && summary.length > 10) {
      logger.info('SUMMARY_GENERATED', { summaryLength: summary.length });
      return summary;
    }
    return null;
  } catch (err) {
    logger.warn('SUMMARY_GENERATION_FAILED', { error: err.message });
    return null;
  }
}

export async function executeAppointmentCreation(session) {
  const { userId, companyId, callId, collectedData = {}, callerPhone } = session;
  const executionId = `${userId || 'u'}_${callId || 'call'}_create_appointment`;

  logger.info('TOOL_STARTED', { tool: 'create_appointment', callId, userId });
  logger.info('BOOKING_EXECUTION_STARTED', {
    callId, userId, companyId, collectedData: toSafeBookingLog(collectedData),
  });

  if (PENDING_ACTIONS.has(executionId)) {
    logger.info('TOOL_COMPLETED', { tool: 'create_appointment', callId, result: 'duplicate_prevented' });
    return { success: false, duplicate: true, reply: 'The appointment has already been created. Is there anything else?', intent: 'completed' };
  }

  if (!userId || !companyId) {
    logger.error('TOOL_FAILED', { tool: 'create_appointment', callId, reason: 'missing_owner' });
    logger.warn('BOOKING_FAILED', { callId, reason: 'missing_owner' });
    return { success: false, reply: 'I apologize, but our system is unable to create appointments at this time. Our team has been notified.', intent: 'error', error: 'missing_owner' };
  }

  const missingFields = missingBookingFields(collectedData);
  const hasResolvableDateTime = Boolean(
    collectedData.scheduledDateTime
    || (collectedData.preferredDate && collectedData.preferredTime)
  );
  if (!hasResolvableDateTime) {
    logger.warn('BOOKING_VALIDATION_INCOMPLETE', { callId, userId, missing: missingFields });
    return {
      success: false,
      retryable: false,
      missing_fields: missingFields,
      reply: `I need a few more details to schedule this: ${missingFields.join(', ')}. Could you please provide them?`,
      intent: 'needs_more_info',
      error: 'missing_required_fields',
    };
  }

  const resolvedDate = resolveScheduledDate(collectedData);
  const scheduledDate = resolvedDate || new Date(Date.now() + 86400000);
  if (isNaN(scheduledDate.getTime())) {
    logger.error('TOOL_FAILED', { tool: 'create_appointment', callId, reason: 'invalid_date', date: collectedData.preferredDate, time: collectedData.preferredTime });
    return { success: false, reply: 'I apologize, but we need a valid date and time to schedule. Could you please provide both?', intent: 'error', error: 'invalid_date' };
  }

  const durationMinutes = collectedData.durationMinutes || 30;

  const conflict = await checkSlotConflict(userId, scheduledDate, durationMinutes);
  if (conflict) {
    logger.warn('TOOL_SLOT_CONFLICT', {
      callId, requestedDate: scheduledDate.toISOString(),
      conflictingAppointmentId: conflict.id, conflictingCaller: conflict.callerName,
    });
    return { success: false, conflict: true, reply: `I'm sorry, but there is already an appointment scheduled at that time. Please choose a different date or time.`, intent: 'slot_conflict' };
  }

  const utcDate = new Date(scheduledDate.getTime());
  const timezone = collectedData.timezone || process.env.AI_RECEPTIONIST_TIMEZONE || 'UTC';

  let customer = null;
  let appointment = null;
  let customerCreated = false;

  try {
    const result = await prisma.$transaction(async (tx) => {
      logger.info('DATABASE_WRITE', { tool: 'create_appointment', callId, operation: 'transaction_start' });
      const normalizedPhone = callerPhone || collectedData.phone || null;
      const customerEmail = collectedData.email || null;

      let txCustomer = null;
      if (normalizedPhone || customerEmail) {
        const customerWhere = { userId };
        const customerOrClauses = [];
        if (normalizedPhone) customerOrClauses.push({ phone: normalizedPhone });
        if (customerEmail) customerOrClauses.push({ email: customerEmail });
        if (customerOrClauses.length > 0) {
          customerWhere.OR = customerOrClauses;
          txCustomer = await tx.receptionistCustomer.findFirst({ where: customerWhere });
        }

        if (!txCustomer) {
          txCustomer = await tx.receptionistCustomer.create({
            data: {
              userId,
              companyId,
              phone: normalizedPhone,
              email: customerEmail,
              name: collectedData.callerName || 'Caller',
              companyName: collectedData.company || null,
              industry: collectedData.industry || null,
              fleetSize: collectedData.fleetSize || null,
              status: 'LEAD',
              leadScore: computeLeadScore(collectedData),
              salesStage: 'LEAD',
              lastContactAt: new Date(),
            },
          });
          customerCreated = true;
          logger.info('DATABASE_SUCCESS', { tool: 'create_appointment', callId, operation: 'customer_create', customerId: txCustomer.id });
          logger.info('LEAD_CREATED', { customerId: txCustomer.id, name: collectedData.callerName, company: collectedData.company, leadScore: computeLeadScore(collectedData), callId, userId });
        } else {
          const custUpdates = { lastContactAt: new Date(), totalCalls: { increment: 1 } };
          if (collectedData.callerName && !txCustomer.name) custUpdates.name = collectedData.callerName;
          if (collectedData.company && !txCustomer.companyName) custUpdates.companyName = collectedData.company;
          if (collectedData.industry && !txCustomer.industry) custUpdates.industry = collectedData.industry;
          if (collectedData.fleetSize != null) custUpdates.fleetSize = collectedData.fleetSize;
          txCustomer = await tx.receptionistCustomer.update({
            where: { id: txCustomer.id },
            data: custUpdates,
          });
          logger.info('DATABASE_SUCCESS', { tool: 'create_appointment', callId, operation: 'customer_update', customerId: txCustomer.id });
        }
      }

      const txAppointment = await tx.aiReceptionistAppointment.create({
        data: {
          userId,
          companyId,
          callerName: collectedData.callerName || null,
          callerPhone: normalizedPhone,
          callerEmail: customerEmail,
          companyName: collectedData.company || null,
          industry: collectedData.industry || null,
          fleetSize: collectedData.fleetSize || null,
          meetingPurpose: collectedData.meetingPurpose || 'Demo',
          meetingTitle: collectedData.meetingPurpose ? `${collectedData.meetingPurpose} - FleetNimble` : 'FleetNimble Demo',
          scheduledDate: utcDate,
          durationMinutes,
          timezone,
          status: 'SCHEDULED',
        },
      });
      logger.info('DATABASE_SUCCESS', { tool: 'create_appointment', callId, operation: 'appointment_create', appointmentId: txAppointment.id });

      if (callId) {
        const existingCall = await tx.aiReceptionistCall.findUnique({ where: { id: callId }, select: { id: true } });
        if (existingCall) {
          const callUpdateData = {
            appointmentId: txAppointment.id,
            callType: 'DEMO',
            customerId: txCustomer?.id || undefined,
            callerEmail: customerEmail || undefined,
            fleetSize: collectedData.fleetSize || undefined,
            companyName: collectedData.company || undefined,
            callerName: collectedData.callerName || undefined,
          };
          Object.keys(callUpdateData).forEach(k => { if (callUpdateData[k] === undefined) delete callUpdateData[k]; });
          await tx.aiReceptionistCall.update({ where: { id: callId }, data: callUpdateData });
          logger.info('DATABASE_SUCCESS', { tool: 'create_appointment', callId, operation: 'call_update' });
        } else {
          logger.warn('DATABASE_SKIPPED', { tool: 'create_appointment', callId, operation: 'call_update', reason: 'call_not_found' });
        }
      }

      if (txCustomer && txAppointment) {
        const sentimentHistory = Array.isArray(txCustomer.sentimentHistory) ? txCustomer.sentimentHistory : [];
        sentimentHistory.push({ sentiment: 'positive', date: new Date().toISOString(), callId });
        await tx.receptionistCustomer.update({
          where: { id: txCustomer.id },
          data: {
            totalAppointments: { increment: 1 },
            lastIntent: 'schedule_meeting',
            lastSummary: `Scheduled: ${collectedData.meetingPurpose || 'Demo'} on ${collectedData.preferredDate}`,
            salesStage: 'DEMO',
            sentimentHistory: sentimentHistory.slice(-20),
          },
        });
        logger.info('DATABASE_SUCCESS', { tool: 'create_appointment', callId, operation: 'customer_appointment_link' });
      }

      await tx.aiReceptionistAuditLog.create({
        data: { userId, eventType: 'appointment_created', metadata: { appointmentId: txAppointment.id, callerName: collectedData.callerName, company: collectedData.company, callId } },
      });
      logger.info('AUDIT_LOG_CREATED', { appointmentId: txAppointment.id });

      logger.info('DATABASE_WRITE', { tool: 'create_appointment', callId, operation: 'transaction_commit' });

      return { customer: txCustomer, appointment: txAppointment, customerCreated };
    }, { timeout: 15000 });

    customer = result.customer;
    appointment = result.appointment;
    customerCreated = result.customerCreated;
    logger.info('APPOINTMENT_CREATED', { appointmentId: appointment.id, callId, userId, companyId, customerId: customer?.id });
    logger.info('BOOKING_CONFIRMED', {
      callId,
      userId,
      companyId,
      appointmentId: appointment.id,
      customerId: customer?.id,
      customerCreated,
      scheduledDate: appointment.scheduledDate?.toISOString?.() || null,
      meetingPurpose: appointment.meetingPurpose,
      industry: appointment.industry || null,
    });
    logger.info('CRM_UPDATED', { customerId: customer?.id, appointmentId: appointment.id, operation: 'lead_created_or_updated' });
    logger.info('TRANSCRIPT_SAVED', { context: 'appointment_creation', callId });

    try {
      const { recordTimelineEvent, TIMELINE_EVENT_TYPES } = await import('./conversationTimeline.service.js');
      await recordTimelineEvent({
        userId,
        callId,
        callSid: null,
        eventType: TIMELINE_EVENT_TYPES.APPOINTMENT_CONFIRMED,
        data: { appointmentId: appointment.id, leadScore: customer?.leadScore ?? null },
      });
      if (customer?.id) {
        await recordTimelineEvent({
          userId,
          callId,
          callSid: null,
          eventType: TIMELINE_EVENT_TYPES.CRM_UPDATED,
          data: { customerId: customer.id, operation: 'lead_created_or_updated' },
        });
      }
    } catch (err) {
      logger.warn('APPOINTMENT_TIMELINE_FAILED', { appointmentId: appointment.id, error: err.message });
    }

    PENDING_ACTIONS.set(executionId, { id: appointment.id, timestamp: Date.now() });
    metrics.recordAppointmentCreated();
  } catch (err) {
    logger.error('TOOL_FAILED', {
      tool: 'create_appointment', callId, userId, error: err.message, stack: err.stack,
      prismaError: err.code || null, constraint: err.meta?.constraint || null, field: err.meta?.field_name || null,
    });
    logger.error('BOOKING_FAILED', { callId, userId, reason: err.message, code: err.code || null });
    metrics.recordAppointmentFailed();
    return { success: false, reply: 'I apologize, but I encountered an issue creating the appointment. Our team has been notified. Is there anything else?', intent: 'error', error: err.message };
  }

  try {
    const emailResult = await notificationService.sendConfirmationEmail(userId, appointment);
    logger.info('EMAIL_SENT', { appointmentId: appointment.id, sent: emailResult?.sent, provider: emailResult?.provider });
  } catch (err) {
    logger.warn('EMAIL_FAILED', { appointmentId: appointment.id, error: err.message });
  }

  if (collectedData.phone || callerPhone) {
    try {
      const smsPhone = collectedData.phone || callerPhone;
      const smsResult = await notificationService.sendSmsNotification(userId, smsPhone,
        `Your FleetNimble demo is scheduled. Confirmation: ${appointment.id.substring(0, 8)}. We look forward to speaking with you!`
      );
      logger.info('SMS_SENT', { appointmentId: appointment.id, sent: smsResult?.sent });
    } catch (err) {
      logger.warn('SMS_FAILED', { appointmentId: appointment.id, error: err.message });
    }
  }

  try {
    await notificationService.notifyAdmin(userId, 'appointment_booked', {
      appointmentId: appointment.id, callerName: collectedData.callerName,
      company: collectedData.company, date: collectedData.preferredDate,
    });
    logger.info('ADMIN_NOTIFIED', { appointmentId: appointment.id });
  } catch (err) {
    logger.warn('ADMIN_NOTIFY_FAILED', { appointmentId: appointment.id, error: err.message });
  }

  let calResult;
  try {
    calResult = await calendarService.createCalendarEvent(userId, appointment);
    logger.info('CALENDAR_EVENT_CREATED', { appointmentId: appointment.id, provider: calResult?.provider, eventId: calResult?.eventId });
    if (calResult?.provider !== 'internal' && calResult?.eventId) {
      await prisma.aiReceptionistAppointment.update({
        where: { id: appointment.id },
        data: { calendarProvider: calResult.provider, calendarEventId: calResult.eventId, meetingLink: calResult.meetingLink || null },
      });
      logger.info('CALENDAR_PROVIDER_UPDATED', { appointmentId: appointment.id, provider: calResult.provider });
    }
  } catch (err) {
    logger.warn('CALENDAR_EVENT_FAILED', { appointmentId: appointment.id, error: err.message });
  }

  try {
    const { refreshOnAppointmentCreated } = await import('./receptionistCacheRefresh.service.js');
    await refreshOnAppointmentCreated(userId, appointment.id);
    logger.info('DASHBOARD_REFRESHED', { appointmentId: appointment.id });
  } catch (err) {
    logger.warn('DASHBOARD_UPDATE_FAILED', { appointmentId: appointment.id, error: err.message });
  }

  try {
    const { createFollowUpBundle } = await import('./followUp.service.js');
    const followUps = await createFollowUpBundle({
      userId,
      companyId,
      callId,
      customerId: customer?.id || null,
      appointment,
    });
    logger.info('FOLLOW_UP_BUNDLE_CREATED', { appointmentId: appointment.id, channels: followUps?.created?.map(c => c.channel) || [] });
  } catch (err) {
    logger.warn('FOLLOW_UP_BUNDLE_FAILED', { appointmentId: appointment.id, error: err.message });
  }

  // Socket.IO emissions for real-time frontend updates
  try {
    emitToUser(userId, 'appointment.created', {
      appointmentId: appointment.id,
      callerName: appointment.callerName,
      companyName: appointment.companyName,
      scheduledDate: appointment.scheduledDate,
      status: appointment.status,
      meetingPurpose: appointment.meetingPurpose,
    });
    logger.info('SOCKET_EMIT_SUCCESS', { event: 'appointment.created', userId, appointmentId: appointment.id });
  } catch (err) {
    logger.warn('SOCKET_EMIT_FAILED', { event: 'appointment.created', userId, error: err.message });
  }

  if (customer) {
    try {
      emitToUser(userId, 'crm.updated', {
        customerId: customer.id,
        name: customer.name,
        companyName: customer.companyName,
        leadScore: customer.leadScore,
        status: customer.status,
        totalAppointments: customer.totalAppointments,
      });
      emitToUser(userId, customerCreated ? 'crm.customer.created' : 'crm.customer.updated', {
        customerId: customer.id,
        name: customer.name,
        companyName: customer.companyName,
        industry: customer.industry || null,
        leadScore: customer.leadScore,
        status: customer.status,
        totalAppointments: customer.totalAppointments,
      });
      logger.info('SOCKET_EMIT_SUCCESS', { event: 'crm.updated', userId, customerId: customer.id });
      logger.info('SOCKET_EMIT_SUCCESS', { event: customerCreated ? 'crm.customer.created' : 'crm.customer.updated', userId, customerId: customer.id });
    } catch (err) {
      logger.warn('SOCKET_EMIT_FAILED', { event: 'crm.updated', userId, error: err.message });
    }
  }

  logger.info('TOOL_COMPLETED', { tool: 'create_appointment', callId, appointmentId: appointment.id, customerId: customer?.id });

  const reply = `Perfect! Your demo has been scheduled.\n\n- Purpose: ${collectedData.meetingPurpose || 'Demo'}\n- Date: ${collectedData.preferredDate}\n- Time: ${collectedData.preferredTime || '10:00'}\n- Confirmation: ${appointment.id.substring(0, 8)}\n\nIs there anything else I can help you with?`;

  return { success: true, reply, intent: 'appointment_created', isComplete: true, actionResult: { type: 'appointment', id: appointment.id }, collectedData, customerId: customer?.id };
}

export async function executeSupportTicketCreation(session) {
  const { userId, companyId, callId, collectedData = {} } = session;
  const executionId = `${userId || 'u'}_${callId || 'call'}_create_support_ticket`;

  logger.info('TOOL_STARTED', { tool: 'create_support_ticket', callId, userId });
  logger.info('BOOKING_EXECUTION_STARTED', {
    callId, userId, companyId, tool: 'create_support_ticket', collectedData: toSafeBookingLog(collectedData),
  });

  if (PENDING_ACTIONS.has(executionId)) {
    logger.info('TOOL_COMPLETED', { tool: 'create_support_ticket', callId, result: 'duplicate_prevented' });
    return { success: false, duplicate: true, reply: 'The support ticket has already been created. Is there anything else?', intent: 'completed' };
  }

  if (!userId || !companyId) {
    logger.error('TOOL_FAILED', { tool: 'create_support_ticket', callId, reason: 'missing_owner' });
    logger.warn('BOOKING_FAILED', { callId, reason: 'missing_owner', tool: 'create_support_ticket' });
    return { success: false, reply: 'I apologize, but our system is unable to create support tickets at this time.', intent: 'error', error: 'missing_owner' };
  }

  let ticket;
  try {
    ticket = await prisma.$transaction(async (tx) => {
      logger.info('DATABASE_WRITE', { tool: 'create_support_ticket', callId, operation: 'transaction_start' });

      const txTicket = await tx.aiReceptionistSupportTicket.create({
        data: {
          userId, companyId,
          callerName: collectedData.callerName || 'Caller',
          callerPhone: collectedData.phone || null,
          callerEmail: collectedData.email || null,
          companyName: collectedData.company || null,
          issueTitle: collectedData.issue?.substring(0, 200) || 'Support request',
          issueDescription: collectedData.issue || null,
          urgency: collectedData.urgency || 'MEDIUM',
          status: 'OPEN',
          relatedVehicleId: collectedData.vehicleReference || null,
        },
      });
      logger.info('DATABASE_SUCCESS', { tool: 'create_support_ticket', callId, operation: 'ticket_create', ticketId: txTicket.id });

      if (callId) {
        const existingCall = await tx.aiReceptionistCall.findUnique({ where: { id: callId }, select: { id: true } });
        if (existingCall) {
          await tx.aiReceptionistCall.update({
            where: { id: callId },
            data: { supportTicketId: txTicket.id, callType: 'SUPPORT' },
          });
          logger.info('DATABASE_SUCCESS', { tool: 'create_support_ticket', callId, operation: 'call_update' });
        } else {
          logger.warn('DATABASE_SKIPPED', { tool: 'create_support_ticket', callId, operation: 'call_update', reason: 'call_not_found' });
        }
      }

      logger.info('DATABASE_WRITE', { tool: 'create_support_ticket', callId, operation: 'transaction_commit' });
      return txTicket;
    }, { timeout: 15000 });

    PENDING_ACTIONS.set(executionId, { id: ticket.id, timestamp: Date.now() });
    metrics.recordTicketCreated();
    logger.info('SUPPORT_TICKET_CREATED', { ticketId: ticket.id, callId, userId, companyId });
  } catch (err) {
    logger.error('TOOL_FAILED', {
      tool: 'create_support_ticket', callId, userId, error: err.message, stack: err.stack,
      prismaError: err.code || null, constraint: err.meta?.constraint || null,
    });
    metrics.recordTicketFailed();
    return { success: false, reply: 'I apologize, but I encountered an issue creating the support ticket. Our team has been notified.', intent: 'error', error: err.message };
  }

  try {
    await notificationService.notifyAdmin(userId, 'support_ticket_created', {
      ticketId: ticket.id, issue: collectedData.issue?.substring(0, 100),
      caller: collectedData.callerName, urgency: collectedData.urgency || 'MEDIUM',
    });
    logger.info('ADMIN_NOTIFIED', { ticketId: ticket.id });
  } catch (err) {
    logger.warn('ADMIN_NOTIFY_FAILED', { ticketId: ticket.id, error: err.message });
  }

  if (collectedData.phone) {
    try {
      const smsResult = await notificationService.sendSmsNotification(userId, collectedData.phone,
        `Your support ticket has been created (Ref: ${ticket.id.substring(0, 8)}). Our team will follow up soon.`
      );
      logger.info('SMS_SENT', { ticketId: ticket.id, sent: smsResult?.sent });
    } catch (err) {
      logger.warn('SMS_FAILED', { ticketId: ticket.id, error: err.message });
    }
  }

  try {
    await prisma.aiReceptionistAuditLog.create({
      data: { userId, eventType: 'support_ticket_created', metadata: { ticketId: ticket.id, issue: collectedData.issue?.substring(0, 100), urgency: collectedData.urgency } },
    });
    logger.info('AUDIT_LOG_CREATED', { ticketId: ticket.id });
  } catch (err) {
    logger.warn('AUDIT_LOG_FAILED', { ticketId: ticket.id, error: err.message });
  }

  try {
    const { refreshOnTicketCreated } = await import('./receptionistCacheRefresh.service.js');
    await refreshOnTicketCreated(userId, ticket.id);
    logger.info('DASHBOARD_UPDATED', { ticketId: ticket.id });
  } catch (err) {
    logger.warn('DASHBOARD_UPDATE_FAILED', { ticketId: ticket.id, error: err.message });
  }

  // Socket.IO emissions for real-time frontend updates
  try {
    emitToUser(userId, 'support_ticket.created', {
      ticketId: ticket.id,
      issueTitle: ticket.issueTitle,
      callerName: ticket.callerName,
      companyName: ticket.companyName,
      urgency: ticket.urgency,
      status: ticket.status,
    });
    emitToUser(userId, 'support.ticket.created', {
      ticketId: ticket.id,
      issueTitle: ticket.issueTitle,
      callerName: ticket.callerName,
      companyName: ticket.companyName,
      urgency: ticket.urgency,
      status: ticket.status,
    });
    logger.info('SOCKET_EMIT_SUCCESS', { event: 'support_ticket.created', userId, ticketId: ticket.id });
    logger.info('SOCKET_EMIT_SUCCESS', { event: 'support.ticket.created', userId, ticketId: ticket.id });
  } catch (err) {
    logger.warn('SOCKET_EMIT_FAILED', { event: 'support_ticket.created', userId, error: err.message });
  }

  try {
    const { recordTimelineEvent, TIMELINE_EVENT_TYPES } = await import('./conversationTimeline.service.js');
    await recordTimelineEvent({
      userId,
      callId,
      callSid: null,
      eventType: TIMELINE_EVENT_TYPES.SUPPORT_TICKET_CREATED,
      data: { ticketId: ticket.id, issue: collectedData.issue?.substring(0, 100), urgency: collectedData.urgency || 'MEDIUM' },
    });
  } catch (err) {
    logger.warn('SUPPORT_TICKET_TIMELINE_FAILED', { ticketId: ticket.id, error: err.message });
  }

  logger.info('TOOL_COMPLETED', { tool: 'create_support_ticket', callId, ticketId: ticket.id });

  const reply = `I have created a support ticket for your issue.\n\n- Reference: ${ticket.id.substring(0, 8)}\n- Issue: ${collectedData.issue}\n- Urgency: ${collectedData.urgency || 'MEDIUM'}\n\nOur support team will follow up with you soon. Is there anything else I can help you with?`;

  return { success: true, reply, intent: 'support_ticket_created', isComplete: true, actionResult: { type: 'support_ticket', id: ticket.id }, collectedData };
}

export async function lookupCustomerByPhone(userId, phone) {
  return lookupCustomer(userId, { phone });
}

export async function lookupCustomerByEmail(userId, email) {
  return lookupCustomer(userId, { email });
}

export async function lookupCustomerById(userId, customerId) {
  if (!customerId || !userId) return null;
  try {
    const customer = await prisma.receptionistCustomer.findFirst({
      where: { id: customerId, userId },
    });
    if (!customer) return null;
    return memoryService.getCustomerMemory(customer.id);
  } catch (err) {
    logger.warn('CUSTOMER_LOOKUP_FAILED', { userId, customerId, error: err.message });
    return null;
  }
}

async function lookupCustomer(userId, { phone, email, name }) {
  if (!userId) {
    logger.info('CUSTOMER_LOOKUP_SKIPPED_NO_OWNER');
    return null;
  }
  try {
    const where = { userId };
    const orClauses = [];
    if (phone) {
      const normalized = phone.replace(/[^\d+]/g, '');
      orClauses.push({ phone: normalized });
    }
    if (email) {
      orClauses.push({ email: email.toLowerCase() });
    }
    if (name) {
      orClauses.push({ name: { equals: name, mode: 'insensitive' } });
    }
    if (orClauses.length === 0) return null;
    where.OR = orClauses;

    const customer = await prisma.receptionistCustomer.findFirst({ where });
    if (!customer) return null;
    return memoryService.getCustomerMemory(customer.id);
  } catch (err) {
    logger.warn('CUSTOMER_LOOKUP_FAILED', { userId, error: err.message });
    return null;
  }
}

export async function createCallRecord({ userId, companyId, callSid, from, to, twilioAccountSid }) {
  if (!userId || !companyId) {
    logger.info('CALL_RECORD_SKIPPED_NO_OWNER', { callSid });
    return null;
  }
  try {
    const normalizedFrom = from ? from.replace(/[^\d+]/g, '') : null;

    const call = await prisma.aiReceptionistCall.upsert({
      where: { twilioCallSid: callSid },
      update: {
        callStatus: 'IN_PROGRESS',
        callerPhone: normalizedFrom,
        twilioFrom: normalizedFrom,
        twilioTo: to ? to.replace(/[^\d+]/g, '') : null,
        twilioAccountSid: twilioAccountSid || null,
      },
      create: {
        userId,
        companyId,
        twilioCallSid: callSid,
        twilioAccountSid: twilioAccountSid || null,
        callerPhone: normalizedFrom,
        twilioFrom: normalizedFrom,
        twilioTo: to ? to.replace(/[^\d+]/g, '') : null,
        callStatus: 'IN_PROGRESS',
        callStartedAt: new Date(),
        callerName: normalizedFrom ? `Caller (${normalizedFrom.slice(-4)})` : 'Caller',
        detectedLanguage: 'en',
      },
    });

    logger.info('CALL_STARTED', { callSid, callId: call.id, userId, companyId });
    return call;
  } catch (err) {
    logger.error('CALL_RECORD_CREATE_FAILED', { callSid, error: err.message, userId });
    return null;
  }
}

export async function updateCallRecordAtEnd({ callId, callSid, userId, intent, summary, transcript, sentiment, customerId, appointmentId, supportTicketId, handoffReason, aiConfidence }) {
  if (!callId && !callSid) return;
  try {
    const callEndedAt = new Date();
    const callStatus = handoffReason ? 'ESCALATED' : 'COMPLETED';

    await prisma.$transaction(async (tx) => {
      let targetCallId = callId;

      if (callSid) {
        const existing = await tx.aiReceptionistCall.findFirst({ where: { twilioCallSid: callSid } });
        if (!existing) return;
        targetCallId = existing.id;

        const updates = {
          callEndedAt,
          callStatus,
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
        if (callEndedAt && existing.callStartedAt) {
          updates.durationSeconds = Math.round((callEndedAt.getTime() - new Date(existing.callStartedAt).getTime()) / 1000);
        }

        await tx.aiReceptionistCall.update({ where: { id: existing.id }, data: updates });
        logger.info('TRANSCRIPT_SAVED', { callId: existing.id, transcriptLength: transcript?.length || 0 });
        logger.info('CALL_RECORD_ENDED', { callSid, callId: existing.id, status: callStatus });
      }

      if (customerId) {
        const custUpdates = {
          lastContactAt: callEndedAt,
        };
        if (intent) custUpdates.lastIntent = intent;
        if (summary) custUpdates.lastSummary = summary?.substring(0, 500);
        await tx.receptionistCustomer.update({ where: { id: customerId }, data: custUpdates });
        logger.info('CRM_UPDATED', { customerId, callId: targetCallId });
      }
    }, { timeout: 15000 });
  } catch (err) {
    logger.error('CALL_RECORD_UPDATE_FAILED', { callSid, callId, error: err.message });
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
    await prisma.$transaction(async (tx) => {
      const existing = await tx.receptionistCustomer.findUnique({ where: { id: customerId }, select: { phone: true, email: true, name: true } });
      if (!existing) return;

      const updates = {
        lastIntent: intent,
        lastSummary: summary?.substring(0, 500),
        lastContactAt: new Date(),
      };
      if (collectedData?.company) updates.companyName = collectedData.company;
      if (collectedData?.fleetSize != null) updates.fleetSize = collectedData.fleetSize;
      if (collectedData?.callerName && !existing.name) updates.name = collectedData.callerName;
      if (collectedData?.phone && !existing.phone) updates.phone = collectedData.phone;
      if (collectedData?.email && !existing.email) updates.email = collectedData.email;

      await tx.receptionistCustomer.update({ where: { id: customerId }, data: updates });
      logger.info('CRM_UPDATED', { customerId });
    }, { timeout: 15000 });
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
