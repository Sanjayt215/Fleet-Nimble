import { config } from '../../config/index.js';
import logger from '../../utils/logger.js';
import { hybridSearch } from './hybridSearch.service.js';

const MIN_CONFIDENCE = config.rag.retrieval.minConfidence;
const MAX_RESULTS = config.rag.retrieval.maxResults;
const MAX_CONTEXT_LENGTH = config.rag.retrieval.maxContextLength;
const UNKNOWN_RESPONSE = "I couldn't find verified information for that question.";

export async function retrieve(query, options = {}) {
  const startTime = Date.now();

  const searchOptions = {
    topK: options.topK || MAX_RESULTS * 3,
    minScore: options.minScore || 0.2,
    mode: options.mode || null,
    category: options.category || null,
  };

  const { results, latency, semanticCount, keywordCount } = await hybridSearch(query, searchOptions);

  const filtered = results.filter(r => r.finalScore >= MIN_CONFIDENCE);
  const topResults = filtered.slice(0, options.maxResults || MAX_RESULTS);

  const retrievalLatency = Date.now() - startTime;

  const passages = topResults.map(r => ({
    articleId: r.articleId,
    chunkText: r.chunkText,
    score: r.finalScore,
    searchType: r.searchType,
    citation: buildCitation(r.article),
  }));

  const confidence = topResults.length > 0
    ? topResults.reduce((sum, r) => sum + r.finalScore, 0) / topResults.length
    : 0;

  return {
    query,
    passages,
    confidence,
    totalResults: results.length,
    filteredResults: filtered.length,
    latency: retrievalLatency,
    searchLatency: latency,
    semanticCount,
    keywordCount,
    hasAnswer: topResults.length > 0 && confidence >= MIN_CONFIDENCE,
  };
}

export async function retrieveWithContext(query, options = {}) {
  const result = await retrieve(query, options);

  if (!result.hasAnswer) {
    return {
      ...result,
      context: null,
      answer: UNKNOWN_RESPONSE,
      grounded: false,
    };
  }

  let context = '';
  for (const p of result.passages) {
    context += `[Source: ${p.citation.title} | ${p.citation.source} v${p.citation.version}]\n${p.chunkText}\n\n`;
    if (context.length >= MAX_CONTEXT_LENGTH) break;
  }

  const answer = synthesizeAnswer(result.passages);

  return {
    ...result,
    context: context.trim(),
    answer,
    grounded: true,
  };
}

function buildCitation(article) {
  return {
    title: article.title || 'Unknown',
    source: article.source || 'web',
    sourceType: article.sourceType || 'website',
    sourceUrl: article.sourceUrl || null,
    category: article.category || 'General',
    version: article.version || 1,
    updatedAt: article.updatedAt || null,
  };
}

function synthesizeAnswer(passages) {
  if (passages.length === 0) return UNKNOWN_RESPONSE;

  const best = passages[0];
  if (best.chunkText && best.chunkText.length > 20) {
    return best.chunkText;
  }

  for (const p of passages) {
    if (p.chunkText && p.chunkText.length > 20) {
      return p.chunkText;
    }
  }

  return UNKNOWN_RESPONSE;
}

export async function searchDiagnostics(query, options = {}) {
  const startTime = Date.now();
  const result = await retrieve(query, { ...options, topK: 20, minScore: 0.0 });

  return {
    query,
    totalLatency: Date.now() - startTime,
    ...result,
    rawResults: result.passages.map(p => ({
      articleId: p.articleId,
      score: p.score,
      searchType: p.searchType,
      citation: p.citation,
      preview: p.chunkText?.slice(0, 200),
    })),
  };
}
