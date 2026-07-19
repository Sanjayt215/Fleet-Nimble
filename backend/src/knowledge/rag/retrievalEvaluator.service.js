import logger from '../../utils/logger.js';
import { hybridSearch } from './hybridSearch.service.js';

export async function evaluateRetrieval(testCases) {
  if (!testCases || testCases.length === 0) {
    logger.warn('RAG_EVAL_NO_TEST_CASES');
    return { metrics: null, error: 'no test cases' };
  }

  let totalRecall = 0;
  let totalPrecision = 0;
  let totalMrr = 0;
  let totalLatency = 0;
  let count = 0;

  const results = [];

  for (const tc of testCases) {
    const startTime = Date.now();
    const { results: retrieved } = await hybridSearch(tc.query, {
      topK: tc.topK || 10,
      minScore: tc.minScore || 0.0,
    });
    const latencyMs = Date.now() - startTime;

    const retrievedIds = retrieved.map(r => r.articleId);
    const relevantIds = Array.isArray(tc.relevantIds) ? tc.relevantIds : [];

    const truePositives = retrievedIds.filter(id => relevantIds.includes(id)).length;

    const precision = relevantIds.length > 0 ? truePositives / retrievedIds.length : 0;
    const recall = relevantIds.length > 0 ? truePositives / relevantIds.length : 0;

    let mrr = 0;
    for (let i = 0; i < retrievedIds.length; i++) {
      if (relevantIds.includes(retrievedIds[i])) {
        mrr = 1 / (i + 1);
        break;
      }
    }

    totalRecall += recall;
    totalPrecision += precision;
    totalMrr += mrr;
    totalLatency += latencyMs;
    count++;

    results.push({
      query: tc.query,
      precision: Math.round(precision * 1000) / 1000,
      recall: Math.round(recall * 1000) / 1000,
      mrr: Math.round(mrr * 1000) / 1000,
      latencyMs,
      retrievedCount: retrievedIds.length,
      relevantCount: relevantIds.length,
      truePositives,
    });
  }

  const avgRecall = totalRecall / count;
  const avgPrecision = totalPrecision / count;
  const avgMrr = totalMrr / count;
  const avgLatency = totalLatency / count;

  const metrics = {
    recallAtK: Math.round(avgRecall * 1000) / 1000,
    precisionAtK: Math.round(avgPrecision * 1000) / 1000,
    mrr: Math.round(avgMrr * 1000) / 1000,
    avgLatencyMs: Math.round(avgLatency),
    testCaseCount: count,
  };

  logger.info('RAG_EVAL_COMPLETED', metrics);

  return { metrics, results };
}

export async function storeEvaluationResults(query, retrievedIds, relevantIds, latencyMs, searchType = 'hybrid') {
  try {
    const retrievedSet = new Set(retrievedIds);
    const relevantSet = new Set(relevantIds);
    const truePositives = [...retrievedSet].filter(id => relevantSet.has(id)).length;

    const recall = relevantSet.size > 0 ? truePositives / relevantSet.size : 0;
    const precision = retrievedSet.size > 0 ? truePositives / retrievedSet.size : 0;

    let mrr = 0;
    for (let i = 0; i < retrievedIds.length; i++) {
      if (relevantSet.has(retrievedIds[i])) {
        mrr = 1 / (i + 1);
        break;
      }
    }

    const { default: prisma } = await import('../../utils/prisma.js');
    await prisma.retrievalMetric.create({
      data: {
        query,
        retrievedIds,
        relevantIds,
        recallAtK: Math.round(recall * 1000) / 1000,
        precisionAtK: Math.round(precision * 1000) / 1000,
        mrr: Math.round(mrr * 1000) / 1000,
        latencyMs,
        searchType,
      },
    });

    return { recall, precision, mrr };
  } catch (err) {
    logger.warn('RAG_EVAL_STORE_FAILED', { error: err.message });
    return null;
  }
}

export async function getEvaluationMetrics(options = {}) {
  try {
    const { default: prisma } = await import('../../utils/prisma.js');
    const hours = options.hours || 24;

    const metrics = await prisma.retrievalMetric.findMany({
      where: { createdAt: { gte: new Date(Date.now() - hours * 3600000) } },
      orderBy: { createdAt: 'desc' },
      take: options.limit || 100,
    });

    if (metrics.length === 0) {
      return { avgRecall: null, avgPrecision: null, avgMrr: null, avgLatency: null, count: 0, metrics: [] };
    }

    const avgRecall = metrics.reduce((s, m) => s + (m.recallAtK || 0), 0) / metrics.length;
    const avgPrecision = metrics.reduce((s, m) => s + (m.precisionAtK || 0), 0) / metrics.length;
    const avgMrr = metrics.reduce((s, m) => s + (m.mrr || 0), 0) / metrics.length;
    const avgLatency = metrics.reduce((s, m) => s + (m.latencyMs || 0), 0) / metrics.length;

    return {
      avgRecall: Math.round(avgRecall * 1000) / 1000,
      avgPrecision: Math.round(avgPrecision * 1000) / 1000,
      avgMrr: Math.round(avgMrr * 1000) / 1000,
      avgLatencyMs: Math.round(avgLatency),
      count: metrics.length,
      metrics: metrics.slice(0, 20),
    };
  } catch (err) {
    logger.warn('RAG_EVAL_GET_METRICS_FAILED', { error: err.message });
    return { avgRecall: null, avgPrecision: null, avgMrr: null, avgLatency: null, count: 0, metrics: [] };
  }
}
