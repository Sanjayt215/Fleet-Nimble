import logger from '../utils/logger.js';

const INITIAL_AGENT = {
  tasks: 0,
  success: 0,
  partial: 0,
  failed: 0,
  skipped: 0,
  retried: 0,
  llmTokens: 0,
  dbQueries: 0,
  cacheHits: 0,
  costMs: 0,
  latencies: [],
  firstSeenAt: Date.now(),
  lastSeenAt: Date.now(),
};

function histogramPct(latencies, pct) {
  if (latencies.length === 0) return 0;
  const sorted = [...latencies].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((pct / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

class MetricsRegistry {
  constructor({ maxLatencySamples = 1000, maxRuns = 500 } = {}) {
    this.maxLatencySamples = maxLatencySamples;
    this.maxRuns = maxRuns;
    this.agents = {};
    this.runs = { total: 0, success: 0, partial: 0, failed: 0, running: 0 };
    this.dedup = { total: 0, skipped: 0 };
    this.fallbacks = { total: 0, byReason: {} };
    this.cost = { llmTokens: 0, dbQueries: 0, cacheHits: 0, rulesTasks: 0, llmTasks: 0 };
    this.dag = { totalWidths: 0, count: 0, maxWidthSeen: 0 };
    this._recentRuns = [];
  }

  _agent(agentId) {
    if (!this.agents[agentId]) {
      this.agents[agentId] = { ...INITIAL_AGENT };
    }
    return this.agents[agentId];
  }

  recordRunStart() {
    this.runs.total++;
    this.runs.running++;
  }

  recordRunEnd(status) {
    this.runs.running = Math.max(0, this.runs.running - 1);
    const key = String(status || '').toLowerCase();
    if (this.runs[key] !== undefined) this.runs[key]++;
  }

  recordTask(agentId, { status, costMs = 0, llmTokens = 0, dbQueries = 0, cacheHits = 0, retries = 0, runId = null }) {
    const agent = this._agent(agentId);
    agent.tasks++;
    agent.lastSeenAt = Date.now();
    if (status === TASK_STATUS_ALIASES.SUCCESS) agent.success++;
    else if (status === TASK_STATUS_ALIASES.PARTIAL) agent.partial++;
    else if (status === TASK_STATUS_ALIASES.FAILED) agent.failed++;
    else if (status === TASK_STATUS_ALIASES.SKIPPED) agent.skipped++;
    if (retries > 0) agent.retried++;
    agent.llmTokens += llmTokens || 0;
    agent.dbQueries += dbQueries || 0;
    agent.cacheHits += cacheHits || 0;
    agent.costMs += costMs || 0;
    agent.latencies.push(costMs || 0);
    if (agent.latencies.length > this.maxLatencySamples) {
      agent.latencies = agent.latencies.slice(-this.maxLatencySamples);
    }
    this.cost.llmTokens += llmTokens || 0;
    this.cost.dbQueries += dbQueries || 0;
    this.cost.cacheHits += cacheHits || 0;
    this.cost.llmTasks += (llmTokens || 0) > 0 ? 1 : 0;
    if ((llmTokens || 0) === 0 && (dbQueries || 0) > 0) this.cost.rulesTasks++;
    if (runId) this._rememberRun(runId, agentId, status);
  }

  recordDedup(skipped = true) {
    this.dedup.total++;
    if (skipped) this.dedup.skipped++;
  }

  recordFallback(reason) {
    this.fallbacks.total++;
    this.fallbacks.byReason[reason] = (this.fallbacks.byReason[reason] || 0) + 1;
  }

  recordDagWidth(width) {
    this.dag.totalWidths += width;
    this.dag.count++;
    this.dag.maxWidthSeen = Math.max(this.dag.maxWidthSeen, width);
  }

  _rememberRun(runId, agentId, status) {
    this._recentRuns.push({ runId, agentId, status, at: Date.now() });
    if (this._recentRuns.length > this.maxRuns) {
      this._recentRuns = this._recentRuns.slice(-this.maxRuns);
    }
  }

  getAgentSummary(agentId) {
    const agent = this._agent(agentId);
    const { latencies, ...summary } = agent;
    return {
      ...summary,
      p50Ms: histogramPct(latencies, 50),
      p95Ms: histogramPct(latencies, 95),
      successRate: agent.tasks > 0 ? agent.success / agent.tasks : 0,
    };
  }

  snapshot() {
    const agents = {};
    for (const agentId of Object.keys(this.agents)) {
      agents[agentId] = this.getAgentSummary(agentId);
    }
    return {
      runs: { ...this.runs },
      dedup: { ...this.dedup },
      fallbacks: { ...this.fallbacks },
      cost: { ...this.cost },
      dag: { ...this.dag, avgWidth: this.dag.count > 0 ? this.dag.totalWidths / this.dag.count : 0 },
      agents,
      recentRuns: this._recentRuns.slice(-50),
    };
  }
}

const TASK_STATUS_ALIASES = {
  SUCCESS: 'SUCCESS',
  PARTIAL: 'PARTIAL',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
};

const sharedMetrics = new MetricsRegistry();

export function getMetrics() {
  return sharedMetrics;
}

export function recordRunStart() {
  sharedMetrics.recordRunStart();
}

export function recordRunEnd(status) {
  sharedMetrics.recordRunEnd(status);
}

export function recordTask(agentId, details) {
  sharedMetrics.recordTask(agentId, details);
}

export function recordDedup(skipped) {
  sharedMetrics.recordDedup(skipped);
}

export function recordFallback(reason) {
  sharedMetrics.recordFallback(reason);
}

export function recordDagWidth(width) {
  sharedMetrics.recordDagWidth(width);
}

export function getMetricsSnapshot() {
  return sharedMetrics.snapshot();
}

export { MetricsRegistry };
logger.info('MULTI_AGENT_METRICS_INITIALIZED');
