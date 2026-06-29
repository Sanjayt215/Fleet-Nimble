/**
 * AI Analytics Service
 * Tracks AI usage, performance metrics, and user engagement
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

/**
 * Track AI usage
 */
export async function trackAIUsage(userId, action, metadata = {}) {
  try {
    await prisma.aiAnalytics.create({
      data: {
        userId,
        action,
        metadata,
        timestamp: new Date(),
      },
    });

    logger.info('AI usage tracked', { userId, action });
  } catch (error) {
    logger.error('Error tracking AI usage', { userId, action, error: error.message });
  }
}

/**
 * Get AI usage statistics for a user
 */
export async function getUserAIUsageStats(userId, days = 30) {
  try {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const analytics = await prisma.aiAnalytics.findMany({
      where: {
        userId,
        timestamp: { gte: cutoffDate },
      },
      orderBy: { timestamp: 'desc' },
    });

    const actionCounts = {};
    analytics.forEach(a => {
      actionCounts[a.action] = (actionCounts[a.action] || 0) + 1;
    });

    const totalRequests = analytics.length;
    const uniqueActions = Object.keys(actionCounts).length;
    const avgRequestsPerDay = totalRequests / days;

    return {
      totalRequests,
      uniqueActions,
      avgRequestsPerDay: avgRequestsPerDay.toFixed(2),
      actionBreakdown: actionCounts,
      period: `Last ${days} days`,
    };
  } catch (error) {
    logger.error('Error getting user AI usage stats', { userId, error: error.message });
    throw error;
  }
}

/**
 * Get overall AI usage statistics
 */
export async function getOverallAIUsageStats(days = 30) {
  try {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const analytics = await prisma.aiAnalytics.findMany({
      where: {
        timestamp: { gte: cutoffDate },
      },
    });

    const totalRequests = analytics.length;
    const uniqueUsers = new Set(analytics.map(a => a.userId)).size;

    const actionCounts = {};
    analytics.forEach(a => {
      actionCounts[a.action] = (actionCounts[a.action] || 0) + 1;
    });

    // Calculate daily usage
    const dailyUsage = {};
    analytics.forEach(a => {
      const date = a.timestamp.toISOString().split('T')[0];
      dailyUsage[date] = (dailyUsage[date] || 0) + 1;
    });

    const avgDailyRequests = totalRequests / days;
    const peakDay = Object.entries(dailyUsage).sort((a, b) => b[1] - a[1])[0];

    return {
      totalRequests,
      uniqueUsers,
      avgDailyRequests: avgDailyRequests.toFixed(2),
      peakDay: peakDay ? { date: peakDay[0], requests: peakDay[1] } : null,
      actionBreakdown: actionCounts,
      dailyUsage,
      period: `Last ${days} days`,
    };
  } catch (error) {
    logger.error('Error getting overall AI usage stats', { error: error.message });
    throw error;
  }
}

/**
 * Track AI response time
 */
export async function trackAIResponseTime(userId, action, responseTimeMs) {
  try {
    await prisma.aiPerformance.create({
      data: {
        userId,
        action,
        responseTimeMs,
        timestamp: new Date(),
      },
    });
  } catch (error) {
    logger.error('Error tracking AI response time', { userId, action, error: error.message });
  }
}

/**
 * Get AI performance metrics
 */
export async function getAIPerformanceMetrics(days = 30) {
  try {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const performance = await prisma.aiPerformance.findMany({
      where: {
        timestamp: { gte: cutoffDate },
      },
    });

    if (performance.length === 0) {
      return {
        avgResponseTime: 0,
        maxResponseTime: 0,
        minResponseTime: 0,
        p50ResponseTime: 0,
        p95ResponseTime: 0,
        p99ResponseTime: 0,
        totalRequests: 0,
      };
    }

    const responseTimes = performance.map(p => p.responseTimeMs);
    responseTimes.sort((a, b) => a - b);

    const avgResponseTime = responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length;
    const maxResponseTime = responseTimes[responseTimes.length - 1];
    const minResponseTime = responseTimes[0];

    const p50Index = Math.floor(responseTimes.length * 0.5);
    const p95Index = Math.floor(responseTimes.length * 0.95);
    const p99Index = Math.floor(responseTimes.length * 0.99);

    return {
      avgResponseTime: avgResponseTime.toFixed(2),
      maxResponseTime: maxResponseTime.toFixed(2),
      minResponseTime: minResponseTime.toFixed(2),
      p50ResponseTime: responseTimes[p50Index].toFixed(2),
      p95ResponseTime: responseTimes[p95Index].toFixed(2),
      p99ResponseTime: responseTimes[p99Index].toFixed(2),
      totalRequests: performance.length,
      period: `Last ${days} days`,
    };
  } catch (error) {
    logger.error('Error getting AI performance metrics', { error: error.message });
    throw error;
  }
}

/**
 * Track AI error
 */
export async function trackAIError(userId, action, errorMessage, errorType) {
  try {
    await prisma.aiErrorLog.create({
      data: {
        userId,
        action,
        errorMessage,
        errorType,
        timestamp: new Date(),
      },
    });

    logger.error('AI error tracked', { userId, action, errorType, errorMessage });
  } catch (error) {
    logger.error('Error tracking AI error', { userId, action, error: error.message });
  }
}

/**
 * Get AI error statistics
 */
export async function getAIErrorStats(days = 30) {
  try {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const errors = await prisma.aiErrorLog.findMany({
      where: {
        timestamp: { gte: cutoffDate },
      },
    });

    const totalErrors = errors.length;
    const errorTypes = {};
    errors.forEach(e => {
      errorTypes[e.errorType] = (errorTypes[e.errorType] || 0) + 1;
    });

    const errorRate = totalErrors / (await getOverallAIUsageStats(days)).totalRequests;

    return {
      totalErrors,
      errorRate: (errorRate * 100).toFixed(2),
      errorBreakdown: errorTypes,
      period: `Last ${days} days`,
    };
  } catch (error) {
    logger.error('Error getting AI error stats', { error: error.message });
    throw error;
  }
}

/**
 * Get comprehensive AI analytics dashboard
 */
export async function getAIAnalyticsDashboard(days = 30) {
  try {
    const [usageStats, performanceMetrics, errorStats] = await Promise.all([
      getOverallAIUsageStats(days),
      getAIPerformanceMetrics(days),
      getAIErrorStats(days),
    ]);

    return {
      usage: usageStats,
      performance: performanceMetrics,
      errors: errorStats,
      healthScore: calculateAIHealthScore(performanceMetrics, errorStats),
      generatedAt: new Date().toISOString(),
      period: `Last ${days} days`,
    };
  } catch (error) {
    logger.error('Error getting AI analytics dashboard', { error: error.message });
    throw error;
  }
}

/**
 * Calculate AI health score
 */
function calculateAIHealthScore(performance, errors) {
  let score = 100;

  // Response time impact
  if (parseFloat(performance.avgResponseTime) > 3000) score -= 20;
  else if (parseFloat(performance.avgResponseTime) > 2000) score -= 10;
  else if (parseFloat(performance.avgResponseTime) > 1000) score -= 5;

  // Error rate impact
  const errorRate = parseFloat(errors.errorRate);
  if (errorRate > 10) score -= 30;
  else if (errorRate > 5) score -= 20;
  else if (errorRate > 2) score -= 10;
  else if (errorRate > 1) score -= 5;

  return Math.max(0, score);
}

/**
 * Clean up old analytics data
 */
export async function cleanupOldAnalytics(daysToKeep = 90) {
  try {
    const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);

    const [deletedAnalytics, deletedPerformance, deletedErrors] = await Promise.all([
      prisma.aiAnalytics.deleteMany({
        where: { timestamp: { lt: cutoffDate } },
      }),
      prisma.aiPerformance.deleteMany({
        where: { timestamp: { lt: cutoffDate } },
      }),
      prisma.aiErrorLog.deleteMany({
        where: { timestamp: { lt: cutoffDate } },
      }),
    ]);

    logger.info('Old analytics data cleaned up', {
      deletedAnalytics: deletedAnalytics.count,
      deletedPerformance: deletedPerformance.count,
      deletedErrors: deletedErrors.count,
    });

    return {
      deletedAnalytics: deletedAnalytics.count,
      deletedPerformance: deletedPerformance.count,
      deletedErrors: deletedErrors.count,
    };
  } catch (error) {
    logger.error('Error cleaning up old analytics', { error: error.message });
    throw error;
  }
}

// Run cleanup weekly
setInterval(() => {
  cleanupOldAnalytics(90).catch(err => logger.error('Analytics cleanup failed', { error: err.message }));
}, 7 * 24 * 60 * 60 * 1000);
