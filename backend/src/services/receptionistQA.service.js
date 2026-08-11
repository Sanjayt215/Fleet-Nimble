import logger from '../utils/logger.js';
import { getKnowledgeEngine } from '../knowledge/index.js';
import { answerFromTenantKnowledge } from './businessKnowledge.service.js';
import { getBusinessProfile } from './businessProfile.service.js';
import { getAgentConfig } from './agentConfig.service.js';

const MAX_ANSWER_CHARS = 1200;

const OVERVIEW_CATEGORIES = {
  fleet_management: ['fleet management', 'track your fleet', 'manage your fleet', 'fleet monitoring', 'fleet'],
  business_automation: ['automation', 'receptionist', 'ai assistant', 'workflow', 'automate', 'efficiency'],
  ai_capabilities: ['ai', 'artificial intelligence', 'analytics', 'insights', 'machine learning', 'predict'],
  gps_tracking: ['gps', 'tracking', 'location', 'live tracking', 'real-time tracking', 'real time tracking'],
  diagnostics: ['diagnostics', 'live diagnostics', 'engine', 'health', 'obd', 'maintenance'],
  pricing: ['pricing', 'price', 'plan', 'cost', 'subscription', 'package'],
};

const NO_ANSWER_FALLBACK =
  "I'm sorry, I don't have that information available right now. Could you rephrase your question, or ask me about our products, pricing, or capabilities?";

const NO_ANSWER_FALLBACK_CONTEXTED =
  "I'm sorry, I couldn't find a precise answer for that in our knowledge base. I can tell you more about our products, pricing or AI capabilities, or connect you with our team. Which would you prefer?";

/**
 * Phase 6 — Natural QA with conversational context.
 * Handles follow-up pronouns ("What about it?", "how much is that?") using the
 * last answered topic, and offers category-level overviews for broad questions.
 */
export async function answerKnowledgeQuestion({ userId, companyId, message, sessionContext = {} }) {
  const started = Date.now();
  const { lastTopic, lastCategory, conversationMode } = sessionContext || {};
  const resolvedQuery = resolveContextualQuery(message, lastTopic);

  const usedSources = [];
  let answer = null;
  let results = [];

  // 1) Tenant knowledge (business profile + approved documents) — tenant-scoped
  try {
    const tenantResult = await answerFromTenantKnowledge({
      userId, companyId, query: resolvedQuery, category: lastCategory || null, useProfile: true,
    });
    if (tenantResult?.answer) {
      answer = tenantResult.answer;
      usedSources.push(...(tenantResult.sources || []));
    }
  } catch (err) {
    logger.warn('QA_TENANT_KNOWLEDGE_FAILED', { userId, companyId, error: err.message });
  }

  // 2) Global FleetNimble knowledge engine fallback
  if (!answer) {
    try {
      const engine = await getKnowledgeEngine();
      results = await engine.search(resolvedQuery, {
        mode: conversationMode || 'both',
        limit: 3,
      });
      if (results.length > 0) {
        answer = engine.getAnswer(results, conversationMode || 'both');
        if (answer) {
          const sourceTitles = results.map((r) => r.title).filter(Boolean);
          usedSources.push(...sourceTitles);
        }
      }
    } catch (err) {
      logger.warn('QA_ENGINE_SEARCH_FAILED', { error: err.message });
    }
  }

  // 3) No-hallucination fallback
  if (!answer) {
    const latencyMs = Date.now() - started;
    return {
      answer: sessionContext?.hasPriorTopics ? NO_ANSWER_FALLBACK_CONTEXTED : NO_ANSWER_FALLBACK,
      intent: 'general_question',
      isKnowledgeBase: false,
      found: false,
      usedSources,
      latencyMs,
      topic: null,
    };
  }

  const topic = detectTopic(resolvedQuery);
  const overviewSuggestion = maybeOfferOverview(message, answer);

  const latencyMs = Date.now() - started;
  return {
    answer,
    intent: 'product_question',
    isKnowledgeBase: true,
    found: true,
    usedSources,
    results,
    topic,
    lastTopic: topic || lastTopic,
    overviewSuggestion,
    latencyMs,
  };
}

/**
 * Expands a contextual/follow-up query using the previous topic.
 * e.g. "What about it?" → "fleet management" + original topic words.
 */
export function resolveContextualQuery(message, lastTopic) {
  if (!message) return message;
  const lower = message.toLowerCase().trim();
  const followUpPatterns = [
    /^(what about|how about|and what about|tell me more about|tell me more|what else|any other)\b/i,
    /^(it|that|this|that one|this one)\b/i,
    /^(can you tell me more|elaborate|explain further|more detail|more details|go on)\b/i,
    /^(how much|what is the price|what's the price|what does it cost|how does it work|how does that work)\b/i,
    /^(why|when|where)\s+(is|are|does|can|do)\b/i,
  ];

  if (lastTopic && followUpPatterns.some((pattern) => pattern.test(lower))) {
    return `${message} ${lastTopic}`;
  }

  const pronounPattern = /^(it|that|this|them|they|those)\s+(is|are|does|do|can|cost|works?)\b/i;
  if (lastTopic && pronounPattern.test(lower)) {
    return `${message} ${lastTopic}`;
  }

  return message;
}

/**
 * Broad overview questions get a category-level follow-up offer
 * (Phase 6 — "Would you like me to explain the fleet management features,
 * business automation features, or AI capabilities?").
 */
export function maybeOfferOverview(message, answer) {
  if (!message || !answer) return null;
  const lower = message.toLowerCase().trim();
  const isOverviewQuestion =
    /^(what is fleetnimble|who is fleetnimble|what does fleetnimble do|about fleetnimble|tell me about fleetnimble|what is your company|what do you offer|what can you do|features|capabilities)\b/.test(lower) ||
    (lower.includes('fleetnimble') && /(what|about|overview|features|capabilit|offer|do you)/.test(lower) && !/\?.*fleet management/.test(lower));

  if (!isOverviewQuestion) return null;

  return "Would you like me to explain the fleet management features, business automation features, or AI capabilities?";
}

export function detectTopic(message) {
  const lower = (message || '').toLowerCase();
  for (const [topic, keywords] of Object.entries(OVERVIEW_CATEGORIES)) {
    if (keywords.some((keyword) => lower.includes(keyword))) return topic;
  }
  return null;
}

export function buildOverviewAnswer() {
  return "FleetNimble is a complete fleet management platform that combines real-time GPS tracking, live vehicle diagnostics, maintenance planning, fuel analytics and an AI assistant to run your fleet efficiently.";
}

export { getBusinessProfile, getAgentConfig };

/**
 * Observability — record every AI interaction (Phase 12).
 * Never raises; writes are fire-and-forget safe.
 */
export async function logAiInteraction({
  callId, callSid, userId, companyId, agentId, intent, question, answer,
  knowledgeSourcesUsed = [], toolCalls = [], toolResults = [], latencyMs,
  success = true, handoff = false, booking = false, leadCreation = false, channel = 'voice',
}) {
  try {
    const { default: prisma } = await import('../utils/prisma.js');
    if (!prisma?.aiInteractionLog?.create) return;
    await prisma.aiInteractionLog.create({
      data: {
        callId: callId || null,
        callSid: callSid || null,
        userId: userId || null,
        companyId: companyId || null,
        agentId: agentId || null,
        intent: intent || null,
        question: question || null,
        answer: answer ? String(answer).substring(0, 3000) : null,
        knowledgeSourcesUsed: Array.isArray(knowledgeSourcesUsed) ? knowledgeSourcesUsed.slice(0, 20) : [],
        toolCalls: Array.isArray(toolCalls) ? toolCalls.slice(0, 20) : [],
        toolResults: Array.isArray(toolResults) ? toolResults.slice(0, 20) : [],
        latencyMs: latencyMs || null,
        success: Boolean(success),
        handoff: Boolean(handoff),
        booking: Boolean(booking),
        leadCreation: Boolean(leadCreation),
        channel: channel || 'voice',
      },
    });
  } catch (err) {
    logger.warn('AI_INTERACTION_LOG_FAILED', { callSid, error: err.message });
  }
}

export { MAX_ANSWER_CHARS };
