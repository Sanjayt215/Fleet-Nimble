import logger from '../../utils/logger.js';
import { buildResponse, TASK_STATUS } from '../protocol.js';
import { getHealthMonitor } from '../health.js';

export class BaseAgent {
  constructor({ id = null, memory = null, health = null } = {}) {
    if (!id || typeof id !== 'string') {
      throw new TypeError('Agent id (string) is required');
    }
    this.id = id;
    this.memory = memory;
    this.health = health || getHealthMonitor();
  }

  get description() {
    return `Multi-agent specialist: ${this.id}`;
  }

  async execute(task, context = {}) {
    const startedAt = Date.now();
    try {
      const outcome = await this.run(task, context);
      return this._finalize(task, outcome, startedAt);
    } catch (err) {
      this.health.markFailure(this.id, { error: err });
      logger.error('AGENT_EXECUTION_FAILED', { agent: this.id, taskId: task.taskId, error: err.message });
      return buildResponse({
        task,
        status: TASK_STATUS.FAILED,
        error: err,
        confidence: 0,
        cost: { ms: Date.now() - startedAt },
      });
    }
  }

  async run(task, context) {
    throw new Error(`${this.id} must implement run(task, context)`);
  }

  _finalize(task, outcome, startedAt) {
    const elapsedMs = Date.now() - startedAt;
    if (!outcome || outcome.status !== TASK_STATUS.FAILED) {
      this.health.markSuccess(this.id);
    }
    if (typeof outcome === 'string') {
      return buildResponse({
        task,
        status: TASK_STATUS.SUCCESS,
        result: { reply: outcome },
        confidence: 1,
        cost: { ms: elapsedMs },
      });
    }
    if (outcome && outcome.protocolVersion) {
      outcome.cost.ms = (outcome.cost?.ms || 0) + elapsedMs;
      return outcome;
    }
    const { status = TASK_STATUS.SUCCESS, result = outcome, confidence = 1, artifacts = {}, cost = {}, error = null } = outcome || {};
    return buildResponse({
      task,
      status,
      result,
      confidence,
      artifacts,
      cost: { ms: elapsedMs, ...cost },
      error,
    });
  }

  writeMemory(agentId, section, key, value) {
    return this.memory ? this.memory.set(agentId, section, key, value) : false;
  }
}

export function getMemory(context) {
  return context?.memory || null;
}
