/**
 * Performance Monitoring Middleware
 * Tracks API latency and performance metrics
 */

import logger from '../utils/logger.js';

const performanceMetrics = new Map();

export function performanceMonitor(req, res, next) {
  const startTime = Date.now();
  const path = req.path;
  const method = req.method;

  // Track response time
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;

    // Log slow requests (> 1 second)
    if (duration > 1000) {
      logger.warn('SLOW_REQUEST', {
        method,
        path,
        duration,
        statusCode,
        ip: req.ip,
        userAgent: req.get('user-agent')
      });
    } else if (duration > 500) {
      logger.info('REQUEST_LATENCY', {
        method,
        path,
        duration,
        statusCode
      });
    }

    // Store metrics for analysis
    const key = `${method}:${path}`;
    if (!performanceMetrics.has(key)) {
      performanceMetrics.set(key, {
        count: 0,
        totalTime: 0,
        minTime: Infinity,
        maxTime: 0,
        errors: 0
      });
    }

    const metrics = performanceMetrics.get(key);
    metrics.count++;
    metrics.totalTime += duration;
    metrics.minTime = Math.min(metrics.minTime, duration);
    metrics.maxTime = Math.max(metrics.maxTime, duration);
    if (statusCode >= 400) {
      metrics.errors++;
    }
  });

  next();
}

export function getPerformanceMetrics() {
  const result = [];
  for (const [key, metrics] of performanceMetrics.entries()) {
    result.push({
      endpoint: key,
      count: metrics.count,
      avgTime: (metrics.totalTime / metrics.count).toFixed(2),
      minTime: metrics.minTime,
      maxTime: metrics.maxTime,
      errorRate: ((metrics.errors / metrics.count) * 100).toFixed(2)
    });
  }
  return result.sort((a, b) => b.avgTime - a.avgTime);
}

export function resetPerformanceMetrics() {
  performanceMetrics.clear();
}
