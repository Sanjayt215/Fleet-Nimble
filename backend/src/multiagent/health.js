import logger from '../utils/logger.js';
import { config } from '../config/index.js';

const STATES = {
  HEALTHY: 'HEALTHY',
  DEGRADED: 'DEGRADED',
  OPEN: 'OPEN',
};

export class AgentHealthMonitor {
  constructor({ failureThreshold = null, cooldownMs = 60000 } = {}) {
    this.failureThreshold = failureThreshold ?? config.multiAgent.healthThresholdFailures;
    this.cooldownMs = cooldownMs;
    this._agents = new Map();
  }

  register(agentId) {
    if (!this._agents.has(agentId)) {
      this._agents.set(agentId, {
        consecutiveFailures: 0,
        totalSuccess: 0,
        totalFailures: 0,
        lastSuccessAt: null,
        lastFailureAt: null,
        lastError: null,
        state: STATES.HEALTHY,
        openedAt: null,
      });
    }
    return this;
  }

  markSuccess(agentId, { error = null } = {}) {
    const record = this._ensure(agentId);
    record.consecutiveFailures = 0;
    record.totalSuccess++;
    record.lastSuccessAt = Date.now();
    record.lastError = null;
    record.state = STATES.HEALTHY;
    record.openedAt = null;
    return record.state;
  }

  markFailure(agentId, { error = null } = {}) {
    const record = this._ensure(agentId);
    record.consecutiveFailures++;
    record.totalFailures++;
    record.lastFailureAt = Date.now();
    record.lastError = error?.message || error || null;
    if (record.consecutiveFailures >= this.failureThreshold) {
      if (record.state !== STATES.OPEN) {
        record.state = STATES.OPEN;
        record.openedAt = Date.now();
        logger.warn('AGENT_CIRCUIT_OPENED', { agent: agentId, failures: record.consecutiveFailures });
      }
    } else if (record.consecutiveFailures >= Math.max(2, Math.floor(this.failureThreshold / 2))) {
      record.state = STATES.DEGRADED;
    }
    return record.state;
  }

  _ensure(agentId) {
    if (!this._agents.has(agentId)) this.register(agentId);
    return this._agents.get(agentId);
  }

  isHealthy(agentId) {
    const record = this._agents.get(agentId);
    if (!record) return true;
    if (record.state === STATES.OPEN) {
      if (Date.now() - record.openedAt >= this.cooldownMs) {
        record.state = STATES.DEGRADED;
        logger.info('AGENT_CIRCUIT_HALF_OPEN', { agent: agentId });
      }
    }
    return record.state !== STATES.OPEN;
  }

  getStatus(agentId) {
    const record = this._agents.get(agentId);
    if (!record) return { state: STATES.HEALTHY, consecutiveFailures: 0, totalSuccess: 0, totalFailures: 0, healthy: true };
    return {
      state: record.state,
      consecutiveFailures: record.consecutiveFailures,
      totalSuccess: record.totalSuccess,
      totalFailures: record.totalFailures,
      lastSuccessAt: record.lastSuccessAt,
      lastFailureAt: record.lastFailureAt,
      lastError: record.lastError,
      healthy: this.isHealthy(agentId),
      failureThreshold: this.failureThreshold,
    };
  }

  snapshot(agentIds = []) {
    const ids = agentIds.length > 0 ? agentIds : Array.from(this._agents.keys());
    const result = {};
    for (const id of ids) {
      result[id] = this.getStatus(id);
    }
    return result;
  }

  reset(agentId) {
    if (this._agents.has(agentId)) {
      this._agents.delete(agentId);
      this.register(agentId);
      logger.info('AGENT_HEALTH_RESET', { agent: agentId });
    }
  }
}

const sharedHealth = new AgentHealthMonitor();

export function getHealthMonitor() {
  return sharedHealth;
}

export function getAgentHealth(agentId) {
  return sharedHealth.getStatus(agentId);
}

export function getHealthSnapshot(agentIds = []) {
  return sharedHealth.snapshot(agentIds);
}

export { STATES };
logger.info('AGENT_HEALTH_MONITOR_INITIALIZED');
