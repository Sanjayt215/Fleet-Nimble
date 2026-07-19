# Production Guide

## Deployment Steps

### 1. Database Setup

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Run Prisma migration
npx prisma migrate dev --name add_rag_models
```

### 2. Environment Configuration

```env
# RAG Feature Flag
RAG_ENABLED=true

# Embedding Provider
RAG_EMBEDDING_PROVIDER=openai
RAG_EMBEDDING_MODEL=text-embedding-ada-002
RAG_EMBEDDING_DIMENSIONS=1536
RAG_EMBEDDING_BATCH_SIZE=20
RAG_EMBEDDING_MAX_RETRIES=3

# Chunking
RAG_CHUNK_MAX_SIZE=500
RAG_CHUNK_OVERLAP=50
RAG_CHUNK_STRATEGY=heading

# Search
RAG_SEARCH_TOP_K=10
RAG_SEARCH_MIN_SCORE=0.3
RAG_SEMANTIC_WEIGHT=0.6
RAG_KEYWORD_WEIGHT=0.4

# Retrieval
RAG_MIN_CONFIDENCE=0.35
RAG_MAX_RESULTS=5
RAG_FALLBACK_ON_EMPTY=true
RAG_MAX_CONTEXT_LENGTH=3000

# Indexing
RAG_INDEX_BATCH_SIZE=10
RAG_INDEX_SCHEDULE=0 */2 * * *
RAG_REINDEX_THRESHOLD_DAYS=7
```

### 3. Warm Up

After deployment:
1. POST `/api/admin/rag/embedding-provider/reset` — initialize provider
2. POST `/api/admin/rag/index/all` — index all approved articles
3. Verify with GET `/api/admin/rag/status`

### 4. Verify Retrieval

Test with the Search Diagnostics tab or:
```bash
curl -X POST http://localhost:5000/api/admin/rag/search/diagnose \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"query": "How does GPS tracking work?"}'
```

## Monitoring

### Key Metrics
- **Embedding latency**: should stay under 500ms per batch
- **Search latency**: should stay under 50ms (pgvector) or 200ms (JSON fallback)
- **Cache hit rate**: aim for >80%
- **Failed embedding rate**: should be <1% of indexed articles
- **Vector growth**: monitor total embedding count growth rate

### Log Events
| Event | Level | Description |
|---|---|---|
| RAG_EMBEDDING_PROVIDER_INITIALIZED | info | Provider ready |
| RAG_ARTICLE_INDEXED | info | Article chunked and stored |
| RAG_INDEX_ALL_COMPLETED | info | Bulk indexing complete with stats |
| RAG_INDEX_FAILED | error | Individual article index failure |
| RAG_EVAL_COMPLETED | info | Evaluation results |
| RAG_VECTOR_STORE_PGVECTOR_ENABLED | info | pgvector detected |
| RAG_VECTOR_STORE_JSON_FALLBACK | info | Fallback mode |

## Troubleshooting

### Embeddings not appearing
1. Check `RAG_ENABLED=true`
2. Verify provider API key is set
3. Trigger manual index via Admin UI
4. Check Failed Embeddings tab for errors

### Search returning no results
1. Verify articles exist with ACTIVE status
2. Check vector count > 0
3. Reduce `RAG_SEARCH_MIN_SCORE` temporarily
4. Use Search Diagnostics tab to debug

### High latency
1. Enable pgvector if using JSON fallback
2. Increase `RAG_INDEX_BATCH_SIZE` for faster bulk indexing
3. Reduce `RAG_CHUNK_MAX_SIZE` for smaller batches
4. Consider switching to a faster embedding provider

## Scaling

- For >100K vectors: ensure pgvector HNSW index is created
- For >1M vectors: consider dedicated embedding service
- For high throughput: increase search replica count

## Known Limitations

1. JSON fallback is not suitable for >10K vectors (linear scan)
2. Local embedding model requires ~200MB memory
3. Embedding provider change requires full re-index
4. pgvector HNSW index does not support incremental updates efficiently
