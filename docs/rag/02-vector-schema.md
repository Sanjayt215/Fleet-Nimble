# Vector Schema

## Database Model

### VectorEmbedding

Stores chunked article embeddings for semantic search.

| Column | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| article_id | UUID | FK to knowledge_staged_articles |
| chunk_index | Int | Order of chunk within article |
| chunk_text | Text | The chunk content |
| embedding | vector(1536) | pgvector column (or JSON fallback) |
| embedding_model | String | Model used (e.g. "text-embedding-ada-002") |
| embedding_version | Int | Version number for cache invalidation |
| content_hash | String? | SHA-256 of chunk text for change detection |
| metadata | JSON | { articleTitle, articleCategory, articleMode, articlePriority, articleSource } |
| created_at | DateTime | |
| updated_at | DateTime | |

Indexed on: article_id, (embedding_model, embedding_version)

### RetrievalMetric

Stores evaluation results for retrieval queries.

| Column | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| query | String | The search query |
| retrieved_ids | String[] | IDs of articles retrieved |
| relevant_ids | String[] | IDs of relevant articles (ground truth) |
| recall_at_k | Float | Recall@K |
| precision_at_k | Float | Precision@K |
| mrr | Float | Mean Reciprocal Rank |
| latency_ms | Int | Search latency in ms |
| search_type | String | "keyword" \| "semantic" \| "hybrid" |

Indexed on: created_at DESC

### FailedEmbedding

Tracks articles that failed to embed.

| Column | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| article_id | String? | FK reference |
| article_title | String? | Denormalized for display |
| error | String | Error message |
| retry_count | Int | Number of retry attempts |
| last_attempt_at | DateTime | Last retry timestamp |

Indexed on: article_id, retry_count

## pgvector Setup

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE INDEX idx_vector_embeddings_embedding ON vector_embeddings
  USING hnsw (embedding vector_cosine_ops);
```

## JSON Fallback

When pgvector is not available, embeddings are stored as JSON arrays in the `embedding` column
and cosine similarity is computed in application code. This supports local development without
the pgvector extension.
