import logger from '../../utils/logger.js';
import { crawlPage, startCrawl, resetCrawlerState } from './websiteCrawler.service.js';
import { extractPageContent } from './contentExtractor.service.js';
import { normalizeExtractedContent } from './contentNormalizer.service.js';
import { validateArticle, validateSourceUrl } from './contentValidator.service.js';
import { compareArticle, detectNearDuplicates, detectConflictingClaims, DIFF_TYPES } from './contentDiff.service.js';
import * as sourceRegistry from './sourceRegistry.js';
import { getKnowledgeEngine } from '../index.js';

const SYNC_LOCKS = new Map();

async function getPrisma() {
  const { default: prisma } = await import('../../utils/prisma.js');
  return prisma;
}

export async function createSource(data) {
  const prisma = await getPrisma();
  const source = await prisma.knowledgeSource.create({
    data: {
      userId: data.userId,
      name: data.name,
      sourceType: data.sourceType,
      baseUrl: data.baseUrl || null,
      localPath: data.localPath || null,
      enabled: data.enabled ?? true,
      allowedDomains: data.allowedDomains || [],
      allowedPaths: data.allowedPaths || [],
      blockedPaths: data.blockedPaths || [],
      crawlDepth: data.crawlDepth ?? 2,
      maxPages: data.maxPages ?? 50,
      rateLimitMs: data.rateLimitMs ?? 1000,
      requiresApproval: data.requiresApproval ?? true,
      defaultCategory: data.defaultCategory || 'Web',
      defaultMode: data.defaultMode || 'both',
      priority: data.priority ?? 5,
      owner: data.owner || null,
      schedule: data.schedule || null,
      metadata: data.metadata || null,
    },
  });
  sourceRegistry.addSource(source);
  logger.info('KNOWLEDGE_SOURCE_CREATED', { id: source.id, name: source.name });
  return source;
}

export async function updateSource(id, data) {
  const prisma = await getPrisma();
  const source = await prisma.knowledgeSource.update({ where: { id }, data });
  sourceRegistry.addSource(source);
  logger.info('KNOWLEDGE_SOURCE_UPDATED', { id });
  return source;
}

export async function deleteSource(id) {
  const prisma = await getPrisma();
  await prisma.knowledgeSource.delete({ where: { id } });
  sourceRegistry.removeSource(id);
  logger.info('KNOWLEDGE_SOURCE_DELETED', { id });
}

export async function listSources() {
  const prisma = await getPrisma();
  return prisma.knowledgeSource.findMany({ orderBy: { createdAt: 'desc' } });
}

export async function getSource(id) {
  const prisma = await getPrisma();
  return prisma.knowledgeSource.findUnique({ where: { id } });
}

export async function syncSource(sourceId, options = {}) {
  const lockKey = `sync_${sourceId}`;
  if (SYNC_LOCKS.get(lockKey)) {
    return { error: 'sync_already_running', message: 'A sync is already in progress for this source' };
  }

  const prisma = await getPrisma();
  const source = await prisma.knowledgeSource.findUnique({ where: { id: sourceId } });
  if (!source) return { error: 'source_not_found' };
  if (!source.enabled) return { error: 'source_disabled' };

  SYNC_LOCKS.set(lockKey, true);

  const syncRun = await prisma.knowledgeSyncRun.create({
    data: { sourceId, userId: options.userId || source.userId, status: 'RUNNING', startedAt: new Date() },
  });

  const startTime = Date.now();
  const stats = {
    pagesDiscovered: 0, pagesFetched: 0, pagesSkipped: 0, pagesFailed: 0,
    articlesNew: 0, articlesUpdated: 0, articlesUnchanged: 0,
    articlesConflicted: 0, articlesInvalid: 0, articlesUnsafe: 0,
  };

  try {
    const crawlResult = await startCrawl(source);
    if (crawlResult.error) throw new Error(crawlResult.error);

    const crawledPages = collectPages(crawlResult.result);
    stats.pagesDiscovered = crawledPages.length;

    const existingApproved = await prisma.knowledgeStagedArticle.findMany({
      where: { sourceId, status: { in: ['ACTIVE', 'APPROVED'] } },
    });

    const engine = await getKnowledgeEngine();
    const allEngineArticles = await engine.listTopics();

    for (const page of crawledPages) {
      if (page.skipped) {
        stats.pagesSkipped++;
        continue;
      }

      stats.pagesFetched++;

      const extracted = extractPageContent(page);
      if (extracted.error) {
        stats.pagesFailed++;
        continue;
      }

      const normalized = normalizeExtractedContent(extracted, source);
      if (!normalized) {
        stats.pagesFailed++;
        continue;
      }

      const validation = validateArticle(normalized, source);
      if (validation.errors && validation.errors.length > 0) {
        if (!validation.safe) {
          stats.articlesUnsafe++;
        } else {
          stats.articlesInvalid++;
        }
        await saveStagedArticle(prisma, sourceId, syncRun.id, normalized, {
          status: validation.safe ? 'FAILED' : 'FAILED',
          conflictType: validation.safe ? DIFF_TYPES.INVALID : DIFF_TYPES.UNSAFE,
          conflictNotes: (validation.errors || []).join('; '),
          reviewerNotes: (validation.warnings || []).join('; '),
        });
        continue;
      }

      const existing = existingApproved.find(e => e.contentHash === normalized.contentHash);
      const diff = compareArticle(normalized, existing);

      if (diff.type === DIFF_TYPES.UNCHANGED) {
        stats.articlesUnchanged++;
        continue;
      }

      const duplicates = detectNearDuplicates(normalized, existingApproved);
      const conflicts = detectConflictingClaims(normalized, allEngineArticles);

      if (diff.type === DIFF_TYPES.CONFLICT || conflicts.length > 0) {
        stats.articlesConflicted++;
        await saveStagedArticle(prisma, sourceId, syncRun.id, normalized, {
          status: 'NEEDS_REVIEW',
          conflictType: DIFF_TYPES.CONFLICT,
          conflictNotes: diff.conflictReason || conflicts.map(c => c.note).join('; '),
          diffSummary: JSON.stringify(diff.changes),
        });
        continue;
      }

      if (diff.type === DIFF_TYPES.UPDATED) {
        stats.articlesUpdated++;
      } else {
        stats.articlesNew++;
      }

      const articleStatus = source.requiresApproval ? 'NEEDS_REVIEW' : 'APPROVED';
      const staged = await saveStagedArticle(prisma, sourceId, syncRun.id, normalized, {
        status: articleStatus,
        conflictType: diff.type,
        diffSummary: JSON.stringify(diff.changes),
      });

      if (!source.requiresApproval) {
        await approveArticle(staged.id, { actorId: 'system', notes: 'Auto-approved (approval not required)' });
      }
    }

    const duration = Date.now() - startTime;
    await prisma.knowledgeSyncRun.update({
      where: { id: syncRun.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        durationMs: duration,
        ...stats,
      },
    });

    await prisma.knowledgeSource.update({
      where: { id: sourceId },
      data: { lastSyncedAt: new Date(), lastSyncStatus: 'SUCCESS' },
    });

    logger.info('KNOWLEDGE_SYNC_COMPLETED', { sourceId, duration, stats });

    return { success: true, syncRunId: syncRun.id, stats, duration };
  } catch (err) {
    const duration = Date.now() - startTime;
    await prisma.knowledgeSyncRun.update({
      where: { id: syncRun.id },
      data: { status: 'FAILED', completedAt: new Date(), durationMs: duration, errorMessage: err.message, ...stats },
    });

    await prisma.knowledgeSource.update({
      where: { id: sourceId },
      data: { lastSyncStatus: 'FAILED' },
    });

    logger.error('KNOWLEDGE_SYNC_FAILED', { sourceId, error: err.message, duration });
    return { error: 'sync_failed', message: err.message, syncRunId: syncRun.id };
  } finally {
    SYNC_LOCKS.delete(lockKey);
    resetCrawlerState();
  }
}

async function saveStagedArticle(prisma, sourceId, syncRunId, article, options = {}) {
  return prisma.knowledgeStagedArticle.create({
    data: {
      sourceId,
      syncRunId,
      status: options.status || 'DISCOVERED',
      title: article.title,
      category: article.category,
      subcategory: article.subcategory,
      keywords: article.keywords,
      synonyms: article.synonyms,
      mode: article.mode,
      priority: article.priority,
      answer: article.answer,
      details: article.details,
      relatedArticles: article.relatedArticles || [],
      proactiveSalesTip: article.proactiveSalesTip || null,
      source: article.source,
      sourceUrl: article.sourceUrl,
      sourceType: article.sourceType,
      contentHash: article.contentHash,
      version: 1,
      conflictType: options.conflictType || null,
      conflictNotes: options.conflictNotes || null,
      diffSummary: options.diffSummary || null,
      reviewerNotes: options.reviewerNotes || null,
    },
  });
}

export async function approveArticle(articleId, options = {}) {
  const prisma = await getPrisma();
  const article = await prisma.knowledgeStagedArticle.findUnique({ where: { id: articleId } });
  if (!article) return { error: 'article_not_found' };
  if (article.status === 'ACTIVE') return { error: 'already_active' };

  const previousStatus = article.status;

  // Save current version
  if (article.status === 'APPROVED' || article.status === 'ACTIVE') {
    await saveVersion(prisma, article);
  }

  await prisma.knowledgeApprovalEvent.create({
    data: {
      articleId,
      action: options.autoApprove ? 'AUTO_APPROVED' : 'APPROVED',
      actorId: options.actorId || null,
      notes: options.notes || null,
      previousStatus,
      newStatus: 'ACTIVE',
    },
  });

  const updated = await prisma.knowledgeStagedArticle.update({
    where: { id: articleId },
    data: {
      status: 'ACTIVE',
      approvedById: options.actorId || null,
      approvedAt: new Date(),
      version: { increment: 1 },
    },
  });

  // Invalidate cache
  try {
    const engine = await getKnowledgeEngine();
    if (typeof engine.invalidateArticle === 'function') {
      await engine.invalidateArticle(articleId);
    }
  } catch (err) {
    logger.warn('KNOWLEDGE_CACHE_INVALIDATE_FAILED', { articleId, error: err.message });
  }

  // Index in RAG vector store
  try {
    const rag = await import('../rag/index.js');
    const fullArticle = await prisma.knowledgeStagedArticle.findUnique({ where: { id: articleId } });
    if (fullArticle) {
      await rag.indexArticle(fullArticle);
    }
  } catch (err) {
    logger.warn('RAG_INDEX_ON_APPROVE_FAILED', { articleId, error: err.message });
  }

  logger.info('KNOWLEDGE_ARTICLE_APPROVED', { articleId, title: article.title });
  return updated;
}

export async function rejectArticle(articleId, options = {}) {
  const prisma = await getPrisma();
  const article = await prisma.knowledgeStagedArticle.findUnique({ where: { id: articleId } });
  if (!article) return { error: 'article_not_found' };

  await prisma.knowledgeApprovalEvent.create({
    data: {
      articleId,
      action: 'REJECTED',
      actorId: options.actorId || null,
      notes: options.reason || null,
      previousStatus: article.status,
      newStatus: 'REJECTED',
    },
  });

  const updated = await prisma.knowledgeStagedArticle.update({
    where: { id: articleId },
    data: {
      status: 'REJECTED',
      rejectedById: options.actorId || null,
      rejectedAt: new Date(),
      rejectionReason: options.reason || null,
    },
  });

  logger.info('KNOWLEDGE_ARTICLE_REJECTED', { articleId, title: article.title, reason: options.reason });
  return updated;
}

export async function archiveArticle(articleId, options = {}) {
  const prisma = await getPrisma();
  const article = await prisma.knowledgeStagedArticle.findUnique({ where: { id: articleId } });
  if (!article) return { error: 'article_not_found' };

  await prisma.knowledgeApprovalEvent.create({
    data: {
      articleId,
      action: 'ARCHIVED',
      actorId: options.actorId || null,
      notes: options.reason || null,
      previousStatus: article.status,
      newStatus: 'ARCHIVED',
    },
  });

  const updated = await prisma.knowledgeStagedArticle.update({
    where: { id: articleId },
    data: {
      status: 'ARCHIVED',
      archivedById: options.actorId || null,
      archivedAt: new Date(),
      archivedReason: options.reason || null,
    },
  });

  try {
    const engine = await getKnowledgeEngine();
    if (typeof engine.invalidateArticle === 'function') {
      await engine.invalidateArticle(articleId);
    }
  } catch (err) {
    logger.warn('KNOWLEDGE_CACHE_INVALIDATE_FAILED', { articleId, error: err.message });
  }

  // Remove from RAG vector store
  try {
    const rag = await import('../rag/index.js');
    await rag.deleteIndexedArticle(articleId);
  } catch (err) {
    logger.warn('RAG_DELETE_ON_ARCHIVE_FAILED', { articleId, error: err.message });
  }

  logger.info('KNOWLEDGE_ARTICLE_ARCHIVED', { articleId });
  return updated;
}

export async function restoreArticleVersion(articleId, version, options = {}) {
  const prisma = await getPrisma();
  const versionRecord = await prisma.knowledgeArticleVersion.findFirst({
    where: { articleId, version },
  });
  if (!versionRecord) return { error: 'version_not_found' };

  const article = await prisma.knowledgeStagedArticle.update({
    where: { id: articleId },
    data: {
      title: versionRecord.title,
      category: versionRecord.category,
      subcategory: versionRecord.subcategory,
      keywords: versionRecord.keywords,
      synonyms: versionRecord.synonyms,
      mode: versionRecord.mode,
      priority: versionRecord.priority,
      answer: versionRecord.answer,
      details: versionRecord.details,
      relatedArticles: versionRecord.relatedArticles,
      proactiveSalesTip: versionRecord.proactiveSalesTip,
      status: 'ACTIVE',
    },
  });

  await prisma.knowledgeApprovalEvent.create({
    data: {
      articleId,
      action: 'RESTORED',
      actorId: options.actorId || null,
      notes: `Restored to version ${version}`,
      previousStatus: article.status,
      newStatus: 'ACTIVE',
    },
  });

  try {
    const engine = await getKnowledgeEngine();
    if (typeof engine.invalidateArticle === 'function') {
      await engine.invalidateArticle(articleId);
    }
  } catch (err) {
    logger.warn('KNOWLEDGE_CACHE_INVALIDATE_FAILED', { articleId, error: err.message });
  }

  logger.info('KNOWLEDGE_ARTICLE_RESTORED', { articleId, version });
  return article;
}

async function saveVersion(prisma, article) {
  return prisma.knowledgeArticleVersion.create({
    data: {
      articleId: article.id,
      version: article.version,
      title: article.title,
      category: article.category,
      subcategory: article.subcategory,
      keywords: article.keywords,
      synonyms: article.synonyms,
      mode: article.mode,
      priority: article.priority,
      answer: article.answer,
      details: article.details,
      relatedArticles: article.relatedArticles,
      proactiveSalesTip: article.proactiveSalesTip,
      source: article.source,
      sourceUrl: article.sourceUrl,
      contentHash: article.contentHash,
    },
  });
}

export async function listStagedArticles(filters = {}) {
  const prisma = await getPrisma();
  const where = {};
  if (filters.status) where.status = filters.status;
  if (filters.sourceId) where.sourceId = filters.sourceId;
  if (filters.conflictType) where.conflictType = filters.conflictType;

  const page = filters.page || 1;
  const limit = Math.min(filters.limit || 50, 100);
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    prisma.knowledgeStagedArticle.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip,
      take: limit,
      include: {
        sourceRel: { select: { name: true, sourceType: true } },
        syncRun: { select: { startedAt: true, status: true } },
        approvalEvents: { orderBy: { createdAt: 'desc' }, take: 3 },
      },
    }),
    prisma.knowledgeStagedArticle.count({ where }),
  ]);

  return { items, total, page, totalPages: Math.ceil(total / limit) };
}

export async function getStagedArticle(id) {
  const prisma = await getPrisma();
  return prisma.knowledgeStagedArticle.findUnique({
    where: { id },
    include: {
      sourceRel: true,
      syncRun: true,
      versions: { orderBy: { version: 'desc' }, take: 10 },
      approvalEvents: { orderBy: { createdAt: 'desc' }, take: 20 },
    },
  });
}

export async function listSyncRuns(filters = {}) {
  const prisma = await getPrisma();
  const where = {};
  if (filters.sourceId) where.sourceId = filters.sourceId;
  if (filters.status) where.status = filters.status;

  const page = filters.page || 1;
  const limit = Math.min(filters.limit || 50, 100);
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    prisma.knowledgeSyncRun.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      skip,
      take: limit,
      include: { source: { select: { name: true, sourceType: true } } },
    }),
    prisma.knowledgeSyncRun.count({ where }),
  ]);

  return { items, total, page, totalPages: Math.ceil(total / limit) };
}

export async function getSyncRun(id) {
  const prisma = await getPrisma();
  return prisma.knowledgeSyncRun.findUnique({
    where: { id },
    include: { source: true },
  });
}

function collectPages(result) {
  if (!result) return [];
  const pages = [];
  if (!result.skipped) {
    pages.push(result);
  }
  if (result.subPages) {
    for (const sub of result.subPages) {
      pages.push(...collectPages(sub));
    }
  }
  return pages;
}
