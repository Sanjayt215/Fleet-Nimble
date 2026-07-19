import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requireAdmin } from '../../middleware/roles.js';
import { AppError } from '../../middleware/errorHandler.js';
import logger from '../../utils/logger.js';
import * as syncWorkflow from '../../knowledge/sync/syncWorkflow.service.js';
import { getKnowledgeEngine } from '../../knowledge/index.js';
import * as sourceRegistry from '../../knowledge/sync/sourceRegistry.js';

const router = Router();
router.use(authenticate, requireAdmin);

router.get('/sources', async (_req, res, next) => {
  try {
    const sources = await syncWorkflow.listSources();
    res.json({ success: true, data: sources });
  } catch (err) {
    next(err);
  }
});

router.get('/sources/:id', async (req, res, next) => {
  try {
    const source = await syncWorkflow.getSource(req.params.id);
    if (!source) throw new AppError('Source not found', 404, 'NOT_FOUND');
    res.json({ success: true, data: source });
  } catch (err) {
    next(err);
  }
});

router.post('/sources', async (req, res, next) => {
  try {
    const allowed = ['website', 'help-center', 'api-docs', 'local-markdown', 'github-wiki', 'rss-feed'];
    if (!allowed.includes(req.body.sourceType)) {
      throw new AppError(`Invalid source type. Must be one of: ${allowed.join(', ')}`, 400, 'VALIDATION_ERROR');
    }
    const source = await syncWorkflow.createSource({
      ...req.body,
      userId: req.userId,
    });
    logger.info('KNOWLEDGE_SOURCE_CREATED_VIA_API', { id: source.id, name: source.name, adminId: req.userId });
    res.status(201).json({ success: true, data: source });
  } catch (err) {
    next(err);
  }
});

router.patch('/sources/:id', async (req, res, next) => {
  try {
    const source = await syncWorkflow.updateSource(req.params.id, req.body);
    res.json({ success: true, data: source });
  } catch (err) {
    next(err);
  }
});

router.delete('/sources/:id', async (req, res, next) => {
  try {
    await syncWorkflow.deleteSource(req.params.id);
    res.json({ success: true, message: 'Source deleted' });
  } catch (err) {
    if (err.code === 'P2025') throw new AppError('Source not found', 404, 'NOT_FOUND');
    next(err);
  }
});

router.post('/sources/:id/sync', async (req, res, next) => {
  try {
    const result = await syncWorkflow.syncSource(req.params.id, { userId: req.userId });
    if (result.error) {
      throw new AppError(result.message || result.error, 409, result.error.toUpperCase());
    }
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.get('/staged', async (req, res, next) => {
  try {
    const { status, sourceId, conflictType, page, limit } = req.query;
    const result = await syncWorkflow.listStagedArticles({
      status, sourceId, conflictType,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

router.get('/staged/:id', async (req, res, next) => {
  try {
    const article = await syncWorkflow.getStagedArticle(req.params.id);
    if (!article) throw new AppError('Article not found', 404, 'NOT_FOUND');
    res.json({ success: true, data: article });
  } catch (err) {
    next(err);
  }
});

router.post('/staged/:id/approve', async (req, res, next) => {
  try {
    const result = await syncWorkflow.approveArticle(req.params.id, {
      actorId: req.userId,
      notes: req.body.notes,
    });
    if (result.error) throw new AppError(result.error, 400, result.error.toUpperCase());
    logger.info('KNOWLEDGE_ARTICLE_APPROVED_VIA_API', { articleId: req.params.id, adminId: req.userId });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.post('/staged/:id/reject', async (req, res, next) => {
  try {
    const result = await syncWorkflow.rejectArticle(req.params.id, {
      actorId: req.userId,
      reason: req.body.reason,
    });
    if (result.error) throw new AppError(result.error, 400, result.error.toUpperCase());
    logger.info('KNOWLEDGE_ARTICLE_REJECTED_VIA_API', { articleId: req.params.id, adminId: req.userId });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.post('/staged/:id/archive', async (req, res, next) => {
  try {
    const result = await syncWorkflow.archiveArticle(req.params.id, {
      actorId: req.userId,
      reason: req.body.reason,
    });
    if (result.error) throw new AppError(result.error, 400, result.error.toUpperCase());
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.post('/staged/:id/restore/:version', async (req, res, next) => {
  try {
    const result = await syncWorkflow.restoreArticleVersion(
      req.params.id,
      parseInt(req.params.version),
      { actorId: req.userId }
    );
    if (result.error) throw new AppError(result.error, 400, result.error.toUpperCase());
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.get('/runs', async (req, res, next) => {
  try {
    const { sourceId, status, page, limit } = req.query;
    const result = await syncWorkflow.listSyncRuns({
      sourceId, status,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

router.get('/runs/:id', async (req, res, next) => {
  try {
    const run = await syncWorkflow.getSyncRun(req.params.id);
    if (!run) throw new AppError('Sync run not found', 404, 'NOT_FOUND');
    res.json({ success: true, data: run });
  } catch (err) {
    next(err);
  }
});

router.post('/cache/refresh', async (req, res, next) => {
  try {
    const engine = await getKnowledgeEngine();
    if (req.body.provider) {
      await engine.refreshProvider(req.body.provider);
    } else {
      await engine.refreshAllKnowledge();
    }
    res.json({ success: true, message: 'Knowledge cache refreshed' });
  } catch (err) {
    next(err);
  }
});

router.get('/sources/defaults', async (_req, res) => {
  res.json({ success: true, data: sourceRegistry.DEFAULT_SOURCES });
});

export default router;
