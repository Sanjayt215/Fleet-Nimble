export { getEmbeddingProvider, embedText, embedBatch, getEmbeddingDimensions, getEmbeddingModel, getEmbeddingProviderName, resetEmbeddingProvider, warmEmbeddingProvider } from './embedding.service.js';
export { chunkArticle, chunkByHeadings, chunkByParagraphs, chunkHybrid } from './chunking.service.js';
export { initializeVectorStore, isPgvectorEnabled, storeEmbedding, storeEmbeddingsBatch, deleteArticleEmbeddings, similaritySearch, getEmbeddingCount, getEmbeddingStats } from './vectorStore.service.js';
export { hybridSearch } from './hybridSearch.service.js';
export { retrieve, retrieveWithContext, searchDiagnostics } from './retrievalEngine.service.js';
export { indexArticle, indexAllApprovedArticles, deleteIndexedArticle, reindexArticle, reindexStaleArticles, queueReindex, processReindexQueue, retryFailedEmbeddings, getRAGStats } from './ragPipeline.service.js';
export { evaluateRetrieval, storeEvaluationResults, getEvaluationMetrics } from './retrievalEvaluator.service.js';
export { recordEmbeddingLatency, recordSearchLatency, recordRetrievalConfidence, recordCacheHit, recordCacheMiss, recordFailedEmbedding, recordReindexOperation, getRAGMonitorStats, resetRAGMonitorStats } from './ragMonitor.service.js';
