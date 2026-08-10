import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import { config } from '../config/index.js';
import { emitToUser, emitToAdminRoom } from '../utils/socketHub.js';
import { isPersistenceAvailable } from '../services/receptionistTenantResolver.service.js';
import { getFleetKpis } from './fleetIntelligence.service.js';

/**
 * Fleet Brain Business Intelligence.
 * Generates executive, fleet, sales, support and AI-performance insights
 * plus revenue and lead forecasts. Insights are emitted live and persisted
 * when persistence is available.
 */

export const INSIGHT_TYPES = Object.freeze({
  EXECUTIVE: 'EXECUTIVE',
  FLEET: 'FLEET',
  SALES: 'SALES',
  SUPPORT: 'SUPPORT',
  AI_PERFORMANCE: 'AI_PERFORMANCE',
  REVENUE_FORECAST: 'REVENUE_FORECAST',
  LEAD_FORECAST: 'LEAD_FORECAST',
});

function linearForecast(values) {
  const n = values.length;
  if (n < 2) return { trend: 'insufficient_data', next: values[0] ?? 0, slope: 0 };
  const xs = values.map((_, i) => i);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = values.reduce((a, b) => a + b, 0) / n;
  const slope = xs.reduce((s, x, i) => s + (x - meanX) * (values[i] - meanY), 0)
    / xs.reduce((s, x) => s + (x - meanX) ** 2, 0);
  const intercept = meanY - slope * meanX;
  return {
    trend: slope > 0.01 ? 'up' : slope < -0.01 ? 'down' : 'flat',
    slope: Math.round(slope * 100) / 100,
    next: Math.max(0, Math.round(intercept + slope * n)),
  };
}

export async function generateBusinessInsights(userId, { companyId = null, days = 30 } = {}) {
  if (!isPersistenceAvailable()) {
    return { insights: [], source: 'degraded' };
  }

  const since = new Date(Date.now() - days * 86400000);
  const insights = [];
  const period = `${days}d`;

  try {
    const [calls, appointments, tickets, fleetKpis, aiPerformance] = await Promise.all([
      prisma.aiReceptionistCall.findMany({
        where: { userId, callStartedAt: { gte: since } },
        select: { id: true, callStatus: true, sentiment: true, callStartedAt: true },
      }),
      prisma.aiReceptionistAppointment.count({ where: { userId, createdAt: { gte: since } } }),
      prisma.aiReceptionistSupportTicket.count({ where: { userId, createdAt: { gte: since } } }),
      getFleetKpis(userId, { days }),
      getAiPerformance(userId, days),
    ]);

    const completed = calls.filter(c => c.callStatus === 'COMPLETED');
    const positive = calls.filter(c => c.sentiment === 'positive').length;
    const negative = calls.filter(c => c.sentiment === 'negative').length;

    // Executive insight
    const apptRate = calls.length ? Math.round((appointments / calls.length) * 100) : 0;
    insights.push({
      type: INSIGHT_TYPES.EXECUTIVE,
      title: `Executive overview — last ${days} days`,
      summary: `${calls.length} calls, ${appointments} appointments (${apptRate}% booking rate), ${tickets} support tickets.`,
      data: { calls: calls.length, appointments, apptRate, tickets, period },
    });

    // Fleet insight
    if (fleetKpis && Object.keys(fleetKpis).length > 0) {
      insights.push({
        type: INSIGHT_TYPES.FLEET,
        title: `Fleet state — ${fleetKpis.vehicleCount || 0} vehicles`,
        summary: `${fleetKpis.activeVehicles || 0} active vehicles, ${fleetKpis.openAlerts || 0} open alerts, ${fleetKpis.maintenanceDue || 0} maintenance items due.`,
        data: { ...fleetKpis, period },
      });
    }

    // Sales insight
    const qualifiedLeads = await prisma.receptionistCustomer.count({
      where: { userId, leadScore: { gte: 60 } },
    });
    insights.push({
      type: INSIGHT_TYPES.SALES,
      title: `Sales pipeline — last ${days} days`,
      summary: `${qualifiedLeads} qualified leads (score ≥ 60), ${appointments} demos booked.`,
      data: { qualifiedLeads, appointments, apptRate, period },
    });

    // Support insight
    const openTickets = await prisma.aiReceptionistSupportTicket.count({
      where: { userId, status: { in: ['OPEN', 'IN_PROGRESS'] } },
    });
    insights.push({
      type: INSIGHT_TYPES.SUPPORT,
      title: `Support load — last ${days} days`,
      summary: `${tickets} tickets created, ${openTickets} currently open, ${negative} calls with negative sentiment.`,
      data: { tickets, openTickets, negativeCalls: negative, period },
    });

    // AI performance insight
    insights.push({
      type: INSIGHT_TYPES.AI_PERFORMANCE,
      title: `AI performance — last ${days} days`,
      summary: aiPerformance.summary || `${calls.length} calls handled, ${positive} positive sentiment.`,
      data: { ...aiPerformance, calls: calls.length, positive, period },
    });

    // Revenue forecast — demo booking based
    const weeklyBookings = aggregateWeekly(appointments, days);
    const revenueForecast = linearForecast(weeklyBookings.map(b => b.count));
    const avgDealValue = 1200;
    insights.push({
      type: INSIGHT_TYPES.REVENUE_FORECAST,
      title: `Revenue forecast — next period`,
      summary: `Expected ${revenueForecast.next} bookings next period ≈ $${(revenueForecast.next * avgDealValue).toLocaleString()} at $${avgDealValue.toLocaleString()} avg deal value.`,
      data: { forecast: revenueForecast, avgDealValue, estimatedRevenue: revenueForecast.next * avgDealValue, period },
    });

    // Lead forecast — inbound calls based
    const weeklyCalls = aggregateWeekly(calls.length, days);
    const leadForecast = linearForecast(weeklyCalls.map(b => b.count));
    insights.push({
      type: INSIGHT_TYPES.LEAD_FORECAST,
      title: `Lead forecast — next period`,
      summary: `Expected ${leadForecast.next} inbound calls next period (${leadForecast.trend === 'up' ? 'rising' : leadForecast.trend === 'down' ? 'falling' : 'flat'}).`,
      data: { forecast: leadForecast, period },
    });

    if (config.fleetBrain.persistInsights) {
      await persistInsights(userId, companyId, insights, period);
    }

    emitToUser(userId, 'fleetbrain.insight', { insights });
    emitToAdminRoom('fleetbrain.insight', { userId, insights });
    logger.info('FLEET_BRAIN_INSIGHTS_GENERATED', { userId, count: insights.length, period });
    return { insights, source: 'persisted' };
  } catch (err) {
    logger.warn('FLEET_BRAIN_INSIGHTS_FAILED', { userId, error: err.message });
    return { insights: [], source: 'degraded', error: err.message };
  }
}

async function getAiPerformance(userId, days) {
  try {
    const aiAnalytics = await import('../services/aiAnalytics.js');
    const [usage, metrics] = await Promise.all([
      aiAnalytics.getOverallAIUsageStats(days),
      aiAnalytics.getAIPerformanceMetrics(days),
    ]);
    return {
      totalRequests: usage?.totalRequests ?? usage?.requests ?? 0,
      avgResponseMs: metrics?.averageResponseTime ?? metrics?.avgResponseTime ?? 0,
      successRate: metrics?.successRate ?? null,
      summary: `${usage?.totalRequests ?? 0} AI requests, avg ${Math.round(metrics?.averageResponseTime ?? 0)}ms response.`,
    };
  } catch (err) {
    return { totalRequests: 0, avgResponseMs: 0, successRate: null, summary: 'AI performance metrics unavailable' };
  }
}

function aggregateWeekly(total, days) {
  const weeks = Math.max(1, Math.ceil(days / 7));
  if (total === 0) return Array.from({ length: weeks }, () => ({ count: 0 }));
  const perWeek = Math.round(total / weeks);
  return Array.from({ length: weeks }, (_, i) => ({ week: i + 1, count: perWeek }));
}

async function persistInsights(userId, companyId, insights, period) {
  try {
    for (const insight of insights) {
      await prisma.fleetBrainInsight.create({
        data: {
          userId,
          companyId,
          type: insight.type,
          title: insight.title,
          summary: insight.summary,
          data: insight.data,
          period,
        },
      });
    }
  } catch (err) {
    logger.warn('FLEET_BRAIN_INSIGHTS_PERSIST_FAILED', { userId, error: err.message });
  }
}

export async function getBusinessIntelligenceSnapshot(userId, { days = 30 } = {}) {
  if (!isPersistenceAvailable()) {
    return { insights: [], source: 'degraded' };
  }
  try {
    const since = new Date(Date.now() - days * 86400000);
    const [insights, calls, appointments, tickets] = await Promise.all([
      prisma.fleetBrainInsight.findMany({
        where: { userId, createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      prisma.aiReceptionistCall.count({ where: { userId, callStartedAt: { gte: since } } }),
      prisma.aiReceptionistAppointment.count({ where: { userId, createdAt: { gte: since } } }),
      prisma.aiReceptionistSupportTicket.count({ where: { userId, createdAt: { gte: since } } }),
    ]);
    return {
      insights,
      totals: { calls, appointments, tickets },
      source: 'persisted',
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    logger.warn('FLEET_BRAIN_SNAPSHOT_FAILED', { userId, error: err.message });
    return { insights: [], source: 'degraded' };
  }
}

export async function getInsightsByType(userId, type, { limit = 10 } = {}) {
  if (!isPersistenceAvailable()) return [];
  try {
    return await prisma.fleetBrainInsight.findMany({
      where: { userId, type },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  } catch (err) {
    logger.warn('FLEET_BRAIN_INSIGHTS_QUERY_FAILED', { userId, type, error: err.message });
    return [];
  }
}
