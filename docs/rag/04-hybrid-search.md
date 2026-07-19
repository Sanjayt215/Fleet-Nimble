# Hybrid Search

## Overview

Hybrid search combines semantic (vector) retrieval with keyword (full-text) retrieval to maximize
both recall and precision. Semantic search captures meaning, keyword search captures exact terms.

## Search Strategies

### Semantic Search
- User query → embedding via provider → cosine similarity against stored vectors
- Retrieves top chunks ranked by cosine distance
- Configurable minScore threshold (default 0.3)

### Keyword Search
- Query is tokenized into words (min 3 characters)
- Matches against article title, answer, details, keywords, and synonyms
- Weighted scoring: title match = +3, keyword match = +2, synonym match = +1.5, body match = +1
- Normalized by number of query words

### Hybrid Merge
- Semantic and keyword results are merged by article ID
- Duplicates are removed, keeping the max keyword + semantic scores
- Each result is tagged with its search type (semantic | keyword | hybrid)

## Ranking Formula

```js
finalScore = (semanticScore * SEMANTIC_WEIGHT)
           + (keywordScore * KEYWORD_WEIGHT)
           + (priorityScore * PRIORITY_WEIGHT)
           + (freshnessScore * FRESHNESS_WEIGHT)
           + (categoryScore * CATEGORY_WEIGHT)
```

### Default Weights

| Factor | Weight | Description |
|---|---|---|
| Semantic | 0.6 | Vector similarity |
| Keyword | 0.4 | Text match relevance |
| Priority | 0.15 | Article priority (1-10) |
| Freshness | 0.1 | Age in hours (capped at 30 days) |
| Category | 0.15 | Category + mode match bonus |

All configurable via `RAG_*` environment variables.

## Response

```js
{
  results: [{ articleId, chunkText, score, searchType, citation }],
  latency: 45,
  semanticCount: 8,
  keywordCount: 12,
  confidence: 0.72,
  hasAnswer: true
}
```
