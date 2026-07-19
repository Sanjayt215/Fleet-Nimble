import { createHash } from 'crypto';
import logger from '../../utils/logger.js';

export const DIFF_TYPES = {
  NEW: 'NEW',
  UPDATED: 'UPDATED',
  UNCHANGED: 'UNCHANGED',
  DUPLICATE: 'DUPLICATE',
  CONFLICT: 'CONFLICT',
  REMOVED: 'REMOVED',
  INVALID: 'INVALID',
  UNSAFE: 'UNSAFE',
};

function normalizeText(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function computeSimilarity(textA, textB) {
  const a = normalizeText(textA);
  const b = normalizeText(textB);
  if (!a && !b) return 1;
  if (!a || !b) return 0;

  const wordsA = new Set(a.split(' ').filter(w => w.length > 2));
  const wordsB = new Set(b.split(' ').filter(w => w.length > 2));

  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }

  const union = new Set([...wordsA, ...wordsB]).size;
  return intersection / union;
}

export function compareArticle(newArticle, existingArticle) {
  if (!newArticle) return null;

  if (!existingArticle) {
    return { type: DIFF_TYPES.NEW, changes: [], similarArticles: [] };
  }

  if (newArticle.contentHash === existingArticle.contentHash) {
    return { type: DIFF_TYPES.UNCHANGED, changes: [] };
  }

  const changes = [];
  const fields = ['title', 'answer', 'details', 'category', 'subcategory', 'mode', 'priority'];

  for (const field of fields) {
    const newVal = String(newArticle[field] || '');
    const oldVal = String(existingArticle[field] || '');

    if (newVal !== oldVal) {
      const similarity = computeSimilarity(newVal, oldVal);
      changes.push({
        field,
        type: newVal.length === 0 ? 'removed' : oldVal.length === 0 ? 'added' : 'modified',
        similarity,
        oldPreview: oldVal.substring(0, 100),
        newPreview: newVal.substring(0, 100),
      });
    }
  }

  if (JSON.stringify(newArticle.keywords || []) !== JSON.stringify(existingArticle.keywords || [])) {
    changes.push({ field: 'keywords', type: 'modified', similarity: 1 });
  }

  const answerSimilarity = computeSimilarity(newArticle.answer || '', existingArticle.answer || '');

  // Detect conflicts: significant changes to core content
  const hasConflicts = changes.some(c =>
    c.field === 'answer' && c.similarity < 0.5
  ) || changes.some(c =>
    c.field === 'pricing' || c.field === 'mode'
  );

  if (hasConflicts) {
    return {
      type: DIFF_TYPES.CONFLICT,
      changes,
      answerSimilarity,
      conflictReason: hasConflicts ? 'Significant content change detected in key fields' : null,
    };
  }

  if (changes.length > 0) {
    return {
      type: DIFF_TYPES.UPDATED,
      changes,
      answerSimilarity,
    };
  }

  return { type: DIFF_TYPES.UNCHANGED, changes: [] };
}

export function detectNearDuplicates(newArticle, existingArticles) {
  if (!newArticle || !existingArticles || existingArticles.length === 0) return [];

  const newNorm = normalizeText(newArticle.answer || '');

  const duplicates = [];

  for (const existing of existingArticles) {
    if (newArticle.contentHash === existing.contentHash) {
      duplicates.push({
        article: existing,
        similarity: 1,
        type: DIFF_TYPES.DUPLICATE,
        reason: 'exact_content_match',
      });
      continue;
    }

    const similarity = computeSimilarity(newNorm, normalizeText(existing.answer || ''));

    if (similarity > 0.85) {
      duplicates.push({
        article: existing,
        similarity,
        type: DIFF_TYPES.DUPLICATE,
        reason: 'near_duplicate',
      });
    } else if (similarity > 0.6) {
      duplicates.push({
        article: existing,
        similarity,
        type: DIFF_TYPES.UPDATED,
        reason: 'similar_content',
      });
    }
  }

  return duplicates.sort((a, b) => b.similarity - a.similarity);
}

export function detectDeletedPages(currentUrls, previousUrls) {
  if (!previousUrls || previousUrls.length === 0) return [];

  const currentSet = new Set(currentUrls.map(u => normalizeUrl(u)));
  return previousUrls
    .filter(u => !currentSet.has(normalizeUrl(u)))
    .map(u => ({ url: u, type: DIFF_TYPES.REMOVED }));
}

export function detectConflictingClaims(newArticle, curatedArticles) {
  if (!newArticle || !curatedArticles || curatedArticles.length === 0) return [];

  const conflicts = [];

  for (const curated of curatedArticles) {
    if (newArticle.category !== curated.category) continue;

    const answerSim = computeSimilarity(newArticle.answer || '', curated.answer || '');
    const detailsSim = computeSimilarity(newArticle.details || '', curated.details || '');

    if (answerSim > 0.3 && answerSim < 0.7) {
      conflicts.push({
        curatedArticleId: curated.id,
        curatedTitle: curated.title,
        similarity: answerSim,
        type: 'partial_overlap',
        note: 'Partially overlaps with curated content',
      });
    }

    if (newArticle.mode !== curated.mode) {
      conflicts.push({
        curatedArticleId: curated.id,
        curatedTitle: curated.title,
        type: 'mode_mismatch',
        note: `Mode differs: new="${newArticle.mode}" vs curated="${curated.mode}"`,
      });
    }
  }

  return conflicts;
}

function normalizeUrl(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    parsed.search = '';
    return parsed.href.replace(/\/+$/, '');
  } catch {
    return url.replace(/\/+$/, '');
  }
}
