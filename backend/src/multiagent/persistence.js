import logger from '../utils/logger.js';

let prisma = null;

async function getPrisma() {
  if (prisma) return prisma;
  try {
    const module = await import('../utils/prisma.js');
    prisma = module.default;
  } catch (err) {
    logger.warn('MULTI_AGENT_PRISMA_UNAVAILABLE', { error: err.message });
  }
  return prisma;
}

export async function persistRun(run) {
  const client = await getPrisma();
  if (!client) return null;
  try {
    const created = await client.agentRun.create({
      data: {
        runId: run.runId,
        callId: run.callId,
        callSid: run.callSid || null,
        userId: run.userId || null,
        utterance: run.utterance || null,
        intent: run.intent || null,
        fsmState: run.fsmState || null,
        status: run.status,
        outcome: run.outcome || {},
        error: run.error || null,
        startedAt: run.startedAt || new Date(),
        finishedAt: run.finishedAt || null,
        tasks: {
          create: (run.taskLogs || []).map(log => ({
            runId: log.runId,
            callId: log.callId,
            userId: log.userId || null,
            agent: log.agent,
            taskType: log.taskType,
            status: log.status,
            confidence: log.confidence ?? null,
            costMs: log.costMs ?? null,
            llmTokens: log.llmTokens ?? null,
            dbQueries: log.dbQueries ?? null,
            cacheHits: log.cacheHits ?? null,
            retries: log.retries ?? 0,
            error: log.error || null,
          })),
        },
      },
      include: { tasks: true },
    });
    logger.info('MULTI_AGENT_RUN_PERSISTED', { runId: run.runId, tasks: run.taskLogs?.length || 0 });
    return created;
  } catch (err) {
    logger.warn('MULTI_AGENT_RUN_PERSIST_FAILED', { runId: run.runId, error: err.message });
    return null;
  }
}

export async function findRunsByCall(callId, { limit = 20 } = {}) {
  const client = await getPrisma();
  if (!client) return [];
  try {
    return client.agentRun.findMany({
      where: { callId },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
  } catch (err) {
    logger.warn('MULTI_AGENT_RUNS_QUERY_FAILED', { callId, error: err.message });
    return [];
  }
}

export async function findTasksByRun(runId) {
  const client = await getPrisma();
  if (!client) return [];
  try {
    return client.agentTaskLog.findMany({
      where: { runId },
      orderBy: { at: 'asc' },
    });
  } catch (err) {
    logger.warn('MULTI_AGENT_TASKS_QUERY_FAILED', { runId, error: err.message });
    return [];
  }
}

export async function getPerformance({ from = null, to = null } = {}) {
  const client = await getPrisma();
  if (!client) return null;
  try {
    const where = {};
    if (from || to) {
      where.at = {};
      if (from) where.at.gte = new Date(from);
      if (to) where.at.lte = new Date(to);
    }
    const logs = await client.agentTaskLog.findMany({ where, take: 2000 });
    const byAgent = {};
    for (const log of logs) {
      const entry = byAgent[log.agent] || { tasks: 0, success: 0, partial: 0, failed: 0, skipped: 0, retried: 0, costMs: 0, llmTokens: 0 };
      entry.tasks++;
      if (log.status === 'SUCCESS') entry.success++;
      else if (log.status === 'PARTIAL') entry.partial++;
      else if (log.status === 'FAILED') entry.failed++;
      else if (log.status === 'SKIPPED') entry.skipped++;
      if ((log.retries || 0) > 0) entry.retried++;
      entry.costMs += log.costMs || 0;
      entry.llmTokens += log.llmTokens || 0;
      byAgent[log.agent] = entry;
    }
    return {
      from: from || null,
      to: to || null,
      agents: byAgent,
      totals: {
        tasks: logs.length,
        success: logs.filter(l => l.status === 'SUCCESS').length,
        partial: logs.filter(l => l.status === 'PARTIAL').length,
        failed: logs.filter(l => l.status === 'FAILED').length,
      },
    };
  } catch (err) {
    logger.warn('MULTI_AGENT_PERFORMANCE_QUERY_FAILED', { error: err.message });
    return null;
  }
}
