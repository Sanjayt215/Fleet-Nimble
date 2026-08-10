import logger from '../../utils/logger.js';
import { getEmbeddingDimensions } from './embedding.service.js';

let _usePgvector = false;

export async function initializeVectorStore() {
  try {
    const { default: prisma } = await import('../../utils/prisma.js');
    await prisma.$queryRawUnsafe('SELECT 1 FROM pg_extension WHERE extname = $1', 'vector');
    _usePgvector = true;
    logger.info('RAG_VECTOR_STORE_PGVECTOR_ENABLED');
  } catch {
    _usePgvector = false;
    logger.info('RAG_VECTOR_STORE_JSON_FALLBACK', { reason: 'pgvector extension not available' });
  }
}

export function isPgvectorEnabled() {
  return _usePgvector;
}

export async function storeEmbedding(articleId, chunkIndex, chunkText, embedding, metadata = {}) {
  const { default: prisma } = await import('../../utils/prisma.js');
  const { createHash, randomUUID } = await import('crypto');
  const contentHash = createHash('sha256').update(chunkText).digest('hex');

  if (_usePgvector && embedding) {
    const dims = embedding.length;
    const vectorStr = `[${embedding.join(',')}]`;
    await prisma.$executeRawUnsafe(
      `INSERT INTO vector_embeddings (id, article_id, chunk_index, chunk_text, embedding, embedding_model, embedding_version, content_hash, metadata)
       VALUES ($1, $2, $3, $4, $5::vector($6), $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET embedding = $5::vector($6), content_hash = $9, updated_at = NOW()`,
      randomUUID(), articleId, chunkIndex, chunkText, vectorStr, dims,
      metadata.embeddingModel || 'text-embedding-ada-002',
      metadata.embeddingVersion || 1,
      contentHash,
      JSON.stringify(metadata)
    );
  } else {
    // JSON fallback: persist the embedding inside the metadata Json column so
    // similaritySearch can still score it semantically without pgvector.
    const storedMetadata = embedding ? { ...metadata, _embedding: embedding } : metadata;
    await prisma.vectorEmbedding.upsert({
      where: { id: `${articleId}_${chunkIndex}` },
      create: {
        id: `${articleId}_${chunkIndex}`,
        articleId,
        chunkIndex,
        chunkText,
        embeddingModel: metadata.embeddingModel || 'text-embedding-ada-002',
        embeddingVersion: metadata.embeddingVersion || 1,
        contentHash,
        metadata: storedMetadata,
      },
      update: {
        chunkText,
        contentHash,
        metadata: storedMetadata,
        embeddingVersion: metadata.embeddingVersion || 1,
      },
    });
  }
}

export async function storeEmbeddingsBatch(entries) {
  for (const entry of entries) {
    await storeEmbedding(entry.articleId, entry.chunkIndex, entry.chunkText, entry.embedding, entry.metadata);
  }
}

export async function deleteArticleEmbeddings(articleId) {
  const { default: prisma } = await import('../../utils/prisma.js');
  if (_usePgvector) {
    await prisma.$executeRawUnsafe('DELETE FROM vector_embeddings WHERE article_id = $1', articleId);
  } else {
    await prisma.vectorEmbedding.deleteMany({ where: { articleId } });
  }
}

export async function deleteChunkEmbedding(id) {
  const { default: prisma } = await import('../../utils/prisma.js');
  if (_usePgvector) {
    await prisma.$executeRawUnsafe('DELETE FROM vector_embeddings WHERE id = $1', id);
  } else {
    await prisma.vectorEmbedding.delete({ where: { id } }).catch(() => {});
  }
}

export async function similaritySearch(queryEmbedding, options = {}) {
  const topK = options.topK || 10;
  const minScore = options.minScore || 0.3;
  const { default: prisma } = await import('../../utils/prisma.js');

  if (_usePgvector) {
    const dims = queryEmbedding.length;
    const vectorStr = `[${queryEmbedding.join(',')}]`;
    const rows = await prisma.$queryRawUnsafe(
      `SELECT ve.id, ve.article_id, ve.chunk_index, ve.chunk_text, ve.embedding_model, ve.metadata,
               ksa.status, ksa.title, ksa.category, ksa.mode, ksa.priority, ksa.source, ksa.source_url, ksa.source_type, ksa.version, ksa.updated_at,
               1 - (ve.embedding <=> $1::vector($2)) AS similarity
       FROM vector_embeddings ve
       JOIN knowledge_staged_articles ksa ON ksa.id = ve.article_id
       WHERE ksa.status = 'ACTIVE'
         AND 1 - (ve.embedding <=> $1::vector($2)) >= $3
       ORDER BY similarity DESC
       LIMIT $4`,
      vectorStr, dims, minScore, topK
    );
    return rows.map(r => ({
      id: r.id,
      articleId: r.article_id,
      chunkIndex: r.chunk_index,
      chunkText: r.chunk_text,
      score: parseFloat(r.similarity),
      article: {
        id: r.article_id,
        title: r.title,
        category: r.category,
        mode: r.mode,
        priority: r.priority,
        source: r.source,
        sourceUrl: r.source_url,
        sourceType: r.source_type,
        version: r.version,
        updatedAt: r.updated_at,
      },
    }));
  }

  const allEmbeddings = await prisma.vectorEmbedding.findMany({
    where: { article: { status: 'ACTIVE' } },
    include: { article: { select: { id: true, title: true, category: true, mode: true, priority: true, source: true, sourceUrl: true, sourceType: true, version: true, updatedAt: true } } },
  });

  const scored = [];
  for (const ve of allEmbeddings) {
    const stored = Array.isArray(ve.embedding) ? ve.embedding : (Array.isArray(ve.metadata?._embedding) ? ve.metadata._embedding : null);
    if (stored) {
      const sim = cosineSimilarity(queryEmbedding, stored);
      if (sim >= minScore) {
        scored.push({
          id: ve.id,
          articleId: ve.articleId,
          chunkIndex: ve.chunkIndex,
          chunkText: ve.chunkText,
          score: sim,
          article: ve.article,
        });
      }
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

export async function getEmbeddingCount() {
  const { default: prisma } = await import('../../utils/prisma.js');
  if (_usePgvector) {
    const result = await prisma.$queryRawUnsafe('SELECT COUNT(*)::int AS count FROM vector_embeddings');
    return result[0]?.count || 0;
  }
  return prisma.vectorEmbedding.count();
}

export async function getEmbeddingStats() {
  const { default: prisma } = await import('../../utils/prisma.js');
  const totalEmbeddings = await getEmbeddingCount();
  const articlesWithEmbeddings = _usePgvector
    ? (await prisma.$queryRawUnsafe('SELECT COUNT(DISTINCT article_id)::int AS count FROM vector_embeddings'))[0]?.count || 0
    : (await prisma.vectorEmbedding.groupBy({ by: ['articleId'] })).length;
  const totalApproved = await prisma.knowledgeStagedArticle.count({ where: { status: 'ACTIVE' } });
  return { totalEmbeddings, articlesWithEmbeddings, totalApproved, pgvectorEnabled: _usePgvector };
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
