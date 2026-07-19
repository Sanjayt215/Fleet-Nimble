# Admin Tools

## RAG Dashboard

The RAG Management dashboard at `/demo/admin/rag` provides six tabs:

### Status Tab
- Vector count, articles indexed, approved articles count
- Failed embeddings count, exhausted retries
- 24h metrics count, indexing lock status, re-index queue size
- Action buttons: Index All, Reindex Stale, Retry Failed, Reset Monitor

### Indexing Tab
- Index or delete embeddings for a specific article by UUID
- Shows indexing result (chunks created, success/failure)

### Search Diagnostics Tab
- Test any query against the retrieval engine
- Shows: total latency, result count, confidence score
- Detailed table: score, search type, article title, content preview
- Useful for debugging retrieval quality

### Evaluations Tab
- Time filters: last hour, last 24h, last 7 days
- Metrics: Avg Recall@K, Avg Precision@K, Avg MRR, Avg Latency
- Sample size indicator

### Failed Embeddings Tab
- Table of failed embeddings with: article title, error message, retry count, last attempt timestamp
- Pagination support

### Monitor Tab
- Embedding latency (avg, P95, P99)
- Search latency (avg, P95, P99)
- Cache hit rate, hits, misses
- Retrieval confidence, sample count
- Operations: failed embeddings, reindex operations

## API Endpoints

Available at `/api/admin/rag/`:

| Method | Path | Description |
|---|---|---|
| GET | /status | Full RAG status (stats + monitor) |
| GET | /embedding-provider | Current provider info |
| POST | /embedding-provider/reset | Reset and warm provider |
| POST | /index/all | Index all approved articles |
| POST | /index/article/:id | Index a specific article |
| DELETE | /index/article/:id | Delete article embeddings |
| POST | /reindex/stale | Reindex stale articles |
| POST | /retry-failed | Retry failed embeddings |
| GET | /failed-embeddings | List failed embeddings |
| POST | /search/diagnose | Run search diagnostic |
| GET | /search/metrics | Retrieval evaluation metrics |
| GET | /vectors/count | Total vector count |
| GET | /monitor | Real-time monitor stats |
| POST | /monitor/reset | Reset monitor statistics |
