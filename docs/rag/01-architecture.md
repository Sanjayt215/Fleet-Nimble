# Enterprise RAG — Architecture

## Overview

The Enterprise RAG (Retrieval-Augmented Generation) layer transforms the existing FleetNimble
Knowledge Engine into a semantic retrieval system. When the AI Receptionist receives a question,
it retrieves the most relevant knowledge chunks using hybrid search, then answers strictly from
the retrieved content.

## System Architecture

```
Caller Question
      │
      ▼
AI Receptionist (LLM)
      │
      ├── retrieve_knowledge tool call ──────────────────┐
      │                                                   │
      ▼                                                   ▼
RetrievalEngine.service.js                     Knowledge Engine (fallback)
      │                                                   │
      ├── hybridSearch.service.js                         │
      │     ├── semanticSearch (embeddings)               │
      │     └── keywordSearch (PostgreSQL)                │
      │                                                   │
      ▼                                                   │
Embedding Service ◄──── Vector Store (pgvector)           │
      │                                                   │
      ├── OpenAI (text-embedding-ada-002)                 │
      ├── Gemini (text-embedding-004)                     │
      └── Local (@xenova/transformers)                    │
      │                                                   │
      ▼                                                   ▼
RAG Pipeline ──── Chunking → Embed → Store (on ACTIVE)
      │
      ├── indexAllApprovedArticles()
      ├── reindexArticle()
      ├── retryFailedEmbeddings()
      └── processReindexQueue()
```

## Key Components

| Component | File | Role |
|---|---|---|
| Embedding Providers | `rag/providers/*.js` | Abstracted multi-provider embedding |
| Embedding Service | `rag/embedding.service.js` | Provider factory, embed/embedBatch |
| Chunking Service | `rag/chunking.service.js` | Heading/paragraph/hybrid chunking |
| Vector Store | `rag/vectorStore.service.js` | pgvector + JSON fallback, CRUD, similarity search |
| Hybrid Search | `rag/hybridSearch.service.js` | Semantic + keyword + hybrid ranking |
| Retrieval Engine | `rag/retrievalEngine.service.js` | Main retrieval, context building, grounded responses |
| RAG Pipeline | `rag/ragPipeline.service.js` | Indexing, re-indexing, retry, cleanup |
| Retrieval Evaluator | `rag/retrievalEvaluator.service.js` | Recall@K, Precision@K, MRR |
| RAG Monitor | `rag/ragMonitor.service.js` | Latency, cache, confidence tracking |
| Admin API | `routes/admin/rag.routes.js` | REST endpoints for management |
| Admin UI | `frontend/src/pages/RAGDashboard.jsx` | Tabbed admin interface |

## Data Flow

1. Article is APPROVED → `syncWorkflow` triggers `rag.indexArticle()`
2. Article is chunked (heading-aware, paragraph-aware, table-aware, FAQ-aware)
3. Chunks are embedded via the configured provider
4. Embeddings stored in `vector_embeddings` table (pgvector or JSON)
5. On user query → `retrieve_knowledge` tool call → `retrievalEngine.retrieve()`
6. Hybrid search merges semantic + keyword results
7. Results ranked by similarity, keyword score, category, priority, freshness
8. Top passages returned to LLM as context
9. LLM answers only from retrieved context
