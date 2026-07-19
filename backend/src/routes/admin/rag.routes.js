import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requireAdmin } from '../../middleware/roles.js';
import { AppError } from '../../middleware/errorHandler.js';
import { getKnowledgeEngine } from '../../knowledge/index.js';

const router = Router();
router.use(authenticate, requireAdmin);

router.get('/status', async (_req, res, next) => {
  try {
    const rag = await import('../../knowledge/rag/index.js');
    const stats = await rag.getRAGStats();
    const monitor = rag.getRAGMonitorStats();
    res.json({ success: true, data: { stats, monitor } });
  } catch (err) {
    next(err);
  }
});

router.get('/embedding-provider', async (_req, res, next) => {
  try {
    const rag = await import('../../knowledge/rag/index.js');
    const providerName = rag.getEmbeddingProviderName();
    const model = rag.getEmbeddingModel();
    const dimensions = rag.getEmbeddingDimensions();
    const pgvector = await rag.isPgvectorEnabled();
    res.json({ success: true, data: { provider: providerName, model, dimensions, pgvectorEnabled: pgvector } });
  } catch (err) {
    next(err);
  }
});

router.post('/embedding-provider/reset', async (_req, res, next) => {
  try {
    const rag = await import('../../knowledge/rag/index.js');
    rag.resetEmbeddingProvider();
    await rag.warmEmbeddingProvider();
    res.json({ success: true, message: 'Embedding provider reset and warmed' });
  } catch (err) {
    next(err);
  }
});

router.post('/index/all', async (_req, res, next) => {
  try {
    const rag = await import('../../knowledge/rag/index.js');
    const result = await rag.indexAllApprovedArticles();
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.post('/index/article/:id', async (req, res, next) => {
  try {
    const rag = await import('../../knowledge/rag/index.js');
    const { default: prisma } = await import('../../utils/prisma.js');
    const article = await prisma.knowledgeStagedArticle.findUnique({ where: { id: req.params.id } });
    if (!article) throw new AppError('Article not found', 404, 'NOT_FOUND');
    const result = await rag.indexArticle(article);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.delete('/index/article/:id', async (req, res, next) => {
  try {
    const rag = await import('../../knowledge/rag/index.js');
    const result = await rag.deleteIndexedArticle(req.params.id);
    res.json({ success: true, data: { deleted: result } });
  } catch (err) {
    next(err);
  }
});

router.post('/reindex/stale', async (_req, res, next) => {
  try {
    const rag = await import('../../knowledge/rag/index.js');
    const result = await rag.reindexStaleArticles();
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.post('/retry-failed', async (_req, res, next) => {
  try {
    const rag = await import('../../knowledge/rag/index.js');
    const result = await rag.retryFailedEmbeddings();
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.get('/failed-embeddings', async (req, res, next) => {
  try {
    const { default: prisma } = await import('../../utils/prisma.js');
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      prisma.failedEmbedding.findMany({ orderBy: { lastAttemptAt: 'desc' }, skip, take: limit }),
      prisma.failedEmbedding.count(),
    ]);
    res.json({ success: true, data: { items, total, page, totalPages: Math.ceil(total / limit) } });
  } catch (err) {
    next(err);
  }
});

router.post('/search/diagnose', async (req, res, next) => {
  try {
    const rag = await import('../../knowledge/rag/index.js');
    const { query, mode, category, topK } = req.body;
    if (!query || typeof query !== 'string') throw new AppError('Query string required', 400, 'VALIDATION_ERROR');
    const result = await rag.searchDiagnostics(query, { mode, category, topK });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.get('/search/metrics', async (req, res, next) => {
  try {
    const rag = await import('../../knowledge/rag/index.js');
    const hours = parseInt(req.query.hours) || 24;
    const limit = parseInt(req.query.limit) || 100;
    const metrics = await rag.getEvaluationMetrics({ hours, limit });
    res.json({ success: true, data: metrics });
  } catch (err) {
    next(err);
  }
});

router.get('/vectors/count', async (_req, res, next) => {
  try {
    const rag = await import('../../knowledge/rag/index.js');
    const count = await rag.getEmbeddingCount();
    res.json({ success: true, data: { vectorCount: count } });
  } catch (err) {
    next(err);
  }
});

router.get('/monitor', async (_req, res, next) => {
  try {
    const rag = await import('../../knowledge/rag/index.js');
    const stats = rag.getRAGMonitorStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    next(err);
  }
});

router.post('/monitor/reset', async (_req, res, next) => {
  try {
    const rag = await import('../../knowledge/rag/index.js');
    rag.resetRAGMonitorStats();
    res.json({ success: true, message: 'Monitor stats reset' });
  } catch (err) {
    next(err);
  }
});

export default router;
