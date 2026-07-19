# Testing Guide

## Unit Tests

### Embedding Provider
- Provider factory returns correct provider for each configured type
- Provider initialization handles missing API keys gracefully
- embed() and embedBatch() return arrays of correct dimensions
- Provider reset clears cached instance

### Chunking
- Heading-aware chunking splits on markdown H1-H6
- Paragraph-aware chunking splits on double newlines
- Hybrid chunking keeps tables intact
- Overlap is correctly applied between chunks
- FAQ content is preserved as Q&A pairs
- Article with no headings → single chunk

### Vector Store
- storeEmbedding inserts/upserts correctly
- similaritySearch returns sorted results
- Delete removes all chunks for an article
- getEmbeddingCount returns accurate count
- Cosine similarity computation is correct

### Hybrid Search
- Semantic search returns results sorted by similarity
- Keyword search weights title/keyword matches correctly
- Merge removes duplicates (prefers semantic results)
- Ranking formula applies all weights correctly

### Retrieval Engine
- retrieve() filters by confidence threshold
- retrieveWithContext() builds context and answer
- searchDiagnostics() returns full debug info
- Low confidence → hasAnswer=false

### RAG Pipeline
- indexArticle() skips non-ACTIVE articles
- indexArticle() chunks and stores embeddings
- deleteIndexedArticle() removes all chunks
- retryFailedEmbeddings() increments retry count
- reindexArticle() deletes old embeddings before re-indexing

## Integration Tests

### End-to-End Flow
1. Create and approve an article via API
2. Verify embeddings are created in vector store
3. Search for the article content via hybrid search
4. Verify article appears in results with correct score
5. Archive the article
6. Verify embeddings are deleted
7. Search again → article no longer returned

### Admin API
- Test all RAG admin endpoints
- Verify authentication required
- Verify admin role required
- Test search diagnostic with known queries

## Performance Tests

- Embedding latency with batch of 50 chunks
- Search latency with 1000+ vectors
- Re-index of 100 approved articles
- Concurrent search and indexing
