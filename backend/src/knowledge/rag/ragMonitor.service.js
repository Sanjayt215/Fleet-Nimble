import logger from '../../utils/logger.js';

const metrics = {
  embeddingLatencies: [],
  searchLatencies: [],
  retrievalConfidences: [],
  totalEmbeddings: 0,
  totalSearches: 0,
  cacheHits: 0,
  cacheMisses: 0,
  failedEmbeddings: 0,
  reindexOperations: 0,
};

const MAX_HISTORY = 1000;

export function recordEmbeddingLatency(ms) {
  metrics.embeddingLatencies.push(ms);
  if (metrics.embeddingLatencies.length > MAX_HISTORY) metrics.embeddingLatencies.shift();
  metrics.totalEmbeddings++;
}

export function recordSearchLatency(ms) {
  metrics.searchLatencies.push(ms);
  if (metrics.searchLatencies.length > MAX_HISTORY) metrics.searchLatencies.shift();
  metrics.totalSearches++;
}

export function recordRetrievalConfidence(confidence) {
  metrics.retrievalConfidences.push(confidence);
  if (metrics.retrievalConfidences.length > MAX_HISTORY) metrics.retrievalConfidences.shift();
}

export function recordCacheHit() {
  metrics.cacheHits++;
}

export function recordCacheMiss() {
  metrics.cacheMisses++;
}

export function recordFailedEmbedding() {
  metrics.failedEmbeddings++;
}

export function recordReindexOperation() {
  metrics.reindexOperations++;
}

function average(arr) {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

export function getRAGMonitorStats() {
  const totalSearches = metrics.totalSearches;
  const cacheRate = totalSearches > 0 ? metrics.cacheHits / (metrics.cacheHits + metrics.cacheMisses) : 0;

  return {
    embedding: {
      total: metrics.totalEmbeddings,
      avgLatencyMs: Math.round(average(metrics.embeddingLatencies)),
      p95LatencyMs: Math.round(percentile(metrics.embeddingLatencies, 95)),
      p99LatencyMs: Math.round(percentile(metrics.embeddingLatencies, 99)),
    },
    search: {
      total: metrics.totalSearches,
      avgLatencyMs: Math.round(average(metrics.searchLatencies)),
      p95LatencyMs: Math.round(percentile(metrics.searchLatencies, 95)),
      p99LatencyMs: Math.round(percentile(metrics.searchLatencies, 99)),
    },
    retrieval: {
      avgConfidence: Math.round(average(metrics.retrievalConfidences) * 1000) / 1000,
      totalConfidenceSamples: metrics.retrievalConfidences.length,
    },
    cache: {
      hitRate: Math.round(cacheRate * 1000) / 1000,
      hits: metrics.cacheHits,
      misses: metrics.cacheMisses,
    },
    operations: {
      failedEmbeddings: metrics.failedEmbeddings,
      reindexOperations: metrics.reindexOperations,
    },
  };
}

export function resetRAGMonitorStats() {
  metrics.embeddingLatencies = [];
  metrics.searchLatencies = [];
  metrics.retrievalConfidences = [];
  metrics.totalEmbeddings = 0;
  metrics.totalSearches = 0;
  metrics.cacheHits = 0;
  metrics.cacheMisses = 0;
  metrics.failedEmbeddings = 0;
  metrics.reindexOperations = 0;
  logger.info('RAG_MONITOR_STATS_RESET');
}
