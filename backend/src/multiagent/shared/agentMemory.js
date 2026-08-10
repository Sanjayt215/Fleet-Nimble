import { createMemoryId } from '../protocol.js';
import logger from '../../utils/logger.js';
import { recordTimelineEvent, TIMELINE_EVENT_TYPES } from '../../services/conversationTimeline.service.js';

const TIMELINE_SECTIONS = new Set(['conversation', 'crm', 'lead', 'identity', 'knowledge', 'businessIntelligence']);

async function safeTimeline(eventType, label, data = {}) {
  try {
    await recordTimelineEvent({
      userId: data.userId || null,
      callId: data.callId || null,
      callSid: data.callSid || null,
      eventType,
      label,
      data,
    });
  } catch (err) {
    logger.warn('AGENT_MEMORY_TIMELINE_FAILED', { error: err.message });
  }
}

const OWNED_KEYS = {
  supervisor: ['conversation', 'currentTask', 'pendingTasks'],
  receptionist: ['conversation'],
  crm: ['identity', 'crm', 'lead'],
  knowledge: ['knowledge'],
  sales: ['businessIntelligence', 'lead'],
  support: ['businessIntelligence'],
  fleetExpert: ['businessIntelligence', 'knowledge'],
  scheduling: ['identity'],
};

const ALL_SECTIONS = [
  'identity',
  'crm',
  'conversation',
  'businessIntelligence',
  'lead',
  'knowledge',
  'currentTask',
  'pendingTasks',
  'emotions',
  'facts',
];

const OWNER_OF = {};
for (const [owner, sections] of Object.entries(OWNED_KEYS)) {
  for (const section of sections) {
    if (OWNER_OF[section]) OWNER_OF[section].push(owner);
    else OWNER_OF[section] = [owner];
  }
}

function defaultSection() {
  return {
    identity: {},
    crm: {},
    conversation: { state: 'IDLE', previousState: null, intent: null, intentQueue: [], taskStack: [] },
    businessIntelligence: {},
    lead: { score: 0, qualified: false, stage: null },
    knowledge: { retrievedArticles: [], answeredTopics: [], confidenceByTopic: {} },
    currentTask: null,
    pendingTasks: [],
    emotions: { current: 'neutral', trajectory: [] },
    facts: { custom: {} },
  };
}

export function canWrite(agentId, section) {
  const owners = OWNER_OF[section];
  if (!owners || owners.length === 0) return false;
  return owners.includes(agentId);
}

export function getOwnedSections(agentId) {
  return OWNED_KEYS[agentId] || [];
}

export class AgentMemory {
  constructor({ callSid = null, callId = null, userId = null, companyId = null, initial = {} } = {}) {
    this.memoryId = createMemoryId();
    this.callSid = callSid;
    this.callId = callId;
    this.userId = userId;
    this.companyId = companyId;
    const base = defaultSection();
    this.data = { ...base, ...(initial || {}) };
    this.revision = 0;
    this.hydrated = false;
    this._listeners = [];
  }

  get(section, key = null) {
    const sectionData = this.data[section];
    if (sectionData === undefined) return undefined;
    if (key === null || key === undefined) return sectionData;
    return sectionData[key];
  }

  set(agentId, section, key, value) {
    if (!canWrite(agentId, section)) {
      logger.warn('AGENT_MEMORY_WRITE_DENIED', { agent: agentId, section });
      return false;
    }
    if (!this.data[section]) this.data[section] = {};
    if (value === undefined) {
      delete this.data[section][key];
    } else {
      this.data[section][key] = value;
    }
    this.revision++;
    this._notify(agentId, section, key);
    this._recordMemoryChange(agentId, section, key, value);
    return true;
  }

  update(agentId, section, updater) {
    if (!canWrite(agentId, section)) {
      logger.warn('AGENT_MEMORY_WRITE_DENIED', { agent: agentId, section });
      return null;
    }
    if (!this.data[section]) this.data[section] = {};
    const current = structuredClone(this.data[section]);
    const next = updater(current);
    if (next === undefined || next === null) return null;
    this.data[section] = next;
    this.revision++;
    this._notify(agentId, section, null);
    this._recordMemoryChange(agentId, section, null, next);
    return next;
  }

  append(agentId, section, key, value, { limit = 50 } = {}) {
    if (!canWrite(agentId, section)) {
      logger.warn('AGENT_MEMORY_WRITE_DENIED', { agent: agentId, section });
      return false;
    }
    if (!this.data[section]) this.data[section] = {};
    if (!Array.isArray(this.data[section][key])) this.data[section][key] = [];
    this.data[section][key].push(value);
    if (this.data[section][key].length > limit) {
      this.data[section][key] = this.data[section][key].slice(-limit);
    }
    this.revision++;
    this._notify(agentId, section, key);
    this._recordMemoryChange(agentId, section, key, this.data[section][key]);
    return true;
  }

  _recordMemoryChange(agentId, section, key, value) {
    if (!TIMELINE_SECTIONS.has(section)) return;
    const record = {
      agentId,
      section,
      key,
      revision: this.revision,
      callSid: this.callSid,
      callId: this.callId,
      userId: this.userId,
    };
    if (section === 'conversation' && key === 'state' && typeof value === 'string') {
      safeTimeline(TIMELINE_EVENT_TYPES.FSM_TRANSITION, `FSM state → ${value}`, record);
      return;
    }
    const preview = typeof value === 'object' && value !== null
      ? JSON.stringify(value).substring(0, 120)
      : String(value).substring(0, 120);
    safeTimeline(TIMELINE_EVENT_TYPES.MEMORY_UPDATED, `Memory ${section}.${key} updated`, {
      ...record,
      preview,
    });
  }

  markHydrated() {
    this.hydrated = true;
  }

  snapshot() {
    return {
      memoryId: this.memoryId,
      callSid: this.callSid,
      callId: this.callId,
      userId: this.userId,
      companyId: this.companyId,
      revision: this.revision,
      hydrated: this.hydrated,
      data: structuredClone(this.data),
    };
  }

  toPersistence() {
    return {
      memoryId: this.memoryId,
      callSid: this.callSid,
      callId: this.callId,
      userId: this.userId,
      companyId: this.companyId,
      revision: this.revision,
      data: structuredClone(this.data),
    };
  }

  static fromPersistence(record) {
    if (!record || !record.data) return null;
    const memory = new AgentMemory({
      callSid: record.callSid || null,
      callId: record.callId || null,
      userId: record.userId || null,
      companyId: record.companyId || null,
      initial: record.data,
    });
    memory.memoryId = record.memoryId || memory.memoryId;
    memory.revision = record.revision || 0;
    memory.hydrated = true;
    return memory;
  }

  onChange(listener) {
    this._listeners.push(listener);
    return () => {
      this._listeners = this._listeners.filter(l => l !== listener);
    };
  }

  _notify(agentId, section, key) {
    for (const listener of this._listeners) {
      try {
        listener({ memoryId: this.memoryId, agentId, section, key, revision: this.revision });
      } catch (err) {
        logger.warn('AGENT_MEMORY_LISTENER_ERROR', { error: err.message });
      }
    }
  }
}

export const ALL_SECTIONS_LIST = [...ALL_SECTIONS];
export { ALL_SECTIONS };
