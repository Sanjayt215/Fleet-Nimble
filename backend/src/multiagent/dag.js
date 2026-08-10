import logger from '../utils/logger.js';

export class DagCycleError extends Error {
  constructor() {
    super('DAG contains a cycle');
    this.name = 'DagCycleError';
  }
}

export function buildLevels(tasks) {
  const byId = new Map();
  const dependents = new Map();
  const indegree = new Map();

  for (const task of tasks) {
    byId.set(task.taskId, task);
    indegree.set(task.taskId, 0);
    dependents.set(task.taskId, []);
  }

  for (const task of tasks) {
    for (const depId of task.constraints?.dependsOn || []) {
      if (!byId.has(depId)) {
        throw new Error(`DAG dependency "${depId}" not found in task set`);
      }
      dependents.get(depId).push(task.taskId);
      indegree.set(task.taskId, (indegree.get(task.taskId) || 0) + 1);
    }
  }

  const levels = [];
  let frontier = [...indegree.entries()]
    .filter(([, d]) => d === 0)
    .map(([id]) => id)
    .sort();

  const scheduled = new Set();
  while (frontier.length > 0) {
    const level = frontier.map(id => byId.get(id));
    levels.push(level);
    const next = [];
    for (const id of frontier) {
      scheduled.add(id);
      for (const dependent of dependents.get(id)) {
        const remaining = (indegree.get(dependent) || 0) - 1;
        indegree.set(dependent, remaining);
        if (remaining === 0) next.push(dependent);
      }
    }
    frontier = next.sort();
  }

  if (scheduled.size !== tasks.length) {
    throw new DagCycleError();
  }

  return levels;
}

export function groupLevelsForExecution(levels, { maxWidth = 4 } = {}) {
  const groups = [];
  for (const level of levels) {
    for (let i = 0; i < level.length; i += maxWidth) {
      groups.push(level.slice(i, i + maxWidth));
    }
  }
  return groups;
}

export async function executeDag(tasks, executor, { maxWidth = 4, results = null } = {}) {
  const levels = buildLevels(tasks);
  const groups = groupLevelsForExecution(levels, { maxWidth });
  const output = results || new Map();

  logger.info('DAG_EXECUTION_START', { tasks: tasks.length, levels: levels.length, groups: groups.length });

  for (const group of groups) {
    const outcomes = await Promise.all(group.map(async (task) => {
      try {
        const outcome = await executor(task);
        return { taskId: task.taskId, outcome };
      } catch (err) {
        return { taskId: task.taskId, error: err };
      }
    }));
    for (const entry of outcomes) {
      if (entry.error) {
        output.set(entry.taskId, { taskId: entry.taskId, status: 'FAILED', error: entry.error });
      } else {
        output.set(entry.taskId, entry.outcome);
      }
    }
  }

  return output;
}

export function flattenResults(output) {
  return Array.from(output.values());
}
