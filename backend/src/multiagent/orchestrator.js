import { EventEmitter } from 'node:events';
import logger from '../utils/logger.js';
import { config } from '../config/index.js';
import { AgentMemory } from './shared/agentMemory.js';
import { getMemoryStore } from './shared/memoryStore.js';
import { getMetrics } from './metrics.js';
import { getHealthMonitor } from './health.js';
import { buildTask, createRunId, failedResponse, skippedResponse, TASK_STATUS, RUN_STATUS, INTENTS } from './protocol.js';
import { classifyIntent } from './intents.js';
import { executeDag } from './dag.js';
import { executeWithPolicy, policyFor, degradeResponse } from './failurePolicy.js';
import * as persistence from './persistence.js';
import { recordTimelineEvent, TIMELINE_EVENT_TYPES } from '../services/conversationTimeline.service.js';

function safeTimeline(fn) {
  try {
    return fn();
  } catch (err) {
    logger.warn('ORCHESTRATOR_TIMELINE_FAILED', { error: err.message });
    return null;
  }
}

export class MultiAgentOrchestrator extends EventEmitter {
  constructor({ registry, memoryStore = null, metrics = null, health = null, persistenceModule = null } = {}) {
    super();
    this.registry = registry;
    this.memoryStore = memoryStore || getMemoryStore();
    this.metrics = metrics || getMetrics();
    this.health = health || getHealthMonitor();
    this.persistence = persistenceModule || persistence;
    this.recentRuns = [];
  }

  async orchestrate({ userId = null, callId = null, callSid = null, message, context = {}, memory = null }) {
    const runId = createRunId();
    const startedAt = Date.now();
    this.metrics.recordRunStart();

    const runMemory = memory || new AgentMemory({ callSid, callId, userId, companyId: context.companyId || null });
    const merged = { agents: {}, confidence: 0, fallbacks: [], intent: null };
    const taskLogs = [];

    const classification = classifyIntent(message || '');
    merged.intent = classification.intent;
    logger.info('SUPERVISOR_RUN_START', { runId, intent: classification.intent, confidence: classification.confidence, callSid });

    try {
      const tasks = this.buildTaskGraph({
        runId, message, intent: classification.intent, userId, callId, callSid, context, memory: runMemory,
      });

      const policyMap = new Map();
      const executor = async (task) => {
        if (!this.health.isHealthy(task.agent)) {
          this.metrics.recordFallback(`health:${task.agent}`);
          return skippedResponse(task, `agent ${task.agent} is unhealthy`);
        }

        const agent = this.registry.get(task.agent);
        if (!agent) {
          this.metrics.recordFallback(`unregistered:${task.agent}`);
          return skippedResponse(task, `agent ${task.agent} is not registered`);
        }

        const claimed = await this.memoryStore.claimIdempotency(task.idempotencyKey);
        if (claimed.alreadyProcessed) {
          this.metrics.recordDedup(true);
          logger.info('SUPERVISOR_TASK_DEDUPED', { runId, agent: task.agent, taskId: task.taskId });
          return {
            protocolVersion: 1,
            taskId: task.taskId,
            runId: task.runId,
            agent: task.agent,
            status: TASK_STATUS.SUCCESS,
            result: claimed.result?.result || null,
            confidence: claimed.result?.confidence ?? 0.8,
            artifacts: { deduped: true },
            cost: { llmTokens: 0, dbQueries: 0, cacheHits: 1, ms: 0 },
            error: null,
          };
        }

        const policy = policyFor(task.agent, this.registry.getMetadata(task.agent));
        if (!policyMap.has(task.agent)) policyMap.set(task.agent, policy);

        const outcome = await executeWithPolicy(task, () => agent.execute(task, { ...context, memory: runMemory, registry: this.registry }), {
          metadata: this.registry.getMetadata(task.agent),
          policy,
          onRetry: ({ attempt, error }) => {
            taskLogs.push({
              runId, callId, userId, agent: task.agent, taskType: task.task.type,
              status: TASK_STATUS.RETRIED, costMs: 0, llmTokens: 0, dbQueries: 0, cacheHits: 0,
              retries: attempt, error,
            });
            safeTimeline(() => recordTimelineEvent({
              userId,
              callId,
              callSid,
              eventType: TIMELINE_EVENT_TYPES.SUPERVISOR_RETRY,
              data: { agent: task.agent, taskType: task.task.type, attempt, error: error?.message || null },
            }));
          },
        });

        if (task.agent === 'knowledge' && task.task.type === 'retrieve') {
          safeTimeline(() => recordTimelineEvent({
            userId,
            callId,
            callSid,
            eventType: TIMELINE_EVENT_TYPES.KNOWLEDGE_SEARCHED,
            data: {
              query: task.task.payload?.query,
              found: Boolean(outcome.result?.hasAnswer),
              answerLength: outcome.result?.answer?.length || 0,
              confidence: outcome.result?.confidence ?? null,
              source: outcome.result?.source || null,
            },
          }));
        }

        if (task.agent === 'scheduling' && task.task.type === 'book' && outcome.status === TASK_STATUS.SUCCESS) {
          safeTimeline(() => recordTimelineEvent({
            userId,
            callId,
            callSid,
            eventType: TIMELINE_EVENT_TYPES.APPOINTMENT_CONFIRMED,
            data: { agent: 'scheduling', appointmentId: outcome.result?.appointment?.id || null },
          }));
        }

        if (outcome.status !== TASK_STATUS.FAILED) {
          this.health.markSuccess(task.agent);
        } else {
          this.health.markFailure(task.agent, { error: outcome.error });
          const degraded = await this._tryFallback(task, outcome, { ...context, memory: runMemory }, policy);
          if (degraded) {
            this.metrics.recordFallback(`degraded:${task.agent}`);
            outcome.status = degraded.status;
            outcome.result = degraded.result;
            outcome.confidence = degraded.confidence;
            outcome.artifacts = { ...outcome.artifacts, degradedFallback: true };
          }
        }

        await this.memoryStore.recordIdempotency(task.idempotencyKey, {
          result: outcome.result,
          confidence: outcome.confidence,
          status: outcome.status,
        });

        return outcome;
      };

      const output = await executeDag(tasks, executor, { maxWidth: config.multiAgent.maxParallel });
      this.metrics.recordDagWidth(Math.min(config.multiAgent.maxParallel, tasks.length));

      for (const task of tasks) {
        const outcome = output.get(task.taskId);
        const cost = outcome?.cost || {};
        this.metrics.recordTask(task.agent, {
          status: outcome?.status || TASK_STATUS.FAILED,
          costMs: cost.ms || 0,
          llmTokens: cost.llmTokens || 0,
          dbQueries: cost.dbQueries || 0,
          cacheHits: cost.cacheHits || 0,
          retries: outcome?.retries || 0,
          runId,
        });
        if (outcome?.agent) {
          const existing = merged.agents[task.agent];
          if (existing?.result && outcome.result && typeof existing.result === 'object' && typeof outcome.result === 'object') {
            merged.agents[task.agent] = { ...existing, result: { ...existing.result, ...outcome.result } };
          } else {
            merged.agents[task.agent] = outcome;
          }
        }
        taskLogs.push({
          runId, callId, userId, agent: task.agent, taskType: task.task.type,
          status: outcome?.status || TASK_STATUS.FAILED,
          confidence: outcome?.confidence ?? null,
          costMs: cost.ms || 0, llmTokens: cost.llmTokens || 0,
          dbQueries: cost.dbQueries || 0, cacheHits: cost.cacheHits || 0,
          retries: outcome?.retries || 0,
          error: outcome?.error?.message || null,
        });
      }

      this.applyMergeRules(merged);

      const receptionistTask = buildTask({
        runId, agentId: 'receptionist', taskType: 'composeReply',
        payload: {
          intent: merged.intent,
          merged,
          greetingMessage: context.greetingMessage || null,
          supportPhone: context.supportPhone || null,
          config: context.config || null,
        },
        callSid,
        context: { ...context, memory: runMemory },
      });
      const replyOutcome = await this._executeSingle(receptionistTask, { ...context, memory: runMemory });
      merged.reply = replyOutcome.result?.reply || null;
      if (replyOutcome.result?.reply) {
        merged.agents.receptionist = { ...replyOutcome, taskType: 'composeReply' };
      }

      const runStatus = this._determineRunStatus(merged);
      this.metrics.recordRunEnd(runStatus);
      merged.status = runStatus;
      merged.runId = runId;
      merged.memoryId = runMemory.memoryId;

      await this.memoryStore.saveMemory(runMemory);

      safeTimeline(() => recordTimelineEvent({
        userId,
        callId,
        callSid,
        eventType: TIMELINE_EVENT_TYPES.MEMORY_UPDATED,
        data: {
          memoryId: runMemory.memoryId,
          sections: Object.keys(runMemory.data || {}),
          intent: merged.intent,
        },
      }));

      this._persistRun({ runId, callId, callSid, userId, message, intent: merged.intent, status: runStatus, merged, taskLogs, startedAt });

      this._rememberRun({ runId, callId, callSid, userId, intent: merged.intent, status: runStatus, startedAt, finishedAt: Date.now() });
      this.emit('run.complete', { runId, intent: merged.intent, status: runStatus, reply: merged.reply, elapsedMs: Date.now() - startedAt });

      return merged;
    } catch (err) {
      logger.error('SUPERVISOR_RUN_FAILED', { runId, callSid, error: err.message });
      this.metrics.recordRunEnd(RUN_STATUS.FAILED);
      merged.status = RUN_STATUS.FAILED;
      merged.error = err.message;
      merged.runId = runId;
      merged.reply = null;
      this._persistRun({ runId, callId, callSid, userId, message, intent: merged.intent, status: RUN_STATUS.FAILED, merged, taskLogs, startedAt });
      return merged;
    }
  }

  buildTaskGraph({ runId, message, intent, userId, callId, callSid, context, memory }) {
    const tasks = [];
    const add = (agentId, taskType, payload = {}, extra = {}) => {
      tasks.push(buildTask({
        runId, agentId, taskType, payload,
        callSid,
        context: { ...context, userId, callId, callSid },
        constraints: extra.constraints || {},
        ...(extra.overrides || {}),
      }));
      return tasks[tasks.length - 1];
    };

    const hasIdentity = Boolean(context.callerPhone || context.callerEmail);
    const needsKnowledge = [
      INTENTS.PRICING_QUESTION, INTENTS.PRODUCT_QUESTION, INTENTS.GENERAL_QUESTION,
      INTENTS.FLEET_QUESTION, INTENTS.SALES_INTEREST, INTENTS.SCHEDULE_MEETING,
      INTENTS.SUPPORT_REQUEST, INTENTS.TECHNICAL_ISSUE,
    ].includes(intent);

    let knowledgeTask = null;
    if (needsKnowledge) {
      knowledgeTask = add('knowledge', 'retrieve', { query: message, category: intent === INTENTS.FLEET_QUESTION ? 'fleet' : null });
    }

    if (hasIdentity && intent !== INTENTS.GREETING && intent !== INTENTS.EMERGENCY) {
      add('crm', 'lookup', { phone: context.callerPhone, email: context.callerEmail, name: context.callerName });
    }

    switch (intent) {
      case INTENTS.EMERGENCY: {
        add('support', 'triage', { text: message });
        break;
      }
      case INTENTS.SCHEDULE_MEETING: {
        add('scheduling', 'parse', { text: message, timezoneHint: context.timezoneHint || null });
        add('sales', 'qualify', { text: message, caller: context.callerName });
        break;
      }
      case INTENTS.PRICING_QUESTION:
      case INTENTS.SALES_INTEREST: {
        const qualify = add('sales', 'qualify', { text: message, caller: context.callerName });
        const compose = add('sales', 'composePricing', {
          fleetSize: context.fleetSize ?? memory?.get('identity', 'fleetSize') ?? null,
          knowledgeAnswer: null,
        }, { constraints: { dependsOn: knowledgeTask ? [knowledgeTask.taskId] : [] } });
        if (intent === INTENTS.SALES_INTEREST) {
          add('sales', 'proposeDemoSlots', { preference: message }, { constraints: { dependsOn: [compose.taskId] } });
        }
        void qualify;
        break;
      }
      case INTENTS.SUPPORT_REQUEST:
      case INTENTS.TECHNICAL_ISSUE: {
        const triage = add('support', 'triage', { text: message });
        add('support', 'createTicket', {
          text: message,
          callerName: context.callerName,
          callerPhone: context.callerPhone,
          callerEmail: context.callerEmail,
          confirmed: Boolean(context.ticketConfirmed),
          requireConfirmation: !context.ticketConfirmed,
        }, { constraints: { dependsOn: [triage.taskId] } });
        break;
      }
      case INTENTS.FLEET_QUESTION: {
        add('fleetExpert', 'answerFleetQuestion', { query: message, knowledgeAnswer: null }, {
          constraints: { dependsOn: knowledgeTask ? [knowledgeTask.taskId] : [] },
        });
        break;
      }
      case INTENTS.PRODUCT_QUESTION:
      case INTENTS.GENERAL_QUESTION: {
        if (knowledgeTask) {
          add('fleetExpert', 'answerFleetQuestion', { query: message, knowledgeAnswer: null }, {
            constraints: { dependsOn: [knowledgeTask.taskId] },
          });
        }
        break;
      }
      case INTENTS.GREETING:
      case INTENTS.UNKNOWN:
      default:
        break;
    }

    return tasks;
  }

  applyMergeRules(merged) {
    const knowledge = merged.agents.knowledge;
    const fleet = merged.agents.fleetExpert;

    if (knowledge && fleet) {
      const knowledgeResult = knowledge.result;
      const fleetResult = fleet.result;
      if (knowledgeResult?.answer && fleetResult?.answer && fleetResult.topic) {
        if (fleetResult.source === 'rules' && knowledgeResult.confidence > fleetResult.confidence) {
          fleetResult.answer = knowledgeResult.answer;
          fleetResult.source = 'knowledge';
        }
      }
      const best = knowledgeResult?.confidence >= (fleetResult?.confidence || 0) ? knowledgeResult : fleetResult;
      merged.confidence = best?.confidence ?? merged.confidence;
    } else {
      const scored = Object.values(merged.agents)
        .filter(a => a?.confidence != null)
        .sort((a, b) => b.confidence - a.confidence);
      merged.confidence = scored[0]?.confidence ?? 0.5;
    }

    if (merged.agents.sales?.result?.reply && merged.confidence < (merged.agents.sales.confidence || 0)) {
      merged.confidence = merged.agents.sales.confidence;
    }
  }

  _determineRunStatus(merged) {
    const agents = Object.values(merged.agents).filter(a => a);
    if (agents.length === 0) return RUN_STATUS.FAILED;
    const failed = agents.filter(a => a.status === TASK_STATUS.FAILED);
    const partial = agents.filter(a => a.status === TASK_STATUS.PARTIAL);
    const skipped = agents.filter(a => a.status === TASK_STATUS.SKIPPED);
    if (failed.length > 0 && failed.length === agents.length) return RUN_STATUS.FAILED;
    if (failed.length > 0 || partial.length > 0 || (skipped.length > 0 && skipped.length < agents.length)) return RUN_STATUS.PARTIAL;
    return RUN_STATUS.SUCCESS;
  }

  async _tryFallback(task, outcome, context, policy) {
    if (!policy.fallbackTargets || policy.fallbackTargets.length === 0) return null;
    for (const fallbackAgentId of policy.fallbackTargets) {
      const fallbackAgent = this.registry.get(fallbackAgentId);
      if (!fallbackAgent) continue;
      if (fallbackAgentId === 'receptionist') {
        return degradeResponse(task, `primary agent ${task.agent} failed; receptionist will answer`);
      }
      try {
        const fallbackOutcome = await fallbackAgent.execute(
          buildTask({
            runId: task.runId,
            agentId: fallbackAgentId,
            taskType: 'retrieve',
            payload: { query: task.task.payload.text || task.task.payload.query || '', ...task.task.payload },
            context: { ...context, userId: task.context.userId },
            callSid: null,
          }),
          context
        );
        if (fallbackOutcome.status === TASK_STATUS.SUCCESS || fallbackOutcome.status === TASK_STATUS.PARTIAL) {
          return fallbackOutcome;
        }
      } catch (err) {
        logger.warn('SUPERVISOR_FALLBACK_FAILED', { agent: task.agent, fallback: fallbackAgentId, error: err.message });
      }
    }
    return null;
  }

  async _executeSingle(task, context) {
    const agent = this.registry.get(task.agent);
    if (!agent) return failedResponse(task, new Error(`agent ${task.agent} not registered`));
    const outcome = await executeWithPolicy(task, () => agent.execute(task, context), {
      metadata: this.registry.getMetadata(task.agent),
    });
    if (outcome.status !== TASK_STATUS.FAILED) {
      this.health.markSuccess(task.agent);
    } else {
      this.health.markFailure(task.agent, { error: outcome.error });
    }
    this.metrics.recordTask(task.agent, {
      status: outcome.status,
      costMs: outcome.cost?.ms || 0,
      llmTokens: outcome.cost?.llmTokens || 0,
      dbQueries: outcome.cost?.dbQueries || 0,
      cacheHits: outcome.cost?.cacheHits || 0,
      retries: outcome.retries || 0,
      runId: task.runId,
    });
    return outcome;
  }

  _persistRun({ runId, callId, callSid, userId, message, intent, status, merged, taskLogs, startedAt }) {
    if (!config.multiAgent.persistRuns) return;
    const runRecord = {
      runId, callId, callSid, userId,
      utterance: message,
      intent: intent || null,
      fsmState: merged.agents.receptionist?.result?.intent || null,
      status,
      outcome: {
        reply: merged.reply,
        confidence: merged.confidence,
        agents: Object.fromEntries(Object.entries(merged.agents).map(([id, a]) => [id, { status: a.status, confidence: a.confidence }])),
        fallbacks: merged.fallbacks,
      },
      error: merged.error || null,
      startedAt: new Date(startedAt),
      finishedAt: new Date(),
      taskLogs,
    };
    this.persistence.persistRun(runRecord).catch(err => {
      logger.warn('SUPERVISOR_RUN_PERSIST_FAILED', { runId, error: err.message });
    });
  }

  _rememberRun(run) {
    this.recentRuns.push(run);
    if (this.recentRuns.length > config.multiAgent.maxRunHistory) {
      this.recentRuns = this.recentRuns.slice(-config.multiAgent.maxRunHistory);
    }
  }

  getRecentRuns({ limit = 20 } = {}) {
    return this.recentRuns.slice(-limit);
  }

  async getRunsByCall(callId) {
    return this.persistence.findRunsByCall(callId);
  }

  async getRunTasks(runId) {
    return this.persistence.findTasksByRun(runId);
  }

  async getPerformance({ from = null, to = null } = {}) {
    return this.persistence.getPerformance({ from, to });
  }

  getStatus() {
    return {
      enabled: config.multiAgent.enabled,
      shadowMode: config.multiAgent.shadowMode,
      agents: this.registry.list().map(entry => ({
        ...entry,
        health: this.health.getStatus(entry.id),
      })),
      metrics: this.metrics.snapshot(),
      memory: this.memoryStore.getStats(),
    };
  }
}
