import { readFile, readdir } from 'fs/promises';
import { join, extname } from 'path';
import logger from '../../utils/logger.js';

export class MarkdownKnowledgeProvider {
  constructor(contentDir = null) {
    this.name = 'markdown';
    this.type = 'markdown';
    this.contentDir = contentDir;
    this.articles = [];
  }

  async initialize() {
    if (!this.contentDir) {
      logger.warn('KNOWLEDGE_MD_NO_CONTENT_DIR');
      return false;
    }
    try {
      const files = await readdir(this.contentDir, { withFileTypes: true });
      const mdFiles = files.filter(f => f.isFile() && extname(f.name).toLowerCase() === '.md');

      for (const file of mdFiles) {
        const content = await readFile(join(this.contentDir, file.name), 'utf-8');
        const article = this._parseMarkdown(content, file.name);
        if (article) {
          this.articles.push(article);
        }
      }
      logger.info('KNOWLEDGE_MD_PROVIDER_INITIALIZED', { files: mdFiles.length, articles: this.articles.length });
      return true;
    } catch (err) {
      logger.error('KNOWLEDGE_MD_PROVIDER_INIT_FAILED', { error: err.message });
      return false;
    }
  }

  _parseMarkdown(content, filename) {
    const frontMatter = {};
    const bodyMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    let body = content;

    if (bodyMatch) {
      const fmLines = bodyMatch[1].split('\n');
      for (const line of fmLines) {
        const sep = line.indexOf(':');
        if (sep > 0) {
          const key = line.slice(0, sep).trim();
          const value = line.slice(sep + 1).trim().replace(/^['"]|['"]$/g, '');
          if (key === 'keywords' || key === 'synonyms') {
            frontMatter[key] = value.split(',').map(s => s.trim()).filter(Boolean);
          } else if (key === 'priority') {
            frontMatter[key] = parseInt(value, 10) || 5;
          } else {
            frontMatter[key] = value;
          }
        }
      }
      body = bodyMatch[2].trim();
    }

    const sections = body.split(/^##\s+/m);
    const title = frontMatter.title || filename.replace(/\.md$/i, '').replace(/[-_]/g, ' ');
    const answer = sections.find(s => s.toLowerCase().startsWith('answer'))?.replace(/^answer\s*\n/i, '').trim() || '';
    const details = sections.find(s => s.toLowerCase().startsWith('details'))?.replace(/^details\s*\n/i, '').trim() || '';
    const category = frontMatter.category || 'Uncategorized';
    const subcategory = frontMatter.subcategory || 'General';

    return {
      id: frontMatter.id || filename.replace(/\.md$/i, ''),
      title,
      category,
      subcategory,
      keywords: frontMatter.keywords || [title.toLowerCase()],
      synonyms: frontMatter.synonyms || [],
      mode: frontMatter.mode || 'both',
      priority: frontMatter.priority || 5,
      answer,
      details,
      relatedArticles: frontMatter.relatedArticles ? frontMatter.relatedArticles.split(',').map(s => s.trim()) : [],
      proactiveSalesTip: frontMatter.proactiveSalesTip || null,
    };
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

    score *= (article.priority || 5) / 5;
    return Math.round(score * 100) / 100;
  }
}
