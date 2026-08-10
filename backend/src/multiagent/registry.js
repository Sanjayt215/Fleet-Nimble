import logger from '../utils/logger.js';
import { AGENT_KINDS } from './protocol.js';

export const DEFAULT_AGENT_METADATA = {
  receptionist: {
    skills: ['greeting', 'identity', 'intent', 'routing', 'smallTalk', 'closing'],
    kind: AGENT_KINDS.SPEAKER,
    cost: 'llm',
    parallelSafe: false,
  },
  sales: {
    skills: ['leadQual', 'buyingSignals', 'recommendation', 'pricing', 'roi', 'demoBooking', 'objections', 'competitors', 'proposals'],
    kind: AGENT_KINDS.ANALYST,
    cost: 'llm',
    parallelSafe: true,
  },
  fleetExpert: {
    skills: ['tracking', 'gps', 'health', 'maintenance', 'fuel', 'drivers', 'compliance', 'reports', 'diagnostics'],
    kind: AGENT_KINDS.ANALYST,
    cost: 'llm',
    parallelSafe: true,
  },
  support: {
    skills: ['techIssues', 'bugs', 'troubleshooting', 'escalation', 'tickets'],
    kind: AGENT_KINDS.ACTOR,
    cost: 'llm',
    parallelSafe: true,
  },
  crm: {
    skills: ['lookup', 'leadUpdate', 'contactCreate', 'companyCreate', 'activityTimeline', 'callHistory', 'relationships'],
    kind: AGENT_KINDS.DATA,
    cost: 'rules+db',
    parallelSafe: true,
  },
  scheduling: {
    skills: ['calendar', 'availability', 'timezone', 'meetingCreate', 'demoConfirm', 'emailConfirm', 'smsConfirm', 'reminders'],
    kind: AGENT_KINDS.DATA,
    cost: 'rules+db',
    parallelSafe: false,
  },
  analytics: {
    skills: ['quality', 'leadScore', 'sentiment', 'summary', 'insights', 'aiPerformance', 'kpis'],
    kind: AGENT_KINDS.OBSERVER,
    cost: 'cheap+llm',
    parallelSafe: true,
  },
  knowledge: {
    skills: ['rag', 'retrieval', 'webSearch', 'docs', 'pricing', 'policies', 'faq', 'confidence'],
    kind: AGENT_KINDS.DATA,
    cost: 'rules+rag',
    parallelSafe: true,
  },
};

export class AgentRegistry {
  constructor() {
    this._agents = new Map();
    this._metadata = new Map();
    for (const [agentId, metadata] of Object.entries(DEFAULT_AGENT_METADATA)) {
      this._metadata.set(agentId, { ...metadata });
    }
  }

  register(agent, metadata = {}) {
    if (!agent || typeof agent.execute !== 'function' || typeof agent.id !== 'string') {
      throw new TypeError('Agent must expose id (string) and execute(task, context)');
    }
    const meta = { ...(DEFAULT_AGENT_METADATA[agent.id] || {}), ...metadata };
    this._agents.set(agent.id, agent);
    this._metadata.set(agent.id, meta);
    logger.info('AGENT_REGISTERED', { agent: agent.id, kind: meta.kind, cost: meta.cost, skills: meta.skills?.length || 0 });
    return agent;
  }

  get(agentId) {
    return this._agents.get(agentId) || null;
  }

  has(agentId) {
    return this._agents.has(agentId);
  }

  getMetadata(agentId) {
    return this._metadata.get(agentId) || null;
  }

  findBySkill(skill) {
    const matches = [];
    for (const [id, meta] of this._metadata.entries()) {
      if (meta.skills?.includes(skill) && this._agents.has(id)) matches.push({ id, metadata: meta });
    }
    return matches;
  }

  findByKind(kind) {
    const matches = [];
    for (const [id, meta] of this._metadata.entries()) {
      if (meta.kind === kind && this._agents.has(id)) matches.push({ id, metadata: meta });
    }
    return matches;
  }

  list() {
    return Array.from(this._metadata.entries()).map(([id, metadata]) => ({
      id,
      metadata,
      registered: this._agents.has(id),
    }));
  }

  size() {
    return this._agents.size;
  }
}

export function createRegistry() {
  return new AgentRegistry();
}
