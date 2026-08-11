import logger from '../utils/logger.js';
import { answerKnowledgeQuestion, resolveContextualQuery, detectTopic } from '../services/receptionistQA.service.js';
import { getAgentConfig } from '../services/agentConfig.service.js';
import { config } from '../config/index.js';

/**
 * Fleet Brain — Receptionist Planner (Phase 8).
 * Orchestrates knowledge-aware receptionist turns: it plans the conversation
 * (intent, retrieval, next action) and returns a STRUCTURED plan. It never
 * generates unrestricted customer-facing responses itself — answers come from
 * the knowledge pipeline or controlled tools.
 */
export async function buildReceptionistPlan({ userId, companyId, message, session = {}, channel = 'text' }) {
  const started = Date.now();
  const { lastTopic, lastCategory, conversationMode, collectedData = {}, currentStage } = session;

  const intent = classifyReceptionistIntent(message, currentStage);
  const resolvedQuery = resolveContextualQuery(message, lastTopic);
  const topic = detectTopic(resolvedQuery) || lastTopic || null;

  const plan = {
    userId,
    companyId,
    message,
    intent,
    topic,
    channel,
    answer: null,
    answerSource: null,
    usedSources: [],
    actions: [],
    requiresConfirmation: false,
    handoffRecommended: false,
    handoffDepartment: null,
    greetingRequired: currentStage === 'greeting' || !currentStage,
    bookingEligible: intent === 'schedule_meeting',
    latencyMs: 0,
  };

  if (plan.greetingRequired && intent === 'greeting') {
    plan.answer = buildGreetingAnswer(session);
    plan.answerSource = 'greeting';
    plan.latencyMs = Date.now() - started;
    return plan;
  }

  if (intent === 'emergency') {
    plan.handoffRecommended = true;
    plan.handoffDepartment = 'emergency';
    plan.actions.push('transfer_call');
    plan.answerSource = 'handoff';
    plan.latencyMs = Date.now() - started;
    return plan;
  }

  if (intent === 'schedule_meeting') {
    plan.actions.push('create_appointment');
    plan.requiresConfirmation = true;
    plan.answerSource = 'intent';
    plan.answer = 'I would be happy to book a demo. Could you tell me your name, company and fleet size so we can set that up?';
    plan.latencyMs = Date.now() - started;
    return plan;
  }

  if (intent === 'support_request') {
    plan.actions.push('create_support_ticket');
    plan.answerSource = 'intent';
    plan.answer = 'I am sorry to hear you are experiencing an issue. Could you briefly describe what is happening?';
    plan.latencyMs = Date.now() - started;
    return plan;
  }

  // Knowledge-aware answering
  const qaResult = await answerKnowledgeQuestion({
    userId,
    companyId,
    message,
    sessionContext: { lastTopic, lastCategory, conversationMode },
  });

  plan.answer = qaResult.answer;
  plan.answerSource = qaResult.found ? 'knowledge' : 'fallback';
  plan.usedSources = qaResult.usedSources || [];
  plan.qaResult = { found: qaResult.found, overviewSuggestion: qaResult.overviewSuggestion || null, topic: qaResult.topic };

  // Explicit human requests always recommend handoff; otherwise unknown
  // answers do (no-hallucination: connect the caller with the team).
  const wantsHuman = shouldOfferHandoff(message);
  plan.handoffRecommended = wantsHuman || !qaResult.found;
  plan.handoffDepartment = plan.handoffRecommended ? 'support' : null;

  plan.latencyMs = Date.now() - started;
  return plan;
}

export async function buildReceptionistContext({ userId, companyId, message, session = {} }) {
  const agentConfig = await getAgentConfig({ userId, companyId });
  return {
    businessName: agentConfig?.businessName || config.businessName || 'FleetNimble',
    agentName: agentConfig?.agentName || 'FleetNimble AI Receptionist',
    primaryGoal: agentConfig?.primaryGoal || null,
    workingHours: agentConfig?.workingHours || {},
    transferRules: agentConfig?.transferRules || {},
  };
}

function classifyReceptionistIntent(message, currentStage) {
  if (!message) return 'greeting';
  const lower = message.toLowerCase().trim();

  if (currentStage === 'confirming') return 'confirmation';
  if (lower.includes('emergency') || lower.includes('accident') || lower.includes('breakdown') || lower.includes('stranded') || lower.includes('urgent help')) return 'emergency';
  if ((lower.includes('schedule') || lower.includes('book') || lower.includes('appointment') || lower.includes('demo')) && (lower.includes('want') || lower.includes('like') || lower.includes('need') || lower.includes('can') || lower.includes('would') || lower.includes('book') || lower.includes('schedule'))) return 'schedule_meeting';
  if (lower.includes('support') || lower.includes('ticket') || lower.includes('problem') || lower.includes('broken') || lower.includes('not working') || lower.includes('error') || lower.includes('issue with') || lower.includes('help with')) return 'support_request';
  if (/^(hi|hello|hey|good (morning|afternoon|evening))\b/.test(lower) || lower.includes('how are you')) return 'greeting';
  return 'question';
}

function buildGreetingAnswer(session) {
  const { customerMemory } = session;
  if (customerMemory?.isReturning && customerMemory?.customer?.name) {
    return `Welcome back, ${customerMemory.customer.name}. Last time we discussed FleetNimble. I'm FleetNimble's AI Receptionist, and I'm here to help. How may I help you today?`;
  }
  return "Hi! Thank you for calling FleetNimble. I'm FleetNimble's AI Receptionist, and I'm here to help. I can answer your questions about our fleet management platform, help you explore what FleetNimble can do for your business, or help you book a demo. How can I help you today?";
}

function shouldOfferHandoff(message) {
  if (!message) return false;
  const lower = message.toLowerCase();
  return /(human|representative|agent|person|someone|talk to|speak to|escalate|supervisor|manager)/.test(lower);
}

export function isReceptionistPlannerEnabled() {
  return Boolean(config.fleetBrain && config.fleetBrain.enabled);
}

export { logger };
