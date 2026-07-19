import logger from '../../utils/logger.js';
import { config } from '../../config/index.js';
import { embedBatch, getEmbeddingProviderName, getEmbeddingModel } from './embedding.service.js';
import { chunkArticle, computeContentHash } from './chunking.service.js';
import { storeEmbeddingsBatch, deleteArticleEmbeddings, getEmbeddingStats } from './vectorStore.service.js';

let _indexingLock = false;
let _reindexQueue = [];

export async function indexArticle(article) {
  if (!article || !article.id) {
    logger.warn('RAG_INDEX_SKIP_INVALID_ARTICLE');
    return { indexed: false, reason: 'invalid article' };
  }

  if (article.status !== 'ACTIVE') {
    logger.debug('RAG_INDEX_SKIP_NON_ACTIVE', { articleId: article.id, status: article.status });
    return { indexed: false, reason: `status is ${article.status}` };
  }

  try {
    const chunks = chunkArticle(article);
    if (chunks.length === 0) {
      logger.debug('RAG_INDEX_EMPTY_CHUNKS', { articleId: article.id });
      return { indexed: false, reason: 'no chunks generated' };
    }

    const embeddings = await embedBatch(chunks);
    const entries = chunks.map((text, i) => ({
      articleId: article.id,
      chunkIndex: i,
      chunkText: text,
      embedding: embeddings[i],
      metadata: {
        embeddingModel: getEmbeddingModel(),
        embeddingVersion: 1,
        articleTitle: article.title,
        articleCategory: article.category,
        articleMode: article.mode,
        articlePriority: article.priority,
        articleSource: article.source,
      },
    }));

    await deleteArticleEmbeddings(article.id);
    await storeEmbeddingsBatch(entries);

    logger.info('RAG_ARTICLE_INDEXED', { articleId: article.id, chunks: chunks.length });
    return { indexed: true, chunks: chunks.length };
  } catch (err) {
    logger.error('RAG_INDEX_FAILED', { articleId: article.id, error: err.message });
    await recordFailedEmbedding(article.id, article.title, err.message);
    return { indexed: false, reason: err.message };
  }
}

async function recordFailedEmbedding(articleId, articleTitle, error) {
  try {
    const { default: prisma } = await import('../../utils/prisma.js');
    await prisma.failedEmbedding.create({
      data: { articleId, articleTitle, error, retryCount: 0 },
    });
  } catch (dbErr) {
    logger.error('RAG_FAILED_EMBEDDING_RECORD_FAILED', { error: dbErr.message });
  }
}

export async function indexAllApprovedArticles() {
  if (_indexingLock) {
    logger.warn('RAG_INDEXING_ALREADY_RUNNING');
    return { indexed: 0, skipped: 0, errors: 0, total: 0 };
  }

  _indexingLock = true;
  const startTime = Date.now();
  let indexed = 0, skipped = 0, errors = 0;

  try {
    const { default: prisma } = await import('../../utils/prisma.js');
    const articles = await prisma.knowledgeStagedArticle.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { updatedAt: 'asc' },
    });

    logger.info('RAG_INDEX_ALL_STARTED', { total: articles.length });
    const batchSize = config.rag.indexing.batchSize;

    for (let i = 0; i < articles.length; i += batchSize) {
      const batch = articles.slice(i, i + batchSize);
      const results = await Promise.allSettled(batch.map(a => indexArticle(a)));
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.indexed) indexed++;
        else if (r.status === 'fulfilled') skipped++;
        else { errors++; logger.error('RAG_INDEX_BATCH_ERROR', { error: r.reason?.message }); }
      }
      logger.info('RAG_INDEX_PROGRESS', { processed: Math.min(i + batchSize, articles.length), total: articles.length });
    }

    const duration = Date.now() - startTime;
    logger.info('RAG_INDEX_ALL_COMPLETED', { indexed, skipped, errors, duration });
    return { indexed, skipped, errors, total: articles.length, duration };
  } catch (err) {
    logger.error('RAG_INDEX_ALL_FAILED', { error: err.message });
    return { indexed, skipped, errors, total: 0, duration: Date.now() - startTime };
  } finally {
    _indexingLock = false;
  }
}

export async function deleteIndexedArticle(articleId) {
  try {
    await deleteArticleEmbeddings(articleId);
    logger.info('RAG_INDEX_DELETED', { articleId });
    return true;
  } catch (err) {
    logger.error('RAG_INDEX_DELETE_FAILED', { articleId, error: err.message });
    return false;
  }
}

export async function reindexArticle(articleId) {
  try {
    const { default: prisma } = await import('../../utils/prisma.js');
    const article = await prisma.knowledgeStagedArticle.findUnique({ where: { id: articleId } });
    if (!article) return { reindexed: false, reason: 'not found' };
    if (article.status !== 'ACTIVE') {
      await deleteArticleEmbeddings(articleId);
      return { reindexed: false, reason: `article ${article.status}, embeddings removed` };
    }
    return await indexArticle(article);
  } catch (err) {
    logger.error('RAG_REINDEX_FAILED', { articleId, error: err.message });
    return { reindexed: false, reason: err.message };
  }
}

export async function reindexStaleArticles() {
  const thresholdDays = config.rag.indexing.reindexThresholdDays;
  try {
    const { default: prisma } = await import('../../utils/prisma.js');
    const cutoff = new Date(Date.now() - thresholdDays * 86400000);
    const staleArticles = await prisma.knowledgeStagedArticle.findMany({
      where: {
        status: 'ACTIVE',
        updatedAt: { gte: cutoff },
      },
    });
    let reindexed = 0;
    for (const article of staleArticles) {
      const result = await reindexArticle(article.id);
      if (result.reindexed) reindexed++;
    }
    logger.info('RAG_REINDEX_STALE_COMPLETED', { reindexed, total: staleArticles.length });
    return { reindexed, total: staleArticles.length };
  } catch (err) {
    logger.error('RAG_REINDEX_STALE_FAILED', { error: err.message });
    return { reindexed: 0, total: 0 };
  }
}

export async function queueReindex(articleId) {
  if (!_reindexQueue.includes(articleId)) {
    _reindexQueue.push(articleId);
    logger.debug('RAG_REINDEX_QUEUED', { articleId });
  }
}

export async function processReindexQueue() {
  const queue = [..._reindexQueue];
  _reindexQueue = [];
  let processed = 0;
  for (const articleId of queue) {
    const result = await reindexArticle(articleId);
    if (result.reindexed) processed++;
  }
  return { processed, total: queue.length };
}

export async function retryFailedEmbeddings() {
  try {
    const { default: prisma } = await import('../../utils/prisma.js');
    const failed = await prisma.failedEmbedding.findMany({
      where: { retryCount: { lt: 3 } },
      take: 50,
    });
    let retried = 0, cleared = 0;
    for (const f of failed) {
      try {
        if (f.articleId) {
          const result = await reindexArticle(f.articleId);
          if (result.reindexed) retried++;
        }
        await prisma.failedEmbedding.delete({ where: { id: f.id } });
        cleared++;
      } catch {
        await prisma.failedEmbedding.update({
          where: { id: f.id },
          data: { retryCount: { increment: 1 }, lastAttemptAt: new Date() },
        });
      }
    }
    logger.info('RAG_RETRY_FAILED_EMBEDDINGS', { retried, cleared, total: failed.length });
    return { retried, cleared, total: failed.length };
  } catch (err) {
    logger.error('RAG_RETRY_FAILED_ERROR', { error: err.message });
    return { retried: 0, cleared: 0, total: 0 };
  }
}

export async function getRAGStats() {
  try {
    const { default: prisma } = await import('../../utils/prisma.js');
    const embeddingStats = await getEmbeddingStats();
    const failedCount = await prisma.failedEmbedding.count();
    const retryCount = await prisma.failedEmbedding.count({ where: { retryCount: { gte: 3 } } });
    const [metrics24h] = await Promise.all([
      prisma.retrievalMetric.count({ where: { createdAt: { gte: new Date(Date.now() - 86400000) } } }),
    ]);
    return {
      ...embeddingStats,
      failedEmbeddings: failedCount,
      exhaustedRetries: retryCount,
      metrics24h,
      isIndexing: _indexingLock,
      reindexQueueSize: _reindexQueue.length,
    };
  } catch (err) {
    logger.warn('RAG_STATS_FAILED', { error: err.message });
    return null;
  }
}
