# Knowledge Engine Architecture

## Overview

The FleetNimble Knowledge Engine provides verified, authoritative answers about FleetNimble products and services to the AI Receptionist. Every answer comes from curated knowledge content — never from the LLM's general training data.

## Design Principles

1. **Source of Truth**: Knowledge content is curated by the FleetNimble product team. The engine never invents answers.
2. **Multi-Provider**: Supports JSON, Markdown, and Database sources now; designed for future providers (website crawling, PDF, vector search).
3. **Provider Abstraction**: All providers implement the same interface. The engine aggregates results across all registered providers.
4. **AI-Logic Separation**: The engine handles search, ranking, and formatting. The AI (LLM) only renders answers. No AI logic changes when adding new knowledge sources.
5. **Voice-Optimized**: Answers are concise, natural, and appropriate for phone conversation.

## Architecture Diagram

```
receptionistOrchestrator.service.js
  |
  |-- processReceptionistTurn()
  |     |-- classifyIntent() -> uses knowledge engine for product_question
  |     |-- calls engine.search() to get answer
  |     |-- calls engine.getProactiveSalesSuggestion() for cross-sell
  |
receptionistVoice.service.js
  |
  |-- buildSystemPrompt()
        |-- calls engine.getCategory() for each category
        |-- injects knowledge articles into system prompt
        |-- adds mode-specific instructions (sales/support)
        |
FleetNimbleKnowledgeEngine (knowledge/index.js)
  |
  |-- search(query, options) -> ranks across all providers
  |-- getArticle(id) -> fetches single article
  |-- getCategory(category) -> fetches articles by category
  |-- listTopics() -> lists all available topics
  |-- searchByKeywords(keywords) -> direct keyword search
  |-- rankResults(results, query) -> relevance scoring
  |-- getAnswer(results, mode) -> extracts best answer
  |-- getFormattedAnswer(results, mode) -> answer + related articles
  |-- getProactiveSalesSuggestion(results) -> cross-sell opportunity
  |-- formatAnswerForVoice(answer) -> voice-optimized output
  |
  +-- JsonKnowledgeProvider (providers/jsonProvider.js)
  |     Primary provider. Loads curated JSON knowledge content.
  |
  +-- MarkdownKnowledgeProvider (providers/markdownProvider.js)
  |     File-based provider. Parses markdown files with YAML front matter.
  |
  +-- DatabaseKnowledgeProvider (providers/databaseProvider.js)
        Tenant-specific provider. Loads custom knowledge from database.
```

## Provider Interface

Every provider implements:

```js
async initialize()
async search(query, options)
async getArticle(id)
async getCategory(category)
async listTopics()
async searchByKeywords(keywords)
async getAllArticles()
```

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `KNOWLEDGE_PROVIDER_ORDER` | `json,markdown,database` | Provider priority order |
| `FLEETNIMBLE_KNOWLEDGE_PATH` | `content/fleetnimble-knowledge.json` | Path to JSON knowledge file |
| `FLEETNIMBLE_MD_KNOWLEDGE_DIR` | null | Directory for markdown knowledge files |

## Caching

The engine builds an in-memory article cache and category cache at initialization. These caches enable fast lookups without provider calls for common operations like `getArticle()` and `getCategory()`.
