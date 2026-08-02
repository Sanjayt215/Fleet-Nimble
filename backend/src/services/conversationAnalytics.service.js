import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import { isPersistenceAvailable } from './receptionistTenantResolver.service.js';

function computeTalkRatio(transcriptEntries) {
  const wordCount = role => transcriptEntries
    .filter(t => t.role === role)
    .reduce((sum, t) => sum + String(t.content || '').trim().split(/\s+/).filter(Boolean).length, 0);
  const callerWords = wordCount('caller');
  const assistantWords = wordCount('assistant');
  const total = callerWords + assistantWords;
  if (total === 0) return 0.5;
  return Math.round((callerWords / total) * 100) / 100;
}

function computeResponseLatencyMs(transcriptEntries) {
  const latencies = [];
  for (let i = 1; i < transcriptEntries.length; i++) {
    const prev = transcriptEntries[i - 1];
    const cur = transcriptEntries[i];
    if (prev.role !== cur.role) {
      const prevTs = new Date(prev.timestamp).getTime();
      const curTs = new Date(cur.timestamp).getTime();
      if (Number.isFinite(prevTs) && Number.isFinite(curTs) && curTs >= prevTs) {
        latencies.push(curTs - prevTs);
      }
    }
  }
  if (latencies.length === 0) return 0;
  return Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
}

function countTimelineEvents(timelineEvents, eventTypes) {
  return timelineEvents.filter(e => eventTypes.includes(e.eventType)).length;
}

function computeSilenceDurationMs(transcriptEntries) {
  let silence = 0;
  const MIN_GAP_MS = 5000;
  for (let i = 1; i < transcriptEntries.length; i++) {
    const prevTs = new Date(transcriptEntries[i - 1].timestamp).getTime();
    const curTs = new Date(transcriptEntries[i].timestamp).getTime();
    if (Number.isFinite(prevTs) && Number.isFinite(curTs) && curTs > prevTs) {
      const gap = curTs - prevTs;
      if (gap > MIN_GAP_MS) silence += gap - MIN_GAP_MS;
    }
  }
  return Math.round(silence);
}

function computeConversationScore({ talkRatio, avgResponseLatencyMs, interruptions, silenceDurationMs, knowledgeHits, transcriptEntries }) {
  let score = 60;
  const idealTalkRatio = 0.5;
  score += (1 - Math.abs(talkRatio - idealTalkRatio) * 2) * 15;
  if (avgResponseLatencyMs === 0 || avgResponseLatencyMs <= 4000) score += 10;
  else if (avgResponseLatencyMs <= 8000) score += 5;
  else score -= 5;
  score -= Math.min(interruptions * 3, 15);
  if (silenceDurationMs <= 30000) score += 5;
  else if (silenceDurationMs > 90000) score -= 5;
  score += Math.min(knowledgeHits * 2, 10);
  if (transcriptEntries.length === 0) score = 0;
  return Math.min(Math.max(Math.round(score), 0), 100);
}

function computeSalesScore({ intent, leadScore, appointmentCreated, knowledgeHits }) {
  let score = 0;
  if (appointmentCreated) return 100;
  if (['PRICING_QUESTION', 'SALES_INTEREST', 'SCHEDULE_MEETING'].includes(intent)) score += 40;
  if (leadScore != null) score += Math.round(leadScore * 0.4);
  if (knowledgeHits > 0) score += 10;
  return Math.min(score, 100);
}

function computeSupportScore({ intent, ticketCreated, sentiment }) {
  let score = 0;
  if (['SUPPORT_REQUEST', 'TECHNICAL_ISSUE'].includes(intent)) score += 40;
  if (ticketCreated) score += 40;
  if (sentiment === 'positive') score += 20;
  else if (sentiment === 'negative') score -= 10;
  return Math.min(Math.max(score, 0), 100);
}

export async function computeConversationAnalytics({
  userId,
  callId,
  callSid = null,
  transcriptEntries = [],
  timelineEvents = [],
  collectedData = {},
  intent = null,
  sentiment = null,
  sessionMetrics = null,
}) {
  const talkRatio = computeTalkRatio(transcriptEntries);
  const avgResponseLatencyMs = computeResponseLatencyMs(transcriptEntries);
  const interruptions = Math.max(sessionMetrics?.interruptions || 0, 0);
  const silenceDurationMs = sessionMetrics?.silenceDurationMs ?? computeSilenceDurationMs(transcriptEntries);
  const knowledgeHits = countTimelineEvents(timelineEvents, ['KNOWLEDGE_SEARCHED']);
  const toolUses = countTimelineEvents(timelineEvents, ['TOOL_STARTED']);
  const appointmentCreated = Boolean(collectedData.appointmentCreated);
  const ticketCreated = Boolean(collectedData.supportTicketCreated);
  const leadScore = collectedData.leadScore ?? null;

  const breakdown = {
    talkRatio,
    callerWords: transcriptEntries.filter(t => t.role === 'caller').reduce((s, t) => s + String(t.content || '').split(/\s+/).filter(Boolean).length, 0),
    assistantWords: transcriptEntries.filter(t => t.role === 'assistant').reduce((s, t) => s + String(t.content || '').split(/\s+/).filter(Boolean).length, 0),
    avgResponseLatencyMs,
    interruptions,
    silenceDurationMs,
    knowledgeHits,
    toolUses,
    transcriptLines: transcriptEntries.length,
    timelineEvents: timelineEvents.length,
    appointmentCreated,
    ticketCreated,
    intent,
    sentiment,
  };

  const analytics = {
    talkRatio,
    avgResponseLatencyMs,
    interruptions,
    silenceDurationMs,
    knowledgeHits,
    toolUses,
    conversationScore: computeConversationScore({ talkRatio, avgResponseLatencyMs, interruptions, silenceDurationMs, knowledgeHits, transcriptEntries }),
    salesScore: computeSalesScore({ intent, leadScore, appointmentCreated, knowledgeHits }),
    supportScore: computeSupportScore({ intent, ticketCreated, sentiment }),
    breakdown,
  };

  if (callId && isPersistenceAvailable()) {
    try {
      await prisma.conversationAnalytics.upsert({
        where: { callId },
        update: { ...analytics, breakdown },
        create: { callId, userId, ...analytics, breakdown },
      });
      logger.info('CONVERSATION_ANALYTICS_STORED', { callId });
    } catch (err) {
      logger.warn('CONVERSATION_ANALYTICS_PERSIST_FAILED', { callId, error: err.message });
    }
  }

  return analytics;
}

export async function getConversationAnalyticsByCall(userId, callId) {
  if (!isPersistenceAvailable()) return null;
  try {
    return await prisma.conversationAnalytics.findFirst({ where: { callId, userId } });
  } catch (err) {
    logger.warn('CONVERSATION_ANALYTICS_QUERY_FAILED', { callId, error: err.message });
    return null;
  }
}

export async function getConversationAnalyticsOverview(userId, { days = 30 } = {}) {
  if (!isPersistenceAvailable()) return {};
  try {
    const since = new Date(Date.now() - days * 86400000);
    const [calls, analytics] = await Promise.all([
      prisma.aiReceptionistCall.findMany({
        where: { userId, callStartedAt: { gte: since }, callStatus: { in: ['COMPLETED', 'ESCALATED'] } },
        select: { id: true },
      }),
      prisma.conversationAnalytics.findMany({
        where: { userId, createdAt: { gte: since } },
      }),
    ]);
    const n = analytics.length;
    const avg = (fn) => (n ? Math.round(analytics.reduce((s, a) => s + fn(a), 0) / n) : 0);
    return {
      callsCompleted: calls.length,
      analyzed: n,
      avgTalkRatio: n ? Math.round(analytics.reduce((s, a) => s + a.talkRatio, 0) / n * 100) / 100 : 0,
      avgResponseLatencyMs: avg(a => a.avgResponseLatencyMs),
      totalInterruptions: analytics.reduce((s, a) => s + a.interruptions, 0),
      avgSilenceDurationMs: avg(a => a.silenceDurationMs),
      totalKnowledgeHits: analytics.reduce((s, a) => s + a.knowledgeHits, 0),
      totalToolUses: analytics.reduce((s, a) => s + a.toolUses, 0),
      avgConversationScore: avg(a => a.conversationScore),
      avgSalesScore: avg(a => a.salesScore),
      avgSupportScore: avg(a => a.supportScore),
    };
  } catch (err) {
    logger.warn('CONVERSATION_ANALYTICS_OVERVIEW_FAILED', { userId, error: err.message });
    return {};
  }
}
