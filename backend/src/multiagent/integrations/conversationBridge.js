import logger from '../../utils/logger.js';
import { config } from '../../config/index.js';
import { getOrchestrator, isMultiAgentEnabled, isShadowMode } from '../index.js';

let lastProcessed = new Map();

export function shouldUseMultiAgent() {
  return isMultiAgentEnabled();
}

export function isShadowRun() {
  return isShadowMode();
}

/**
 * Orchestrate a caller turn through the Supervisor. Returns the merged
 * Receptionist reply plus run metadata. In shadow mode the reply is computed
 * and persisted but marked for discard (caller never hears it).
 */
export async function orchestrateConversationTurn({
  userId = null,
  callId = null,
  callSid = null,
  message = '',
  context = {},
  memory = null,
  force = false,
} = {}) {
  const enabled = isMultiAgentEnabled();
  if (!enabled && !force) return null;

  const text = String(message || '').trim();
  if (!text) return null;

  const sessionKey = `${callSid || callId || 'session'}`;
  const last = lastProcessed.get(sessionKey);
  if (last === text) {
    logger.info('CONVERSATION_BRIDGE_DEDUP', { callSid, reason: 'same_utterance_repeated' });
    return null;
  }
  lastProcessed.set(sessionKey, text);
  if (lastProcessed.size > 2000) {
    lastProcessed = new Map([...lastProcessed.entries()].slice(-1000));
  }

  const orchestrator = getOrchestrator();
  const run = await orchestrator.orchestrate({
    userId,
    callId,
    callSid,
    message: text,
    context,
    memory,
  });

  if (isShadowMode()) {
    logger.info('CONVERSATION_BRIDGE_SHADOW', { callSid, intent: run.intent, status: run.status, replyDiscarded: true });
    return {
      shadow: true,
      runId: run.runId,
      intent: run.intent,
      status: run.status,
      reply: null,
    };
  }

  return {
    shadow: false,
    runId: run.runId,
    intent: run.intent,
    status: run.status,
    reply: run.reply,
    confidence: run.confidence,
  };
}
