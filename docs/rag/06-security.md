# RAG Security

## Tenant Isolation

- All vector embeddings are linked to `knowledge_staged_articles` which are tenant-aware
- The `articleId` FK ensures embeddings are scoped to the same articles visible through the Knowledge Engine
- Admin API endpoints require JWT authentication with `ADMIN` role

## Approved Articles Only

- The vector store query always filters `WHERE ksa.status = 'ACTIVE'`
- Only APPROVED/ACTIVE articles are indexed
- Rejected, archived, or draft articles are never embedded
- Archived articles have their embeddings automatically deleted

## Prompt Injection Protection

- Content is validated through the existing `contentValidator.service.js` before reaching the approval stage
- 10 prompt injection patterns are detected and rejected
- Embedding pipeline never processes unvalidated content
- The `FailedEmbedding` table tracks any articles that fail validation during indexing

## No Secret Storage

- Embeddings store only approved FleetNimble knowledge
- No API keys, tokens, credentials, or private data is stored in vectors
- The existing secret detection in `contentValidator.service.js` blocks articles containing secrets

## Query Security

- Search queries are not logged in plaintext beyond debug logging
- Admin API uses the same authentication middleware as all other admin routes
- Rate limiting applies to search endpoints (inherited from global API limiter)

## Chunk-Level Isolation

- Each chunk is independently verified and approved
- Citations track source, version, and last verified date
- Vectors are versioned — re-indexing increments the version number
