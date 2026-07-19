# Retrieval Engine

## Overview

The Retrieval Engine is the main entry point for all knowledge retrieval. It coordinates hybrid
search, confidence scoring, context building, and grounded response generation.

## API

### `retrieve(query, options)`

Primary retrieval method. Returns ranked passages with citations.

**Options:**
- `mode`: 'sales' | 'support' | null — filters by conversation mode
- `category`: string — filter by category
- `topK`: int — raw results before filtering (default: 15)
- `maxResults`: int — final result count (default: 5)
- `minScore`: float — minimum initial score threshold (default: 0.2)

**Response:**
```js
{
  query: "How does GPS tracking work?",
  passages: [{
    articleId: "uuid",
    chunkText: "FleetNimble GPS tracking provides real-time...",
    score: 0.89,
    searchType: "hybrid",
    citation: { title, source, version, updatedAt, sourceUrl }
  }],
  confidence: 0.72,
  totalResults: 15,
  filteredResults: 8,
  latency: 45,
  hasAnswer: true
}
```

### `retrieveWithContext(query, options)`

Extends `retrieve()` with:
- Builds a formatted context string from passages
- Synthesizes a natural answer from the best passage
- Returns `{ ...retrieve, context, answer, grounded }`

### `searchDiagnostics(query, options)`

Returns full diagnostic information including raw results with score, search type, and previews.
Used by the Search Diagnostics admin tool.

## Confidence Threshold

- Minimum confidence: 0.35 (configurable via `RAG_MIN_CONFIDENCE`)
- Below threshold → returns "I couldn't find verified information for that question."
- Above threshold → returns grounded answer with citations

## Grounded Responses

The LLM (via `retrieve_knowledge` tool) receives:
1. Retrieved passages as context
2. Instructions to answer only from retrieved content
3. Instructions to cite sources naturally
4. Fallback response if no relevant content found

## Citation Format

Each passage includes a citation object:
```js
{
  title: "GPS Tracking Overview",
  source: "FleetNimble Website",
  sourceType: "website",
  sourceUrl: "https://fleetnimble.com/gps-tracking",
  category: "GPS Tracking",
  version: 2,
  updatedAt: "2026-07-15T10:30:00Z"
}
```
