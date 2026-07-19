# Embedding Pipeline

## Provider Abstraction

The embedding service supports multiple providers through a common abstract base class:

```js
class BaseEmbeddingProvider {
  async initialize()    // Setup API client / load model
  async embed(text)     // Single text → vector
  async embedBatch(texts) // Batch → vectors
  get dimensions()      // Vector dimension count
  get model()           // Model identifier
  get name()            // Provider name
}
```

### Supported Providers

| Provider | Class | Default Model | Dimensions | Config Key |
|---|---|---|---|---|
| OpenAI | OpenAIEmbeddingProvider | text-embedding-ada-002 | 1536 | `RAG_EMBEDDING_PROVIDER=openai` |
| Gemini | GeminiEmbeddingProvider | text-embedding-004 | 768 | `RAG_EMBEDDING_PROVIDER=gemini` |
| Local | LocalEmbeddingProvider | all-MiniLM-L6-v2 | 384 | `RAG_EMBEDDING_PROVIDER=local` |

### Configuration

```env
RAG_EMBEDDING_PROVIDER=openai
RAG_EMBEDDING_MODEL=text-embedding-ada-002
RAG_EMBEDDING_DIMENSIONS=1536
RAG_EMBEDDING_BATCH_SIZE=20
RAG_EMBEDDING_MAX_RETRIES=3
```

## Embedding Trigger

Embedding is triggered when an article becomes ACTIVE:

1. **Manual approval** (Admin UI or API) → `approveArticle()` in `syncWorkflow.service.js`
2. **Auto-approval** (requiresApproval=false) → same path
3. **Bulk indexing** (cron or manual) → `indexAllApprovedArticles()`
4. **Re-index stale** → `reindexStaleArticles()`

## Pipeline Steps

1. **Chunk**: content is split into chunks (heading-aware, max 500 chars, 50 overlap)
2. **Embed**: each chunk is converted to a vector via the configured provider
3. **Store**: vectors are upserted into `vector_embeddings` table
4. **Version**: embedding version is tracked for cache invalidation

## Rejected/Archived Articles

- Rejected articles are never embedded
- Archived articles have their embeddings deleted
- The `deleteIndexedArticle()` function removes all chunks for an article
