import { describe, it, expect } from 'vitest';
import {
  AgentMemory,
  canWrite,
  getOwnedSections,
} from '../../src/multiagent/shared/agentMemory.js';

describe('agent memory: access control', () => {
  it('allows owners to write their sections', () => {
    const memory = new AgentMemory({ callSid: 'CA1' });
    expect(memory.set('crm', 'crm', 'customerId', 'c1')).toBe(true);
    expect(memory.get('crm', 'customerId')).toBe('c1');
  });

  it('denies writes to sections owned by other agents', () => {
    const memory = new AgentMemory({ callSid: 'CA1' });
    expect(memory.set('sales', 'crm', 'customerId', 'c1')).toBe(false);
    expect(memory.get('crm', 'customerId')).toBeUndefined();
  });

  it('denies writes to unknown sections entirely', () => {
    const memory = new AgentMemory({ callSid: 'CA1' });
    expect(memory.set('crm', 'noSuchSection', 'k', 'v')).toBe(false);
  });

  it('supervisor can write conversation and currentTask', () => {
    const memory = new AgentMemory();
    expect(memory.set('receptionist', 'conversation', 'state', 'INTENT')).toBe(true);
    expect(memory.get('conversation', 'state')).toBe('INTENT');
  });

  it('getOwnedSections and canWrite agree', () => {
    for (const agent of ['crm', 'knowledge', 'sales', 'support', 'scheduling', 'receptionist']) {
      for (const section of getOwnedSections(agent)) {
        expect(canWrite(agent, section)).toBe(true);
      }
      expect(canWrite(agent, 'crm')).toBe(agent === 'crm');
    }
  });
});

describe('agent memory: values', () => {
  it('get returns whole section when key omitted', () => {
    const memory = new AgentMemory();
    memory.set('crm', 'lead', 'score', 42);
    expect(memory.get('lead')).toEqual({ score: 42, qualified: false, stage: null });
  });

  it('append respects the limit', () => {
    const memory = new AgentMemory();
    for (let i = 0; i < 10; i++) {
      memory.append('knowledge', 'knowledge', 'answeredTopics', { n: i }, { limit: 3 });
    }
    const topics = memory.get('knowledge', 'answeredTopics');
    expect(topics).toHaveLength(3);
    expect(topics[0].n).toBe(7);
  });

  it('update replaces the section via updater', () => {
    const memory = new AgentMemory();
    memory.set('crm', 'lead', 'score', 10);
    memory.update('crm', 'lead', (lead) => ({ ...lead, score: 55, qualified: true }));
    expect(memory.get('lead', 'score')).toBe(55);
    expect(memory.get('lead', 'qualified')).toBe(true);
  });

  it('update denies non-owners and returns null', () => {
    const memory = new AgentMemory();
    expect(memory.update('sales', 'crm', (crm) => crm)).toBeNull();
  });
});

describe('agent memory: snapshot and hydration', () => {
  it('snapshot is a deep copy and carries metadata', () => {
    const memory = new AgentMemory({ callSid: 'CA1', userId: 'u1', companyId: 'co1' });
    memory.set('crm', 'crm', 'history', { calls: 3 });
    const snapshot = memory.snapshot();
    expect(snapshot.callSid).toBe('CA1');
    expect(snapshot.userId).toBe('u1');
    expect(snapshot.revision).toBe(1);
    snapshot.data.crm.history.calls = 99;
    expect(memory.get('crm', 'history').calls).toBe(3);
  });

  it('round-trips through toPersistence/fromPersistence', () => {
    const memory = new AgentMemory({ callSid: 'CA1', userId: 'u1' });
    memory.set('crm', 'identity', 'name', 'Alice');
    memory.set('crm', 'crm', 'isReturning', true);
    const record = memory.toPersistence();
    const restored = AgentMemory.fromPersistence(record);
    expect(restored.memoryId).toBe(memory.memoryId);
    expect(restored.get('identity', 'name')).toBe('Alice');
    expect(restored.get('crm', 'isReturning')).toBe(true);
    expect(restored.hydrated).toBe(true);
  });

  it('fromPersistence returns null for garbage', () => {
    expect(AgentMemory.fromPersistence(null)).toBeNull();
    expect(AgentMemory.fromPersistence({})).toBeNull();
  });

  it('onChange listeners fire on writes and can be removed', () => {
    const memory = new AgentMemory();
    const events = [];
    const off = memory.onChange((e) => events.push(e));
    memory.set('crm', 'lead', 'score', 1);
    expect(events).toHaveLength(1);
    off();
    memory.set('crm', 'lead', 'score', 2);
    expect(events).toHaveLength(1);
  });
});
