# Performance Benchmarks

## Embedding Latency

| Provider | Dimensions | Per-Chunk | Batch (20) | Notes |
|---|---|---|---|---|
| OpenAI (ada-002) | 1536 | ~150ms | ~800ms | Requires API key |
| Gemini (embedding-004) | 768 | ~200ms | ~1.2s | Requires API key |
| Local (all-MiniLM-L6-v2) | 384 | ~50ms | ~400ms | No API required, CPU only |

## Search Latency

| Vectors | pgvector | JSON Fallback | Notes |
|---|---|---|---|
| 100 | <5ms | <10ms | |
| 1,000 | <10ms | ~20ms | |
| 10,000 | ~20ms | ~150ms | HNSW index helps pgvector |
| 100,000 | ~40ms | ~1.5s | pgvector recommended |
| 1,000,000 | ~80ms | N/A | Requires HNSW index |

## Memory Usage

- Embedding model (local): ~200MB loaded into memory
- Vector store (JSON fallback): ~2KB per vector
- Vector store (pgvector): stored in database, minimal app memory

## Scaling Recommendations

| Scale | Recommended Setup |
|---|---|
| <1,000 vectors | JSON fallback (no pgvector needed) |
| 1,000 - 100,000 | pgvector with HNSW index |
| 100,000+ | pgvector with HNSW, increased `ef_construction` |

## Monitoring Metrics

The RAG monitor tracks:
- Embedding latency (avg, P95, P99)
- Search latency (avg, P95, P99)
- Cache hit rate
- Retrieval confidence
- Failed embeddings count
