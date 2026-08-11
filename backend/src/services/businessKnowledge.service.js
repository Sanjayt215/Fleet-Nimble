import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import { getBusinessProfile } from './businessProfile.service.js';

const CHUNK_SIZE = 600;
const CHUNK_OVERLAP = 60;
const MAX_ANSWER_CHARS = 1200;

/**
 * Business knowledge intelligence — tenant-scoped knowledge documents.
 * Retrieval pipeline (Phase 1): tenant documents (approved) first, then
 * global FleetNimble knowledge engine as fallback.
 */
export async function getDocuments({ userId, companyId, status, category, page = 1, limit = 20 }) {
  if (!userId) return { items: [], total: 0 };
  try {
    const where = buildTenantWhere(userId, companyId);
    if (status) where.status = status;
    if (category) where.category = category;

    const [items, total] = await Promise.all([
      prisma.businessKnowledgeDocument.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: { id: true, title: true, category: true, sourceType: true, sourceUrl: true, status: true, summary: true, keywords: true, version: true, createdAt: true, updatedAt: true },
      }),
      prisma.businessKnowledgeDocument.count({ where }),
    ]);
    return { items, total };
  } catch (err) {
    logger.warn('BUSINESS_KNOWLEDGE_LIST_FAILED', { userId, error: err.message });
    return { items: [], total: 0 };
  }
}

export async function getDocumentById(userId, documentId, companyId) {
  if (!userId || !documentId) return null;
  try {
    const where = { id: documentId, ...buildTenantWhere(userId, companyId) };
    return await prisma.businessKnowledgeDocument.findFirst({ where, include: { chunks: { orderBy: { chunkIndex: 'asc' } } } });
  } catch (err) {
    logger.warn('BUSINESS_KNOWLEDGE_GET_FAILED', { userId, documentId, error: err.message });
    return null;
  }
}

export async function createDocument({ userId, companyId, data }) {
  if (!userId) return { error: 'missing_user' };
  if (!data?.title || !data?.content) return { error: 'missing_title_or_content' };
  try {
    const { content, title, category, sourceType, sourceUrl, keywords, summary, status } = data;

    const document = await prisma.$transaction(async (tx) => {
      const doc = await tx.businessKnowledgeDocument.create({
        data: {
          userId,
          companyId: companyId || null,
          title,
          content,
          category: category || 'General',
          sourceType: sourceType || 'manual',
          sourceUrl: sourceUrl || null,
          keywords: Array.isArray(keywords) ? keywords : [],
          summary: summary || buildAutoSummary(content),
          status: status || 'DRAFT',
          metadata: data.metadata || {},
        },
      });

      const chunks = chunkContent(content, { title });
      await tx.businessKnowledgeChunk.createMany({
        data: chunks.map((chunk, i) => ({
          documentId: doc.id,
          chunkIndex: i,
          content: chunk.text,
          keywords: chunk.keywords,
          metadata: { title: doc.title, category: doc.category },
        })),
      });
      return { doc, chunkCount: chunks.length };
    });

    logger.info('BUSINESS_KNOWLEDGE_DOCUMENT_CREATED', { userId, companyId, documentId: document.doc.id, chunks: document.chunkCount });
    return { document: document.doc, chunkCount: document.chunkCount };
  } catch (err) {
    logger.error('BUSINESS_KNOWLEDGE_CREATE_FAILED', { userId, companyId, error: err.message });
    return { error: err.message };
  }
}

export async function updateDocument({ userId, companyId, documentId, data }) {
  if (!userId || !documentId) return { error: 'missing_user_or_document' };
  try {
    const where = { id: documentId, ...buildTenantWhere(userId, companyId) };
    const existing = await prisma.businessKnowledgeDocument.findFirst({ where });
    if (!existing) return { error: 'not_found' };

    const updates = {};
    for (const key of ['title', 'category', 'sourceType', 'sourceUrl', 'status', 'summary', 'confidence', 'metadata']) {
      if (data[key] !== undefined) updates[key] = data[key];
    }
    if (data.content !== undefined && data.content !== existing.content) {
      updates.content = data.content;
      updates.summary = data.summary || buildAutoSummary(data.content);
    }
    if (data.keywords !== undefined) updates.keywords = Array.isArray(data.keywords) ? data.keywords : [];
    updates.version = { increment: 1 };

    const document = await prisma.$transaction(async (tx) => {
      const doc = await tx.businessKnowledgeDocument.update({ where: { id: existing.id }, data: updates });
      if (updates.content) {
        await tx.businessKnowledgeChunk.deleteMany({ where: { documentId: doc.id } });
        const chunks = chunkContent(doc.content, { title: doc.title });
        await tx.businessKnowledgeChunk.createMany({
          data: chunks.map((chunk, i) => ({
            documentId: doc.id,
            chunkIndex: i,
            content: chunk.text,
            keywords: chunk.keywords,
            metadata: { title: doc.title, category: doc.category },
          })),
        });
      }
      return doc;
    });

    return { document };
  } catch (err) {
    logger.error('BUSINESS_KNOWLEDGE_UPDATE_FAILED', { userId, documentId, error: err.message });
    return { error: err.message };
  }
}

export async function deleteDocument({ userId, companyId, documentId }) {
  if (!userId || !documentId) return { error: 'missing_user_or_document' };
  try {
    const where = { id: documentId, ...buildTenantWhere(userId, companyId) };
    const existing = await prisma.businessKnowledgeDocument.findFirst({ where });
    if (!existing) return { error: 'not_found' };
    await prisma.businessKnowledgeDocument.delete({ where: { id: existing.id } });
    return { success: true };
  } catch (err) {
    logger.error('BUSINESS_KNOWLEDGE_DELETE_FAILED', { userId, documentId, error: err.message });
    return { error: err.message };
  }
}

export async function approveDocument({ userId, companyId, documentId }) {
  return updateDocument({ userId, companyId, documentId, data: { status: 'APPROVED' } });
}

/**
 * Tenant-scoped semantic retrieval over approved documents.
 * Returns best-match content or null. Never raises — falls back to global engine by caller.
 */
export async function searchTenantKnowledge({ userId, companyId, query, limit = 3, category }) {
  if (!userId || !query) return null;
  try {
    const where = { status: 'APPROVED', ...buildTenantWhere(userId, companyId) };
    if (category) where.category = category;

    const documents = await prisma.businessKnowledgeDocument.findMany({ where, take: 50, select: { id: true, title: true, category: true, content: true, keywords: true, summary: true } });
    if (!documents || documents.length === 0) return null;

    const scored = documents
      .map((doc) => ({ doc, score: scoreDocument(doc, query) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    if (scored.length === 0) return null;

    const best = scored[0];
    const answer = buildAnswerFromDocs(scored.map((entry) => entry.doc));

    return {
      answer,
      results: scored.map((entry) => ({
        id: entry.doc.id,
        title: entry.doc.title,
        category: entry.doc.category,
        score: entry.score,
        snippet: entry.doc.summary || entry.doc.content.substring(0, 300),
      })),
      sources: scored.map((entry) => entry.doc.title),
      bestTitle: best.doc.title,
    };
  } catch (err) {
    logger.warn('BUSINESS_KNOWLEDGE_SEARCH_FAILED', { userId, companyId, error: err.message });
    return null;
  }
}

/**
 * Tenant QA pipeline (Phase 1/6): business profile → approved documents →
 * global FleetNimble engine fallback. Returns { answer, sources, fallback }.
 */
export async function answerFromTenantKnowledge({ userId, companyId, query, category, useProfile = true }) {
  const used = [];

  if (useProfile) {
    try {
      const profile = await getBusinessProfile({ userId, companyId });
      if (profile && profile.businessName) {
        const profileAnswer = answerFromProfile(profile, query);
        if (profileAnswer) {
          used.push('business_profile');
          return { answer: profileAnswer, sources: [profile.businessName], profile: true };
        }
      }
    } catch (err) {
      logger.warn('BUSINESS_PROFILE_QA_FAILED', { userId, error: err.message });
    }
  }

  const tenantResult = await searchTenantKnowledge({ userId, companyId, query, category });
  if (tenantResult) {
    used.push('tenant_documents');
    return { answer: tenantResult.answer, sources: tenantResult.sources, tenant: true, results: tenantResult.results };
  }

  return { answer: null, sources: used };
}

function buildTenantWhere(userId, companyId) {
  return companyId ? { companyId } : { userId };
}

function chunkContent(content, { title } = {}) {
  const cleaned = content.replace(/\r\n/g, '\n').trim();
  const paragraphs = cleaned.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  let current = '';
  let keywords = [];

  for (const paragraph of paragraphs) {
    if (paragraph.length > CHUNK_SIZE) {
      if (current) {
        chunks.push({ text: current.trim(), keywords });
        current = '';
      }
      for (let i = 0; i < paragraph.length; i += CHUNK_SIZE - CHUNK_OVERLAP) {
        chunks.push({ text: paragraph.slice(i, i + CHUNK_SIZE).trim(), keywords: extractKeywords(paragraph) });
      }
      continue;
    }
    if (current && current.length + paragraph.length > CHUNK_SIZE) {
      chunks.push({ text: current.trim(), keywords });
      current = paragraph;
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
    keywords = extractKeywords(paragraph);
  }
  if (current) chunks.push({ text: current.trim(), keywords });

  const lowerTitle = (title || '').toLowerCase();
  for (const chunk of chunks) {
    if (lowerTitle && !chunk.keywords.includes(lowerTitle.split(' ')[0])) {
      chunk.keywords.unshift(title);
    }
  }

  return chunks.length > 0 ? chunks : [{ text: cleaned || '', keywords: [] }];
}

function extractKeywords(text) {
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'for', 'with', 'our', 'your', 'this', 'that', 'is', 'are', 'was', 'to', 'of', 'in', 'on', 'at', 'by', 'as', 'it', 'we', 'you', 'how', 'what', 'does', 'can', 'need', 'help', 'about', 'fleet', 'nimble', 'fleetnimble', 'vehicles', 'vehicle']);
  const words = text.toLowerCase().replace(/[^a-z0-9\s'-]/g, ' ').split(/\s+/);
  const freq = {};
  for (const word of words) {
    if (word.length >= 4 && !stopWords.has(word)) freq[word] = (freq[word] || 0) + 1;
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word]) => word);
}

function scoreDocument(doc, query) {
  const q = query.toLowerCase();
  const qWords = q.split(/\s+/).filter((w) => w.length > 2);
  const title = doc.title.toLowerCase();
  const keywords = (doc.keywords || []).map((k) => k.toLowerCase());
  const content = doc.content.toLowerCase();

  let score = 0;
  for (const word of qWords) {
    if (title.includes(word)) score += 3;
    if (keywords.some((k) => k.includes(word) || word.includes(k))) score += 2;
    if (content.includes(word)) score += 1;
  }
  const fullPhrase = content.includes(q);
  if (fullPhrase) score += 4;

  if (doc.summary && doc.summary.toLowerCase().includes(q)) score += 2;
  return score;
}

function buildAnswerFromDocs(docs) {
  if (!docs || docs.length === 0) return '';
  let answer = docs[0].summary || docs[0].content;
  const extra = docs
    .slice(1, 3)
    .map((doc) => doc.summary || doc.content.substring(0, 400))
    .filter(Boolean);
  if (extra.length > 0) {
    answer = `${answer}\n\n${extra.join('\n\n')}`;
  }
  return answer.substring(0, MAX_ANSWER_CHARS);
}

function buildAutoSummary(content) {
  const cleaned = content.replace(/\r\n/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned.substring(0, 400);
}

function answerFromProfile(profile, query) {
  const q = query.toLowerCase();

  if (/(services|service|offer|provide|do you offer)/.test(q) && (profile.services || []).length > 0) {
    const services = profile.services.map((s) => (typeof s === 'string' ? s : s?.name)).filter(Boolean);
    return `Yes. ${profile.businessName} offers: ${services.join(', ')}.`;
  }
  if (/(product|productss|offer|provide|do you offer|sell)/.test(q) && (profile.products || []).length > 0) {
    const products = profile.products.map((p) => (typeof p === 'string' ? p : p?.name)).filter(Boolean);
    return `${profile.businessName} provides: ${products.join(', ')}.`;
  }
  if (/(price|pricing|cost|how much)/.test(q)) {
    const pricing = profile.pricing || {};
    const entries = Object.entries(pricing).filter(([, v]) => v);
    if (entries.length > 0) {
      return `Here is a summary of our pricing: ${entries.map(([k, v]) => `${k}: ${v}`).join(', ')}. For exact numbers, I can help you book a quick call with our team.`;
    }
  }
  if (/(hour|open|close|time|available when)/.test(q)) {
    const hours = profile.businessHours || {};
    const text = typeof hours === 'string' ? hours : Object.entries(hours).map(([k, v]) => `${k}: ${v}`).join(', ');
    if (text) return `Our business hours are: ${text}.`;
  }
  if (/(location|where are you|address|office)/.test(q) && (profile.locations || []).length > 0) {
    const locations = profile.locations.map((l) => (typeof l === 'string' ? l : [l?.city, l?.address].filter(Boolean).join(', '))).filter(Boolean);
    return `We are located at: ${locations.join('; ')}.`;
  }
  if (/(faq|question)/.test(q) && (profile.faqs || []).length > 0) {
    const faq = profile.faqs.find((f) => (typeof f === 'string' ? f : f?.question || f?.q || ''));
    if (faq) return typeof faq === 'string' ? faq : (faq.answer || faq.a || faq.question);
  }
  if (/(what is|who is|about|tell me about|describe)/.test(q) && profile.description) {
    return profile.description.substring(0, MAX_ANSWER_CHARS);
  }
  return null;
}
