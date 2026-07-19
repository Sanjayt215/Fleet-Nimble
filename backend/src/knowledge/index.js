import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config/index.js';
import logger from '../utils/logger.js';
import { JsonKnowledgeProvider } from './providers/jsonProvider.js';
import { MarkdownKnowledgeProvider } from './providers/markdownProvider.js';
import { DatabaseKnowledgeProvider } from './providers/databaseProvider.js';
import { SynchronizedContentProvider } from './providers/synchronizedContentProvider.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const KNOWLEDGE_BASE_PATH = process.env.FLEETNIMBLE_KNOWLEDGE_PATH || join(__dirname, 'content', 'fleetnimble-knowledge.json');
const MARKDOWN_CONTENT_DIR = process.env.FLEETNIMBLE_MD_KNOWLEDGE_DIR || null;
const KNOWLEDGE_PROVIDER_ORDER = config.knowledge.providerOrder;

const UNKNOWN_ANSWER = "I don't have verified information about that. Let me connect you with a FleetNimble specialist who can help. Would you like me to schedule a follow-up or create a support ticket?";
const SALES_UNKNOWN_ANSWER = "I don't have specific information about that feature yet. However, I can schedule a personalized demo with our product team who can show you exactly how FleetNimble handles that. Would you like to book a demo?";
const SUPPORT_UNKNOWN_ANSWER = "I don't have troubleshooting information for that specific issue. Let me create a support ticket so our technical team can investigate. Could you tell me your name and the best way to reach you?";

const RESULT_LIMIT = 5;
const MINIMUM_SCORE = 3;
const MINIMUM_SCORE_STRICT = 8;

class FleetNimbleKnowledgeEngine {
  constructor() {
    this.providers = [];
    this.initialized = false;
    this._articleCache = new Map();
    this._categoryCache = new Map();
  }

  async initialize() {
    if (this.initialized) return true;

    const providerMap = {
      json: () => new JsonKnowledgeProvider(),
      markdown: () => new MarkdownKnowledgeProvider(MARKDOWN_CONTENT_DIR),
      synchronized: () => new SynchronizedContentProvider(),
      database: () => new DatabaseKnowledgeProvider(),
    };

    for (const name of KNOWLEDGE_PROVIDER_ORDER) {
      const factory = providerMap[name];
      if (!factory) {
        logger.warn('KNOWLEDGE_UNKNOWN_PROVIDER', { name });
        continue;
      }
      try {
        const provider = factory();
        await provider.initialize();
        this.providers.push(provider);
        logger.info('KNOWLEDGE_PROVIDER_REGISTERED', { name: provider.name, type: provider.type });
      } catch (err) {
        logger.error('KNOWLEDGE_PROVIDER_INIT_FAILED', { name, error: err.message });
      }
    }

    if (this.providers.length === 0) {
      const jsonProvider = new JsonKnowledgeProvider();
      await jsonProvider.initialize();
      this.providers.push(jsonProvider);
      logger.warn('KNOWLEDGE_FALLBACK_TO_JSON', { reason: 'no_providers_initialized' });
    }

    await this._buildCache();
    this.initialized = true;
    logger.info('KNOWLEDGE_ENGINE_INITIALIZED', { providers: this.providers.map(p => p.name) });
    return true;
  }

  async _buildCache() {
    this._articleCache.clear();
    this._categoryCache.clear();

    for (const provider of this.providers) {
      try {
        if (typeof provider.getAllArticles === 'function') {
          const articles = await provider.getAllArticles();
          for (const article of articles) {
            this._articleCache.set(article.id, { article, provider: provider.name });
            const cat = article.category?.toLowerCase();
            if (cat) {
              if (!this._categoryCache.has(cat)) {
                this._categoryCache.set(cat, []);
              }
              this._categoryCache.get(cat).push({ article, provider: provider.name });
            }
          }
        }
      } catch (err) {
        logger.warn('KNOWLEDGE_CACHE_BUILD_SKIPPED', { provider: provider.name, error: err.message });
      }
    }

    logger.info('KNOWLEDGE_CACHE_BUILT', {
      articles: this._articleCache.size,
      categories: this._categoryCache.size,
    });
  }

  async search(query, options = {}) {
    if (!this.initialized) await this.initialize();

    const allResults = [];

    for (const provider of this.providers) {
      try {
        if (typeof provider.search === 'function') {
          const providerOptions = { ...options };
          if (provider.type === 'database' && options.userId) {
            providerOptions.userId = options.userId;
          }
          const results = await provider.search(query, providerOptions);
          allResults.push(...results);
        }
      } catch (err) {
        logger.warn('KNOWLEDGE_PROVIDER_SEARCH_FAILED', { provider: provider.name, error: err.message });
      }
    }

    const ranked = this.rankResults(allResults, query, options);

    if (options.strict && ranked.length > 0 && ranked[0].score < MINIMUM_SCORE_STRICT) {
      return [];
    }

    return ranked.slice(0, options.limit || RESULT_LIMIT);
  }

  async getArticle(id) {
    if (!this.initialized) await this.initialize();

    const cached = this._articleCache.get(id);
    if (cached) return cached.article;

    for (const provider of this.providers) {
      try {
        const article = await provider.getArticle(id);
        if (article) return article;
      } catch (err) {
        logger.warn('KNOWLEDGE_GET_ARTICLE_FAILED', { id, provider: provider.name, error: err.message });
      }
    }

    return null;
  }

  async getCategory(category, options = {}) {
    if (!this.initialized) await this.initialize();

    const catLower = category.toLowerCase();
    const cached = this._categoryCache.get(catLower);
    if (cached) {
      let articles = cached.map(c => c.article);
      if (options.mode) {
        articles = articles.filter(a => a.mode === 'both' || a.mode === options.mode);
      }
      return articles;
    }

    const allArticles = [];
    for (const provider of this.providers) {
      try {
        const providerOptions = {};
        if (provider.type === 'database' && options.userId) {
          providerOptions.userId = options.userId;
        }
        const articles = await provider.getCategory(category, providerOptions);
        allArticles.push(...articles);
      } catch (err) {
        logger.warn('KNOWLEDGE_GET_CATEGORY_FAILED', { category, provider: provider.name, error: err.message });
      }
    }

    return allArticles;
  }

  async listTopics() {
    if (!this.initialized) await this.initialize();

    const allTopics = [];
    const seen = new Set();

    for (const provider of this.providers) {
      try {
        const topics = await provider.listTopics();
        for (const topic of topics) {
          if (!seen.has(topic.id)) {
            seen.add(topic.id);
            allTopics.push(topic);
          }
        }
      } catch (err) {
        logger.warn('KNOWLEDGE_LIST_TOPICS_FAILED', { provider: provider.name, error: err.message });
      }
    }

    return allTopics;
  }

  async searchByKeywords(keywords, options = {}) {
    if (!this.initialized) await this.initialize();

    const allResults = [];

    for (const provider of this.providers) {
      try {
        const providerOptions = {};
        if (provider.type === 'database' && options.userId) {
          providerOptions.userId = options.userId;
        }
        const results = await provider.searchByKeywords(keywords, providerOptions);
        allResults.push(...results);
      } catch (err) {
        logger.warn('KNOWLEDGE_KEYWORD_SEARCH_FAILED', { provider: provider.name, error: err.message });
      }
    }

    return this.rankResults(allResults, keywords.join(' '), options).slice(0, options.limit || RESULT_LIMIT);
  }

  rankResults(results, query, options = {}) {
    if (results.length === 0) return [];

    const lowerQuery = query.toLowerCase();
    const queryWords = lowerQuery.split(/\s+/).filter(w => w.length > 1);

    const scored = results.map(r => {
      let finalScore = r.score;

      if (r.article.answer && queryWords.some(qw => r.article.answer.toLowerCase().includes(qw))) {
        finalScore += 1;
      }

      if (r.article.priority) {
        finalScore += r.article.priority * 0.2;
      }

      const mode = options.mode ? options.mode.toLowerCase() : null;
      if (mode && (r.article.mode === mode || r.article.mode === 'both')) {
        finalScore += 3;
      }

      return { ...r, score: Math.round(finalScore * 100) / 100 };
    });

    return scored.filter(r => r.score >= (options.minScore || MINIMUM_SCORE));
  }

  getAnswer(results, mode = 'both') {
    if (!results || results.length === 0) {
      return this._getUnknownAnswer(mode);
    }

    const best = results[0];
    if (!best.article.answer) {
      return results.length > 1 && results[1].article.answer
        ? results[1].article.answer
        : this._getUnknownAnswer(mode);
    }

    return best.article.answer;
  }

  getFormattedAnswer(results, mode = 'both', includeRelated = true) {
    if (!results || results.length === 0) {
      return { answer: this._getUnknownAnswer(mode), relatedArticles: [] };
    }

    const best = results[0];
    let answer = best.article.answer || this._getUnknownAnswer(mode);

    const relatedArticles = [];
    if (includeRelated && best.article.relatedArticles) {
      for (const relatedId of best.article.relatedArticles) {
        const cached = this._articleCache.get(relatedId);
        if (cached && cached.article) {
          relatedArticles.push({
            id: cached.article.id,
            title: cached.article.title,
            category: cached.article.category,
            proactiveSalesTip: cached.article.proactiveSalesTip,
          });
        }
      }
    }

    return { answer, relatedArticles };
  }

  getProactiveSalesSuggestion(results) {
    if (!results || results.length === 0) return null;
    const best = results[0];
    if (best.article.proactiveSalesTip) {
      return best.article.proactiveSalesTip;
    }
    if (best.article.relatedArticles && best.article.relatedArticles.length > 0) {
      const firstRelated = this._articleCache.get(best.article.relatedArticles[0]);
      if (firstRelated?.article?.proactiveSalesTip) {
        return firstRelated.article.proactiveSalesTip;
      }
    }
    return null;
  }

  _getUnknownAnswer(mode) {
    if (mode === 'sales') return SALES_UNKNOWN_ANSWER;
    if (mode === 'support') return SUPPORT_UNKNOWN_ANSWER;
    return UNKNOWN_ANSWER;
  }

  async ragSearch(query, options = {}) {
    try {
      const rag = await import('./rag/index.js');
      const result = await rag.retrieveWithContext(query, {
        mode: options.mode || null,
        category: options.category || null,
        topK: options.topK || 5,
        maxResults: options.maxResults || 3,
      });
      return result;
    } catch (err) {
      logger.warn('KNOWLEDGE_RAG_SEARCH_FAILED', { error: err.message });
      return null;
    }
  }

  async searchWithRag(query, options = {}) {
    const engineResults = await this.search(query, options);

    try {
      const rag = await import('./rag/index.js');
      const ragResult = await rag.retrieve(query, {
        mode: options.mode || null,
        category: options.category || null,
        topK: options.topK || 10,
        maxResults: options.maxResults || 3,
      });

      return {
        engineResults,
        ragResult: ragResult.hasAnswer ? ragResult : null,
        combined: ragResult.hasAnswer ? ragResult.passages.map(p => ({
          article: p.citation,
          score: p.score,
          provider: 'rag',
          answer: p.chunkText,
        })) : [],
      };
    } catch (err) {
      logger.warn('KNOWLEDGE_RAG_INTEGRATION_FAILED', { error: err.message });
      return { engineResults, ragResult: null, combined: [] };
    }
  }

  formatAnswerForVoice(answer) {
    let cleaned = answer.replace(/\n{2,}/g, ' ').replace(/\n/g, ' ');
    cleaned = cleaned.replace(/\([^)]*\)/g, '').trim();
    if (cleaned.length > 500) {
      const lastPeriod = cleaned.lastIndexOf('.', 500);
      if (lastPeriod > 100) {
        cleaned = cleaned.substring(0, lastPeriod + 1);
      }
    }
    return cleaned;
  }

  async invalidateArticle(articleId) {
    this._articleCache.delete(articleId);
    for (const [cat, articles] of this._categoryCache) {
      const filtered = articles.filter(a => a.article.id !== articleId);
      if (filtered.length === 0) {
        this._categoryCache.delete(cat);
      } else {
        this._categoryCache.set(cat, filtered);
      }
    }
    const syncProvider = this.providers.find(p => p.name === 'synchronized');
    if (syncProvider && typeof syncProvider.refresh === 'function') {
      await syncProvider.refresh();
    }
    logger.debug('KNOWLEDGE_ARTICLE_CACHE_INVALIDATED', { articleId });
  }

  async invalidateCategory(category) {
    const catLower = category.toLowerCase();
    this._categoryCache.delete(catLower);
    this._articleCache.forEach((value, key) => {
      if (value.article.category?.toLowerCase() === catLower) {
        this._articleCache.delete(key);
      }
    });
    logger.debug('KNOWLEDGE_CATEGORY_CACHE_INVALIDATED', { category });
  }

  async refreshProvider(providerName) {
    const provider = this.providers.find(p => p.name === providerName);
    if (!provider) {
      logger.warn('KNOWLEDGE_REFRESH_PROVIDER_NOT_FOUND', { providerName });
      return false;
    }
    if (typeof provider.refresh === 'function') {
      await provider.refresh();
    } else if (typeof provider.initialize === 'function') {
      await provider.initialize();
    }
    await this._buildCache();
    logger.info('KNOWLEDGE_PROVIDER_REFRESHED', { providerName });
    return true;
  }

  async refreshAllKnowledge() {
    for (const provider of this.providers) {
      if (typeof provider.refresh === 'function') {
        try { await provider.refresh(); } catch (err) {
          logger.warn('KNOWLEDGE_REFRESH_FAILED', { provider: provider.name, error: err.message });
        }
      } else if (typeof provider.initialize === 'function') {
        try { await provider.initialize(); } catch (err) {
          logger.warn('KNOWLEDGE_REINIT_FAILED', { provider: provider.name, error: err.message });
        }
      }
    }
    await this._buildCache();
    logger.info('KNOWLEDGE_ALL_REFRESHED', { providers: this.providers.map(p => p.name) });
    return true;
  }
}

const engine = new FleetNimbleKnowledgeEngine();

export async function getKnowledgeEngine() {
  if (!engine.initialized) {
    await engine.initialize();
  }
  return engine;
}

export default engine;
