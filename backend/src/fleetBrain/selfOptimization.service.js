import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import { config } from '../config/index.js';
import { emitToUser, emitToAdminRoom } from '../utils/socketHub.js';
import { isPersistenceAvailable } from '../services/receptionistTenantResolver.service.js';

/**
 * Fleet Brain Self-Optimization.
 * After every call the brain learns from the conversation, fleet issues,
 * sales objections, knowledge gaps and business KPIs, then generates
 * recommendations. The brain NEVER auto-modifies production — all learnings
 * are recommendations only (applied stays false until a human acts).
 */

export const LEARNING_TYPES = Object.freeze({
  CONVERSATION: 'CONVERSATION',
  FLEET_ISSUE: 'FLEET_ISSUE',
  SALES_OBJECTION: 'SALES_OBJECTION',
  KNOWLEDGE_GAP: 'KNOWLEDGE_GAP',
  KPI: 'KPI',
});

const OBJECTION_PATTERNS = [
  { objection: 'price', patterns: [/too expensive/i, /price( is)? (high|too much)/i, /cost concern/i, /over budget/i, /can't afford/i] },
  { objection: 'time', patterns: [/no time/i, /too busy/i, /don'?t have time/i, /later/i, /not now/i] },
  { objection: 'trust', patterns: [/never heard of/i, /how do i know/i, /is it safe/i, /trust/i] },
  { objection: 'switching cost', patterns: [/already (use|have)/i, /switching/i, /migration/i, /too much work/i, /change (is )?hard/i] },
  { objection: 'need', patterns: [/don'?t need/i, /not needed/i, /we are fine/i, /not interested/i] },
];

const FLEET_ISSUE_PATTERNS = [
  { issue: 'breakdowns', patterns: [/break.?down/i, /breaking down/i, /broke down/i, /down time|downtime/i] },
  { issue: 'fuel waste', patterns: [/fuel (cost|consumption|usage)/i, /wasting fuel/i] },
  { issue: 'speeding', patterns: [/speeding/i, /hard braking/i, /reckless/i] },
  { issue: 'maintenance delays', patterns: [/maintenance (delay|behind|missed|overdue)/i, /service due/i] },
  { issue: 'theft', patterns: [/stolen/i, /theft/i] },
];

const KNOWLEDGE_GAP_PATTERNS = [
  { gap: 'unknown answer', patterns: [/i don'?t know/i, /not sure/i, /can'?t answer/i, /unable to answer/i, /i can check/i] },
  { gap: 'unresolved pricing', patterns: [/price/i, /pricing/i, /cost/i] },
  { gap: 'unresolved integration', patterns: [/integration/i, /api/i, /connect/i] },
];

export async function learnFromCall({ userId, companyId = null, callId = null, callSid = null, transcriptEntries = [], collectedData = {}, timelineEvents = [], analytics = null }) {
  const learnings = [];

  const transcriptText = Array.isArray(transcriptEntries)
    ? transcriptEntries.map(t => t.content).join(' ')
    : String(collectedData.transcript || '');

  // Conversation learning — capture intent, sentiment, outcome
  learnings.push({
    type: LEARNING_TYPES.CONVERSATION,
    content: `Call ${callId || callSid || 'unknown'} — intent ${collectedData.intent || 'UNKNOWN'}, sentiment ${collectedData.sentiment || 'neutral'}, ${transcriptEntries?.length || 0} turns.`,
    data: {
      intent: collectedData.intent || null,
      sentiment: collectedData.sentiment || 'neutral',
      turns: transcriptEntries?.length || 0,
      appointmentCreated: !!collectedData.appointmentCreated,
      ticketCreated: !!collectedData.supportTicketCreated,
    },
  });

  // Sales objections
  for (const entry of OBJECTION_PATTERNS) {
    if (entry.patterns.some(p => p.test(transcriptText))) {
      learnings.push({
        type: LEARNING_TYPES.SALES_OBJECTION,
        content: `Objection detected: ${entry.objection}`,
        data: { objection: entry.objection },
      });
    }
  }

  // Fleet issues
  for (const entry of FLEET_ISSUE_PATTERNS) {
    if (entry.patterns.some(p => p.test(transcriptText))) {
      learnings.push({
        type: LEARNING_TYPES.FLEET_ISSUE,
        content: `Fleet issue raised: ${entry.issue}`,
        data: { issue: entry.issue },
      });
    }
  }

  // Knowledge gaps — unresolved intent or search with no answer
  const searchedKnowledge = (timelineEvents || []).filter(e => e.eventType === 'KNOWLEDGE_SEARCHED');
  for (const entry of KNOWLEDGE_GAP_PATTERNS) {
    if (entry.patterns.some(p => p.test(transcriptText))) {
      learnings.push({
        type: LEARNING_TYPES.KNOWLEDGE_GAP,
        content: `Knowledge gap: ${entry.gap}`,
        data: { gap: entry.gap },
      });
      break;
    }
  }
  if (searchedKnowledge.length > 0 && !collectedData.answered) {
    learnings.push({
      type: LEARNING_TYPES.KNOWLEDGE_GAP,
      content: 'Knowledge searches returned without a confirmed answer',
      data: { searches: searchedKnowledge.length, topics: searchedKnowledge.slice(0, 5).map(e => e.data?.query || null).filter(Boolean) },
    });
  }

  // KPI learning
  if (analytics) {
    learnings.push({
      type: LEARNING_TYPES.KPI,
      content: `Call KPIs — conversation score ${analytics.conversationScore}, sales ${analytics.salesScore}, support ${analytics.supportScore}, latency ${analytics.avgResponseLatencyMs}ms, interruptions ${analytics.interruptions}.`,
      data: {
        conversationScore: analytics.conversationScore,
        salesScore: analytics.salesScore,
        supportScore: analytics.supportScore,
        avgResponseLatencyMs: analytics.avgResponseLatencyMs,
        interruptions: analytics.interruptions,
      },
    });
  }

  const recommendations = buildRecommendations(learnings, { analytics });

  const persisted = [];
  if (config.fleetBrain.persistLearnings && isPersistenceAvailable()) {
    try {
      for (const learning of learnings) {
        const row = await prisma.fleetBrainLearning.create({
          data: {
            userId,
            companyId,
            callId,
            learningType: learning.type,
            content: learning.content,
            data: learning.data,
            recommendation: learning.recommendation || null,
          },
        });
        persisted.push(row);
      }
    } catch (err) {
      logger.warn('FLEET_BRAIN_LEARNING_PERSIST_FAILED', { userId, callId, error: err.message });
    }
  }

  emitToUser(userId, 'fleetbrain.learning', { callId, learnings, recommendations });
  emitToAdminRoom('fleetbrain.learning', { userId, callId, learnings, recommendations });
  logger.info('FLEET_BRAIN_LEARNED', { userId, callId, learnings: learnings.length, recommendations: recommendations.length });

  return { learnings, recommendations, persisted: persisted.length };
}

function buildRecommendations(learnings, { analytics = null }) {
  const recommendations = [];
  const types = new Set(learnings.map(l => l.type));

  if (types.has(LEARNING_TYPES.SALES_OBJECTION)) {
    const objections = learnings.filter(l => l.type === LEARNING_TYPES.SALES_OBJECTION).map(l => l.data.objection);
    recommendations.push({
      action: 'train_sales',
      suggestion: `Add objection-handling responses for: ${objections.join(', ')}`,
    });
  }
  if (types.has(LEARNING_TYPES.FLEET_ISSUE)) {
    const issues = learnings.filter(l => l.type === LEARNING_TYPES.FLEET_ISSUE).map(l => l.data.issue);
    recommendations.push({
      action: 'fleet_insight',
      suggestion: `Surface recurring fleet issue to owner: ${issues.join(', ')}`,
    });
  }
  if (types.has(LEARNING_TYPES.KNOWLEDGE_GAP)) {
    recommendations.push({
      action: 'knowledge_gap',
      suggestion: 'Add the unanswered topics to the knowledge base',
    });
  }
  if (types.has(LEARNING_TYPES.KPI) && analytics) {
    if (analytics.interruptions > 2) {
      recommendations.push({
        action: 'reduce_interruptions',
        suggestion: `High interruption count (${analytics.interruptions}) — consider barge-in tuning or shorter responses`,
      });
    }
    if (analytics.avgResponseLatencyMs > 5000) {
      recommendations.push({
        action: 'optimize_latency',
        suggestion: `Average response latency ${analytics.avgResponseLatencyMs}ms exceeds 5s — review provider routing`,
      });
    }
  }
  return recommendations;
}

export async function getLearnings(userId, { limit = 25, type = null } = {}) {
  if (!isPersistenceAvailable()) return [];
  try {
    return await prisma.fleetBrainLearning.findMany({
      where: { userId, ...(type ? { learningType: type } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  } catch (err) {
    logger.warn('FLEET_BRAIN_LEARNINGS_QUERY_FAILED', { userId, error: err.message });
    return [];
  }
}

export async function getRecommendations(userId, { limit = 20 } = {}) {
  if (!isPersistenceAvailable()) return [];
  try {
    const rows = await prisma.fleetBrainLearning.findMany({
      where: { userId, recommendation: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.filter(r => r.recommendation).map(r => ({ id: r.id, action: r.learningType, suggestion: r.recommendation, applied: r.applied }));
  } catch (err) {
    logger.warn('FLEET_BRAIN_RECOMMENDATIONS_QUERY_FAILED', { userId, error: err.message });
    return [];
  }
}

export async function applyRecommendation(userId, learningId) {
  // Explicit human action only — the brain never auto-modifies production.
  if (!isPersistenceAvailable()) return null;
  try {
    return await prisma.fleetBrainLearning.update({
      where: { id: learningId },
      data: { applied: true },
    });
  } catch (err) {
    logger.warn('FLEET_BRAIN_RECOMMENDATION_APPLY_FAILED', { userId, learningId, error: err.message });
    return null;
  }
}
