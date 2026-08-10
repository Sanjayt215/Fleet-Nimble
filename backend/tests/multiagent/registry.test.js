import { describe, it, expect } from 'vitest';
import { createRegistry, DEFAULT_AGENT_METADATA } from '../../src/multiagent/registry.js';
import { AGENT_KINDS } from '../../src/multiagent/protocol.js';

const stubAgent = (id) => ({
  id,
  execute: async () => ({ status: 'SUCCESS' }),
});

describe('registry', () => {
  it('registers an agent and exposes it', () => {
    const registry = createRegistry();
    const agent = stubAgent('crm');
    registry.register(agent);
    expect(registry.get('crm')).toBe(agent);
    expect(registry.has('crm')).toBe(true);
    expect(registry.size()).toBe(1);
  });

  it('throws when registering a malformed agent', () => {
    const registry = createRegistry();
    expect(() => registry.register({ id: 'x' })).toThrow(TypeError);
    expect(() => registry.register({ execute: async () => ({}) })).toThrow(TypeError);
  });

  it('applies default metadata by agent id', () => {
    const registry = createRegistry();
    registry.register(stubAgent('knowledge'));
    const metadata = registry.getMetadata('knowledge');
    expect(metadata.kind).toBe(AGENT_KINDS.DATA);
    expect(metadata.cost).toBe('rules+rag');
    expect(metadata.parallelSafe).toBe(true);
  });

  it('overrides metadata with provided values', () => {
    const registry = createRegistry();
    registry.register(stubAgent('knowledge'), { kind: AGENT_KINDS.ANALYST });
    expect(registry.getMetadata('knowledge').kind).toBe(AGENT_KINDS.ANALYST);
  });

  it('finds agents by skill', () => {
    const registry = createRegistry();
    registry.register(stubAgent('sales'));
    registry.register(stubAgent('support'));
    const matches = registry.findBySkill('pricing');
    expect(matches.map(m => m.id)).toContain('sales');
  });

  it('finds agents by kind', () => {
    const registry = createRegistry();
    registry.register(stubAgent('crm'));
    registry.register(stubAgent('knowledge'));
    const dataAgents = registry.findByKind(AGENT_KINDS.DATA);
    expect(dataAgents.length).toBe(2);
  });

  it('lists all registered and unregistered entries', () => {
    const registry = createRegistry();
    registry.register(stubAgent('sales'));
    const list = registry.list();
    expect(list.length).toBe(Object.keys(DEFAULT_AGENT_METADATA).length);
    const sales = list.find(entry => entry.id === 'sales');
    expect(sales.registered).toBe(true);
    const crm = list.find(entry => entry.id === 'crm');
    expect(crm.registered).toBe(false);
  });

  it('returns null for unknown agents', () => {
    const registry = createRegistry();
    expect(registry.get('nope')).toBeNull();
    expect(registry.getMetadata('nope')).toBeNull();
  });
});
