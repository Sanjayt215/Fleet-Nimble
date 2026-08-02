import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import { recordTimelineEvent, TIMELINE_EVENT_TYPES } from './conversationTimeline.service.js';
import { logSummaryCreated } from '../utils/callAudit.js';
import { isPersistenceAvailable } from './receptionistTenantResolver.service.js';

function countByRole(transcriptEntries, role) {
  return transcriptEntries.filter(t => t.role === role).length;
}

function extractIntent(transcriptEntries, callIntent) {
  if (callIntent) return callIntent;
  const text = transcriptEntries.map(t => t.content).join(' ').toLowerCase();
  if (/\b(demo|schedule|book|appointment|meeting)\b/i.test(text)) return 'SCHEDULE_MEETING';
  if (/\b(problem|issue|broken|ticket|support|not working|error)\b/i.test(text)) return 'SUPPORT_REQUEST';
  if (/\b(price|pricing|cost|how much|quote)\b/i.test(text)) return 'PRICING_QUESTION';
  if (/\b(gps|tracking|telematics|maintenance|fuel|dashboard)\b/i.test(text)) return 'FLEET_QUESTION';
  if (/\b(interested in|want to buy|purchase|upgrade)\b/i.test(text)) return 'SALES_INTEREST';
  return 'GENERAL_QUESTION';
}

function detectSentiment(transcriptEntries) {
  let score = 0;
  let samples = 0;
  const positives = /\b(great|perfect|awesome|excellent|thanks|thank you|love|happy|nice|good|pleased|awesome)\b/i;
  const negatives = /\b(bad|terrible|awful|angry|frustrated|annoyed|disappointed|useless|waste|slow|broken|issue|problem|not working|fed up|sick of)\b/i;
  for (const entry of transcriptEntries) {
    if (entry.role !== 'caller') continue;
    samples++;
    if (positives.test(entry.content)) score += 1;
    if (negatives.test(entry.content)) score -= 1;
  }
  if (samples === 0) return 'neutral';
  const ratio = score / samples;
  if (ratio >= 0.25) return 'positive';
  if (ratio <= -0.25) return 'negative';
  return 'neutral';
}

function summarizeTranscript(transcriptEntries, maxLines = 4) {
  const lines = transcriptEntries
    .map(t => `${t.role === 'caller' ? 'Customer' : 'AI'}: ${t.content}`)
    .join(' ');
  return lines.substring(0, 1200);
}

function buildExecutiveSummary({ transcriptEntries, collectedData, intent, sentiment, outcome }) {
  const callerName = collectedData.callerName || 'Caller';
  const company = collectedData.company || null;
  const callerText = countByRole(transcriptEntries, 'caller');
  const assistantText = countByRole(transcriptEntries, 'assistant');
  const parts = [];
  parts.push(`Caller ${callerName}${company ? ` from ${company}` : ''} contacted FleetNimble with a ${intent.toLowerCase().replace(/_/g, ' ')} inquiry.`);
  parts.push(`The conversation spanned ${callerText} customer exchanges and ${assistantText} assistant replies, ending with a ${sentiment} sentiment.`);
  if (outcome.appointment) parts.push('A demo appointment was scheduled and confirmed during the call.');
  if (outcome.ticket) parts.push('A support ticket was created for follow-up.');
  if (outcome.leadScore != null) parts.push(`The qualified lead was scored ${outcome.leadScore}/100.`);
  if (parts.length === 0) parts.push('Call completed without a scheduled outcome.');
  return parts.join(' ');
}

function buildSalesSummary({ transcriptEntries, collectedData, leadProfile, intent, outcome }) {
  if (!['PRICING_QUESTION', 'SALES_INTEREST', 'SCHEDULE_MEETING'].includes(intent) && !leadProfile) {
    return 'No sales activity detected in this call.';
  }
  const parts = [];
  if (leadProfile) {
    if (leadProfile.industry) parts.push(`Industry: ${leadProfile.industry}.`);
    if (leadProfile.fleetSize != null) parts.push(`Fleet size: ${leadProfile.fleetSize} vehicles.`);
    if (leadProfile.companyType) parts.push(`Company type: ${leadProfile.companyType}.`);
    if (leadProfile.painPoints?.length) parts.push(`Pain points: ${leadProfile.painPoints.join(', ')}.`);
    if (leadProfile.currentFleetSoftware) parts.push(`Current software: ${leadProfile.currentFleetSoftware}.`);
    if (leadProfile.budgetRange) parts.push(`Budget range: ${leadProfile.budgetRange}.`);
    if (leadProfile.buyingTimeline) parts.push(`Buying timeline: ${leadProfile.buyingTimeline}.`);
    if (leadProfile.decisionMaker) parts.push(`Decision maker: ${leadProfile.decisionMaker}.`);
    if (leadProfile.urgency) parts.push(`Urgency: ${leadProfile.urgency}.`);
    if (leadProfile.leadScore != null) parts.push(`Lead score: ${leadProfile.leadScore}/100.`);
  }
  if (outcome.appointment) parts.push('Demo booked — follow-up sequence has been scheduled.');
  if (outcome.leadScore != null) parts.push(`Overall lead quality score: ${outcome.leadScore}/100.`);
  return parts.join(' ') || 'Sales-qualifying conversation; no hard data captured yet.';
}

function buildSupportSummary({ transcriptEntries, collectedData, intent, ticket }) {
  if (!['SUPPORT_REQUEST', 'TECHNICAL_ISSUE'].includes(intent) && !ticket) {
    return 'No support request detected in this call.';
  }
  const text = summarizeTranscript(transcriptEntries);
  const parts = [];
  if (collectedData.issue) parts.push(`Issue reported: ${String(collectedData.issue).substring(0, 300)}.`);
  if (collectedData.urgency) parts.push(`Urgency level: ${collectedData.urgency}.`);
  if (ticket) parts.push(`Support ticket created (${ticket.id ? ticket.id.substring(0, 8) : 'reference'}); team will follow up.`);
  if (collectedData.vehicleReference) parts.push(`Related vehicle: ${collectedData.vehicleReference}.`);
  parts.push(`Support conversation excerpt: ${text.substring(0, 400)}`);
  return parts.join(' ');
}

function buildNextBestAction({ intent, outcome, leadProfile, sentiment, ticket }) {
  if (outcome.appointment) {
    return 'Send appointment confirmation with calendar invite and prepare a tailored product demo for the booked slot.';
  }
  if (ticket || intent === 'SUPPORT_REQUEST' || intent === 'TECHNICAL_ISSUE') {
    return 'Assign the support ticket to the appropriate queue and follow up within 24 hours with a resolution update.';
  }
  if (intent === 'PRICING_QUESTION' || intent === 'SALES_INTEREST' || leadProfile) {
    if (leadProfile?.buyingTimeline === 'immediately' || leadProfile?.urgency === 'CRITICAL' || leadProfile?.urgency === 'HIGH') {
      return 'Call the lead back within 24 hours with a tailored quote; a demo proposal should be prioritized.';
    }
    return 'Send a personalized follow-up email with pricing options and offer a demo within the stated buying timeline.';
  }
  if (intent === 'SCHEDULE_MEETING') {
    return 'Confirm the preferred demo date and time with the caller and add them to the sales outreach sequence.';
  }
  if (sentiment === 'negative') {
    return 'Send an apology and a service recovery offer; review the call for quality issues.';
  }
  return 'Add the caller to the nurture sequence with product value content.';
}

export async function generateConversationSummaries({
  userId,
  callId,
  callSid = null,
  customerId = null,
  transcriptEntries = [],
  collectedData = {},
  callIntent = null,
  leadProfile = null,
  ticket = null,
}) {
  const intent = extractIntent(transcriptEntries, callIntent);
  const sentiment = collectedData.sentiment || detectSentiment(transcriptEntries);
  const outcome = {
    appointment: Boolean(collectedData.appointmentCreated),
    ticket: Boolean(ticket || collectedData.supportTicketCreated),
    leadScore: leadProfile?.leadScore ?? collectedData.leadScore ?? null,
  };

  const summaries = {
    executiveSummary: buildExecutiveSummary({ transcriptEntries, collectedData, intent, sentiment, outcome }),
    salesSummary: buildSalesSummary({ transcriptEntries, collectedData, leadProfile, intent, outcome }),
    supportSummary: buildSupportSummary({ transcriptEntries, collectedData, intent, ticket }),
    sentiment,
    customerIntent: intent,
    nextBestAction: buildNextBestAction({ intent, outcome, leadProfile, sentiment, ticket }),
  };

  if (callId && isPersistenceAvailable()) {
    try {
      const saved = await prisma.conversationSummary.upsert({
        where: { callId },
        update: { ...summaries, customerId },
        create: { callId, userId, customerId, ...summaries },
      });
      logger.info('CONVERSATION_SUMMARY_STORED', { callId, intent });
    } catch (err) {
      logger.warn('CONVERSATION_SUMMARY_PERSIST_FAILED', { callId, error: err.message });
    }
  }

  await logSummaryCreated({ userId, callId, callSid, summaryType: 'conversation', data: { intent, sentiment } });

  await recordTimelineEvent({
    userId,
    callId,
    callSid,
    eventType: TIMELINE_EVENT_TYPES.SUMMARY_CREATED,
    data: { intent, sentiment, nextBestAction: summaries.nextBestAction },
  });

  return summaries;
}

export async function getConversationSummaryByCall(userId, callId) {
  if (!isPersistenceAvailable()) return null;
  try {
    const summary = await prisma.conversationSummary.findFirst({
      where: { callId, userId },
    });
    if (summary) {
      return {
        ...summary,
        call: undefined,
      };
    }
    return null;
  } catch (err) {
    logger.warn('CONVERSATION_SUMMARY_QUERY_FAILED', { callId, error: err.message });
    return null;
  }
}

export async function getConversationSummaries(userId, { limit = 50, intent = null } = {}) {
  if (!isPersistenceAvailable()) return [];
  try {
    const where = { userId };
    if (intent) where.customerIntent = intent;
    const summaries = await prisma.conversationSummary.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        call: { select: { id: true, callerName: true, callerPhone: true, callStatus: true, callStartedAt: true, callEndedAt: true, durationSeconds: true } },
        customer: { select: { id: true, name: true, companyName: true } },
      },
    });
    return summaries.map(s => ({ ...s, call: undefined, customer: undefined, callInfo: s.call, customerInfo: s.customer }));
  } catch (err) {
    logger.warn('CONVERSATION_SUMMARIES_QUERY_FAILED', { userId, error: err.message });
    return [];
  }
}
