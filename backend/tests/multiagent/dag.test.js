import { describe, it, expect, vi } from 'vitest';
import { buildLevels, executeDag, groupLevelsForExecution, flattenResults, DagCycleError } from '../../src/multiagent/dag.js';
import { buildTask } from '../../src/multiagent/protocol.js';

const makeTask = (agentId, type, opts = {}) => buildTask({
  runId: 'R-1',
  agentId,
  taskType: type,
  payload: { q: type },
  constraints: opts.constraints || {},
});

describe('dag: buildLevels', () => {
  it('places independent tasks in level 0', () => {
    const tasks = [makeTask('crm', 'lookup'), makeTask('knowledge', 'retrieve')];
    const levels = buildLevels(tasks);
    expect(levels).toHaveLength(1);
    expect(levels[0]).toHaveLength(2);
  });

  it('orders dependent tasks after their dependencies', () => {
    const a = makeTask('knowledge', 'retrieve');
    const b = makeTask('sales', 'composePricing', { constraints: { dependsOn: [a.taskId] } });
    const c = makeTask('scheduling', 'parse');
    const levels = buildLevels([a, b, c]);
    expect(levels).toHaveLength(2);
    expect(levels[0].map(t => t.taskId).sort()).toEqual([a.taskId, c.taskId].sort());
    expect(levels[1][0].taskId).toBe(b.taskId);
  });

  it('supports chains of three levels', () => {
    const a = makeTask('knowledge', 'retrieve');
    const b = makeTask('sales', 'composePricing', { constraints: { dependsOn: [a.taskId] } });
    const c = makeTask('sales', 'proposeDemoSlots', { constraints: { dependsOn: [b.taskId] } });
    const levels = buildLevels([a, b, c]);
    expect(levels).toHaveLength(3);
  });

  it('throws DagCycleError on cycles', () => {
    const a = makeTask('a', 't1');
    const b = makeTask('b', 't2', { constraints: { dependsOn: [a.taskId] } });
    const cyclic = buildTask({
      runId: 'R-1', agentId: 'c', taskType: 't3',
      payload: {}, constraints: { dependsOn: [b.taskId] },
    });
    a.constraints.dependsOn = [cyclic.taskId];
    expect(() => buildLevels([a, b, cyclic])).toThrow(DagCycleError);
  });

  it('throws when a dependency is missing from the task set', () => {
    const a = makeTask('a', 't1');
    const b = makeTask('b', 't2', { constraints: { dependsOn: ['T-missing'] } });
    expect(() => buildLevels([a, b])).toThrow(/not found/);
  });
});

describe('dag: grouping', () => {
  it('chunks a level by maxWidth', () => {
    const tasks = Array.from({ length: 6 }, (_, i) => makeTask(`agent${i}`, `t${i}`));
    const levels = buildLevels(tasks);
    const groups = groupLevelsForExecution(levels, { maxWidth: 4 });
    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveLength(4);
    expect(groups[1]).toHaveLength(2);
  });
});

describe('dag: executeDag', () => {
  it('executes every task exactly once and returns outcomes keyed by taskId', async () => {
    const tasks = [makeTask('crm', 'lookup'), makeTask('knowledge', 'retrieve')];
    const spy = vi.fn(async (task) => ({ taskId: task.taskId, ok: true }));
    const output = await executeDag(tasks, spy);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(output.size).toBe(2);
    expect(output.get(tasks[0].taskId).ok).toBe(true);
  });

  it('runs dependent tasks after dependencies complete', async () => {
    const order = [];
    const a = makeTask('knowledge', 'retrieve');
    const b = makeTask('sales', 'composePricing', { constraints: { dependsOn: [a.taskId] } });
    const spy = vi.fn(async (task) => {
      order.push(task.taskId);
      return { taskId: task.taskId, status: 'SUCCESS' };
    });
    await executeDag([a, b], spy);
    expect(order).toEqual([a.taskId, b.taskId]);
  });

  it('records executor errors as FAILED entries instead of throwing', async () => {
    const tasks = [makeTask('crm', 'lookup')];
    const spy = vi.fn(async () => { throw new Error('kaboom'); });
    const output = await executeDag(tasks, spy);
    expect(output.get(tasks[0].taskId).status).toBe('FAILED');
    expect(output.get(tasks[0].taskId).error.message).toBe('kaboom');
  });

  it('flattenResults returns values in insertion order', async () => {
    const tasks = [makeTask('a', 't1'), makeTask('b', 't2')];
    const output = await executeDag(tasks, async (task) => ({ taskId: task.taskId }));
    expect(flattenResults(output)).toHaveLength(2);
  });
});
