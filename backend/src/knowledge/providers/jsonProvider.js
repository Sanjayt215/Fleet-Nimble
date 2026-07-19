import logger from '../../utils/logger.js';

export class JsonKnowledgeProvider {
  constructor(articles = []) {
    this.name = 'json';
    this.type = 'json';
    this.articles = articles;
    logger.info('KNOWLEDGE_JSON_PROVIDER_INITIALIZED', { articles: this.articles.length });
  }

  async initialize() {
    return true;
  }

  async search(query, options = {}) {
    const results = [];
    for (const article of this.articles) {
      const score = this._matchScore(query, article, options);
      if (score > 0) {
        results.push({ article, score, provider: this.name });
      }
    }
    return results.sort((a, b) => b.score - a.score);
  }

  async getArticle(id) {
    return this.articles.find(a => a.id === id) || null;
  }

  async getCategory(category) {
    return this.articles.filter(a =>
      a.category.toLowerCase() === category.toLowerCase()
    );
  }

  async listTopics() {
    return this.articles.map(a => ({
      id: a.id,
      title: a.title,
      category: a.category,
      subcategory: a.subcategory,
    }));
  }

  async searchByKeywords(keywords) {
    const results = [];
    const lowerKeywords = keywords.map(k => k.toLowerCase());
    for (const article of this.articles) {
      let score = 0;
      for (const kw of lowerKeywords) {
        if (article.keywords.some(ak => ak.toLowerCase().includes(kw) || kw.includes(ak.toLowerCase()))) {
          score += 10;
        }
        if (article.synonyms.some(s => s.toLowerCase() === kw)) {
          score += 5;
        }
        if (article.answer.toLowerCase().includes(kw)) {
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
    return this.articles;
  }

  _matchScore(query, article, options) {
    const lowerQuery = query.toLowerCase().trim();
    if (!lowerQuery) return 0;

    const queryWords = lowerQuery.split(/\s+/).filter(w => w.length > 1);
    if (queryWords.length === 0) return 0;

    let score = 0;
    const category = options.category ? options.category.toLowerCase() : null;

    if (category && article.category.toLowerCase() !== category) {
      return 0;
    }

    const mode = options.mode ? options.mode.toLowerCase() : null;
    if (mode && article.mode !== 'both' && article.mode !== mode) {
      return 0;
    }

    for (const keyword of article.keywords) {
      const lowerKeyword = keyword.toLowerCase();
      if (lowerKeyword === lowerQuery) {
        score += 20;
      } else if (lowerQuery.includes(lowerKeyword) || lowerKeyword.includes(lowerQuery)) {
        score += 10;
      } else {
        const keywordWords = lowerKeyword.split(/\s+/);
        if (keywordWords.length > 1) {
          const matchedWords = keywordWords.filter(w => queryWords.includes(w));
          score += (matchedWords.length / keywordWords.length) * 8;
        }
      }
    }

    for (const synonym of article.synonyms) {
      if (synonym.toLowerCase() === lowerQuery) {
        score += 12;
      }
    }

    const queryWordMatches = queryWords.filter(qw =>
      article.keywords.some(k => k.toLowerCase().includes(qw))
    ).length;
    score += (queryWordMatches / queryWords.length) * 5;

    if (article.answer.toLowerCase().includes(lowerQuery)) {
      score += 3;
    }

    score *= (article.priority || 5) / 5;
    return Math.round(score * 100) / 100;
  }
}
