import { config } from '../../config/index.js';
import logger from '../../utils/logger.js';
import { embedText } from './embedding.service.js';
import { similaritySearch } from './vectorStore.service.js';

const SEMANTIC_WEIGHT = config.rag.search.semanticWeight;
const KEYWORD_WEIGHT = config.rag.search.keywordWeight;

export async function hybridSearch(query, options = {}) {
  const startTime = Date.now();
  const topK = options.topK || config.rag.search.topK;
  const minScore = options.minScore || config.rag.search.minScore;
  const mode = options.mode || null;
  const category = options.category || null;

  const semanticResults = await semanticSearch(query, { topK: topK * 2, minScore, mode, category });
  const keywordResults = await keywordSearch(query, { topK: topK * 2, mode, category });

  const merged = mergeResults(semanticResults, keywordResults, query);
  const ranked = rankResults(merged, query, options);

  const latency = Date.now() - startTime;
  logger.debug('RAG_HYBRID_SEARCH', { query: query.slice(0, 80), results: ranked.length, latency });

  return { results: ranked.slice(0, topK), latency, semanticCount: semanticResults.length, keywordCount: keywordResults.length };
}

async function semanticSearch(query, options = {}) {
  try {
    const embedding = await embedText(query);
    const results = await similaritySearch(embedding, options);
    return results.map(r => ({
      ...r,
      searchType: 'semantic',
      semanticScore: r.score,
      keywordScore: 0,
    }));
  } catch (err) {
    logger.warn('RAG_SEMANTIC_SEARCH_FAILED', { error: err.message });
    return [];
  }
}

async function keywordSearch(query, options = {}) {
  try {
    const { default: prisma } = await import('../../utils/prisma.js');
    const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    if (words.length === 0) return [];

    const where = { status: 'ACTIVE' };
    if (options.mode) {
      where.mode = { in: [options.mode, 'both'] };
    }
    if (options.category) {
      where.category = options.category;
    }

    const articles = await prisma.knowledgeStagedArticle.findMany({
      where,
      select: {
        id: true, title: true, category: true, mode: true, priority: true,
        source: true, sourceUrl: true, sourceType: true, version: true,
        updatedAt: true, answer: true, details: true, keywords: true, synonyms: true,
      },
    });

    const scored = [];
    for (const article of articles) {
      let score = 0;
      const text = `${article.title} ${article.answer} ${article.details || ''} ${(article.keywords || []).join(' ')} ${(article.synonyms || []).join(' ')}`.toLowerCase();

      for (const word of words) {
        if (text.includes(word)) {
          score += 1;
          if (article.title?.toLowerCase().includes(word)) score += 3;
          if ((article.keywords || []).some(k => k.toLowerCase().includes(word))) score += 2;
          if ((article.synonyms || []).some(s => s.toLowerCase() === word)) score += 1.5;
        }
      }

      if (score > 0) {
        const normalized = score / words.length;
        scored.push({
          id: article.id,
          articleId: article.id,
          chunkIndex: 0,
          chunkText: article.answer || '',
          score: normalized,
          searchType: 'keyword',
          semanticScore: 0,
          keywordScore: normalized,
          article: {
            id: article.id,
            title: article.title,
            category: article.category,
            mode: article.mode,
            priority: article.priority,
            source: article.source,
            sourceUrl: article.sourceUrl,
            sourceType: article.sourceType,
            version: article.version,
            updatedAt: article.updatedAt,
          },
        });
      }
    }

    scored.sort((a, b) => b.keywordScore - a.keywordScore);
    return scored.slice(0, options.topK || 20);
  } catch (err) {
    logger.warn('RAG_KEYWORD_SEARCH_FAILED', { error: err.message });
    return [];
  }
}

function mergeResults(semantic, keyword, query) {
  const seen = new Map();
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);

  for (const r of semantic) {
    seen.set(r.articleId, r);
  }

  for (const r of keyword) {
    if (seen.has(r.articleId)) {
      const existing = seen.get(r.articleId);
      existing.keywordScore = Math.max(existing.keywordScore, r.keywordScore);
      existing.searchType = 'hybrid';
    } else {
      seen.set(r.articleId, r);
    }
  }

  return Array.from(seen.values());
}

function rankResults(results, query, options = {}) {
  const freshnessWeight = options.freshnessWeight ?? config.rag.search.freshnessWeight;
  const categoryWeight = options.categoryWeight ?? config.rag.search.categoryWeight;
  const priorityWeight = options.priorityWeight ?? config.rag.search.priorityWeight;
  const now = Date.now();
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);

  for (const r of results) {
    let score = (r.semanticScore * SEMANTIC_WEIGHT) + (r.keywordScore * KEYWORD_WEIGHT);

    if (r.article?.priority) {
      score += (r.article.priority / 10) * priorityWeight;
    }

    if (r.article?.updatedAt) {
      const ageHours = (now - new Date(r.article.updatedAt).getTime()) / 3600000;
      const freshness = Math.max(0, 1 - ageHours / (30 * 24));
      score += freshness * freshnessWeight;
    }

    if (options.mode && r.article?.mode) {
      if (r.article.mode === options.mode || r.article.mode === 'both') {
        score += categoryWeight * 2;
      }
    }

    if (options.category && r.article?.category?.toLowerCase() === options.category.toLowerCase()) {
      score += categoryWeight * 3;
    }

    const titleWords = (r.article?.title || '').toLowerCase().split(/\s+/);
    const titleMatches = titleWords.filter(w => queryWords.includes(w)).length;
    if (titleMatches > 0) {
      score += (titleMatches / queryWords.length) * 0.5;
    }

    r.finalScore = Math.round(score * 1000) / 1000;
  }

  results.sort((a, b) => b.finalScore - a.finalScore);
  return results;
}
