/**
 * Prisma Query Timing Middleware
 * Tracks database query performance
 */

import logger from './logger.js';

const queryMetrics = new Map();

export function prismaTimingMiddleware(params, next) {
  const startTime = Date.now();
  const model = params.model;
  const action = params.action;

  return next(params).then(result => {
    const duration = Date.now() - startTime;
    
    // Log slow queries (> 100ms)
    if (duration > 100) {
      logger.warn('SLOW_DB_QUERY', {
        model,
        action,
        duration,
        args: JSON.stringify(params.args).substring(0, 200)
      });
    }

    // Store metrics
    const key = `${model}.${action}`;
    if (!queryMetrics.has(key)) {
      queryMetrics.set(key, {
        count: 0,
        totalTime: 0,
        minTime: Infinity,
        maxTime: 0
      });
    }

    const metrics = queryMetrics.get(key);
    metrics.count++;
    metrics.totalTime += duration;
    metrics.minTime = Math.min(metrics.minTime, duration);
    metrics.maxTime = Math.max(metrics.maxTime, duration);

    return result;
  });
}

export function getPrismaMetrics() {
  const result = [];
  for (const [key, metrics] of queryMetrics.entries()) {
    result.push({
      query: key,
      count: metrics.count,
      avgTime: (metrics.totalTime / metrics.count).toFixed(2),
      minTime: metrics.minTime,
      maxTime: metrics.maxTime
    });
  }
  return result.sort((a, b) => b.avgTime - a.avgTime);
}

export function resetPrismaMetrics() {
  queryMetrics.clear();
}
