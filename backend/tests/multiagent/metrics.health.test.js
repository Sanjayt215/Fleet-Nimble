import { describe, it, expect, vi } from 'vitest';
import { MetricsRegistry, getMetricsSnapshot } from '../../src/multiagent/metrics.js';
import { AgentHealthMonitor, STATES } from '../../src/multiagent/health.js';
import { getMemoryStats } from '../../src/multiagent/shared/memoryStore.js';

describe('metrics registry', () => {
  it('tracks run totals and statuses', () => {
    const metrics = new MetricsRegistry();
    metrics.recordRunStart();
    metrics.recordRunStart();
    metrics.recordRunEnd('SUCCESS');
    metrics.recordRunEnd('PARTIAL');
    const snapshot = metrics.snapshot();
    expect(snapshot.runs.total).toBe(2);
    expect(snapshot.runs.success).toBe(1);
    expect(snapshot.runs.partial).toBe(1);
    expect(snapshot.runs.running).toBe(0);
  });

  it('tracks per-agent task statuses and latency percentiles', () => {
    const metrics = new MetricsRegistry();
    for (let i = 0; i < 10; i++) {
      metrics.recordTask('knowledge', { status: 'SUCCESS', costMs: 10 + i * 10 });
    }
    metrics.recordTask('knowledge', { status: 'FAILED', costMs: 5 });
    const summary = metrics.getAgentSummary('knowledge');
    expect(summary.tasks).toBe(11);
    expect(summary.success).toBe(10);
    expect(summary.failed).toBe(1);
    expect(summary.successRate).toBeCloseTo(10 / 11);
    expect(summary.p50Ms).toBeGreaterThanOrEqual(10);
    expect(summary.p95Ms).toBeGreaterThanOrEqual(summary.p50Ms);
  });

  it('tracks cost counters', () => {
    const metrics = new MetricsRegistry();
    metrics.recordTask('sales', { status: 'SUCCESS', llmTokens: 120, dbQueries: 2, cacheHits: 1 });
    metrics.recordTask('crm', { status: 'SUCCESS', dbQueries: 3 });
    const snapshot = metrics.snapshot();
    expect(snapshot.cost.llmTokens).toBe(120);
    expect(snapshot.cost.dbQueries).toBe(5);
    expect(snapshot.cost.llmTasks).toBe(1);
    expect(snapshot.cost.rulesTasks).toBe(1);
  });

  it('tracks dedup and fallback counters', () => {
    const metrics = new MetricsRegistry();
    metrics.recordDedup(true);
    metrics.recordDedup(false);
    metrics.recordFallback('degraded:knowledge');
    metrics.recordFallback('health:crm');
    const snapshot = metrics.snapshot();
    expect(snapshot.dedup.skipped).toBe(1);
    expect(snapshot.dedup.total).toBe(2);
    expect(snapshot.fallbacks.total).toBe(2);
    expect(snapshot.fallbacks.byReason['degraded:knowledge']).toBe(1);
  });

  it('tracks DAG width', () => {
    const metrics = new MetricsRegistry();
    metrics.recordDagWidth(3);
    metrics.recordDagWidth(4);
    const snapshot = metrics.snapshot();
    expect(snapshot.dag.count).toBe(2);
    expect(snapshot.dag.avgWidth).toBe(3.5);
    expect(snapshot.dag.maxWidthSeen).toBe(4);
  });

  it('keeps recent runs bounded', () => {
    const metrics = new MetricsRegistry({ maxRuns: 10 });
    for (let i = 0; i < 25; i++) {
      metrics.recordTask('crm', { status: 'SUCCESS', runId: `R-${i}` });
    }
    const snapshot = metrics.snapshot();
    expect(snapshot.recentRuns.length).toBeLessThanOrEqual(50);
  });

  it('exposes a shared snapshot function', () => {
    const snapshot = getMetricsSnapshot();
    expect(snapshot.runs).toBeDefined();
    expect(snapshot.agents).toBeDefined();
  });
});

describe('agent health monitor', () => {
  it('starts healthy', () => {
    const health = new AgentHealthMonitor({ failureThreshold: 5 });
    const status = health.getStatus('crm');
    expect(status.state).toBe(STATES.HEALTHY);
    expect(status.healthy).toBe(true);
  });

  it('degrades and opens after consecutive failures', () => {
    const health = new AgentHealthMonitor({ failureThreshold: 3 });
    health.register('crm');
    health.markSuccess('crm');
    health.markFailure('crm');
    health.markFailure('crm');
    expect(health.getStatus('crm').state).toBe(STATES.DEGRADED);
    health.markFailure('crm');
    expect(health.getStatus('crm').state).toBe(STATES.OPEN);
    expect(health.isHealthy('crm')).toBe(false);
  });

  it('recovers on success', () => {
    const health = new AgentHealthMonitor({ failureThreshold: 3 });
    health.register('crm');
    health.markFailure('crm');
    health.markFailure('crm');
    health.markFailure('crm');
    expect(health.isHealthy('crm')).toBe(false);
    health.markSuccess('crm');
    expect(health.getStatus('crm').state).toBe(STATES.HEALTHY);
  });

  it('half-opens after the cooldown window', async () => {
    const health = new AgentHealthMonitor({ failureThreshold: 2, cooldownMs: 10 });
    health.register('crm');
    health.markFailure('crm');
    health.markFailure('crm');
    expect(health.isHealthy('crm')).toBe(false);
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(health.isHealthy('crm')).toBe(true);
    expect(health.getStatus('crm').state).toBe(STATES.DEGRADED);
  });

  it('snapshots multiple agents and tracks error messages', () => {
    const health = new AgentHealthMonitor({ failureThreshold: 2 });
    health.register('crm');
    health.register('knowledge');
    health.markFailure('crm', { error: new Error('db down') });
    const snapshot = health.snapshot(['crm', 'knowledge']);
    expect(snapshot.crm.lastError).toBe('db down');
    expect(snapshot.knowledge.state).toBe(STATES.HEALTHY);
  });

  it('reset clears failures', () => {
    const health = new AgentHealthMonitor({ failureThreshold: 1 });
    health.register('crm');
    health.markFailure('crm');
    expect(health.getStatus('crm').state).toBe(STATES.OPEN);
    health.reset('crm');
    expect(health.getStatus('crm').state).toBe(STATES.HEALTHY);
  });

  it('returns healthy for unregistered agents', () => {
    const health = new AgentHealthMonitor();
    expect(health.isHealthy('nope')).toBe(true);
  });
});

describe('memory store stats', () => {
  it('exposes stats without requiring redis', () => {
    const stats = getMemoryStats();
    expect(stats.memoryEntries).toBeGreaterThanOrEqual(0);
    expect(stats.idempotencyTtlSeconds).toBeGreaterThan(0);
  });
});
