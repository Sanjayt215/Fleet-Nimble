import logger from '../../utils/logger.js';

export class SynchronizedContentProvider {
  constructor() {
    this.name = 'synchronized';
    this.type = 'synchronized';
    this._articles = [];
    this._initialized = false;
    this._articleMap = new Map();
    this._categoryMap = new Map();
  }

  async initialize() {
    try {
      await this._loadArticles();
      this._initialized = true;
      logger.info('KNOWLEDGE_SYNC_PROVIDER_INITIALIZED', { articles: this._articles.length });
      return true;
    } catch (err) {
      logger.error('KNOWLEDGE_SYNC_PROVIDER_INIT_FAILED', { error: err.message });
      return false;
    }
  }

  async _loadArticles() {
    try {
      const { default: prisma } = await import('../../utils/prisma.js');
      const articles = await prisma.knowledgeStagedArticle.findMany({
        where: { status: 'ACTIVE' },
        orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
      });

      this._articles = articles.map(a => ({
        id: a.id,
        title: a.title,
        category: a.category,
        subcategory: a.subcategory,
        keywords: a.keywords || [],
        synonyms: a.synonyms || [],
        mode: a.mode || 'both',
        priority: a.priority || 5,
        answer: a.answer || '',
        details: a.details || '',
        relatedArticles: a.relatedArticles || [],
        proactiveSalesTip: a.proactiveSalesTip || null,
        source: a.source || 'synchronized',
        sourceUrl: a.sourceUrl || null,
        sourceType: a.sourceType || 'web',
        contentHash: a.contentHash || null,
      }));

      this._buildMaps();
    } catch (err) {
      logger.warn('KNOWLEDGE_SYNC_PROVIDER_LOAD_FAILED', { error: err.message });
      this._articles = [];
      this._buildMaps();
    }
  }

  _buildMaps() {
    this._articleMap.clear();
    this._categoryMap.clear();
    for (const article of this._articles) {
      this._articleMap.set(article.id, article);
      const cat = article.category?.toLowerCase();
      if (cat) {
        if (!this._categoryMap.has(cat)) this._categoryMap.set(cat, []);
        this._categoryMap.get(cat).push(article);
      }
    }
  }

  async refresh() {
    this._articles = [];
    this._articleMap.clear();
    this._categoryMap.clear();
    await this._loadArticles();
    logger.info('KNOWLEDGE_SYNC_PROVIDER_REFRESHED', { articles: this._articles.length });
    return true;
  }

  async search(query, options = {}) {
    if (!this._initialized) await this.initialize();
    const results = [];
    for (const article of this._articles) {
      const score = this._matchScore(query, article, options);
      if (score > 0) {
        results.push({ article, score, provider: this.name });
      }
    }
    return results.sort((a, b) => b.score - a.score);
  }

  async getArticle(id) {
    if (!this._initialized) await this.initialize();
    return this._articleMap.get(id) || null;
  }

  async getCategory(category) {
    if (!this._initialized) await this.initialize();
    return this._categoryMap.get(category.toLowerCase()) || [];
  }

  async listTopics() {
    if (!this._initialized) await this.initialize();
    return this._articles.map(a => ({
      id: a.id,
      title: a.title,
      category: a.category,
      subcategory: a.subcategory,
    }));
  }

  async searchByKeywords(keywords) {
    if (!this._initialized) await this.initialize();
    const results = [];
    const lowerKeywords = keywords.map(k => k.toLowerCase());
    for (const article of this._articles) {
      let score = 0;
      for (const kw of lowerKeywords) {
        if (article.keywords.some(ak => ak.toLowerCase().includes(kw) || kw.includes(ak.toLowerCase()))) {
          score += 10;
        }
        if (article.synonyms.some(s => s.toLowerCase() === kw)) {
          score += 5;
        }
        if ((article.answer || '').toLowerCase().includes(kw)) {
          score += 2;
        }
      }
      if (score > 0) {
        results.push({ article, score, provider: this.name });
      }
    }
    return results.sort((a, b) => b.score - a.score);
  }

  async getAllArticles() {
    if (!this._initialized) await this.initialize();
    return this._articles;
  }

  _matchScore(query, article, options) {
    const lowerQuery = query.toLowerCase().trim();
    if (!lowerQuery) return 0;
    const queryWords = lowerQuery.split(/\s+/).filter(w => w.length > 1);
    if (queryWords.length === 0) return 0;

    let score = 0;
    const category = options.category ? options.category.toLowerCase() : null;
    if (category && article.category.toLowerCase() !== category) return 0;

    const mode = options.mode ? options.mode.toLowerCase() : null;
    if (mode && article.mode !== 'both' && article.mode !== mode) return 0;

    for (const keyword of article.keywords) {
      const lowerKeyword = keyword.toLowerCase();
      if (lowerKeyword === lowerQuery) score += 20;
      else if (lowerQuery.includes(lowerKeyword) || lowerKeyword.includes(lowerQuery)) score += 10;
      else {
        const keywordWords = lowerKeyword.split(/\s+/);
        if (keywordWords.length > 1) {
          const matchedWords = keywordWords.filter(w => queryWords.includes(w));
          score += (matchedWords.length / keywordWords.length) * 8;
        }
      }
    }

    for (const synonym of article.synonyms) {
      if (synonym.toLowerCase() === lowerQuery) score += 12;
    }

    const queryWordMatches = queryWords.filter(qw =>
      article.keywords.some(k => k.toLowerCase().includes(qw))
    ).length;
    score += (queryWordMatches / queryWords.length) * 5;

    if ((article.answer || '').toLowerCase().includes(lowerQuery)) score += 3;
    score *= (article.priority || 5) / 5;
    return Math.round(score * 100) / 100;
  }
}
