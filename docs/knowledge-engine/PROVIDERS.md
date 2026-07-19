# Knowledge Providers

## JsonKnowledgeProvider

The primary provider that loads curated FleetNimble knowledge from a JSON file.

**Source**: `backend/src/knowledge/content/fleetnimble-knowledge.json`

**Features**:
- Loads all articles at initialization
- Case-insensitive keyword matching
- Multi-word phrase matching with partial word scoring
- Synonym matching
- Priority-weighted scoring
- Category and mode filtering
- Provider: `json`

**Configuration**: `FLEETNIMBLE_KNOWLEDGE_PATH` env var

## MarkdownKnowledgeProvider

File-based provider for teams who prefer managing knowledge as markdown files.

**Features**:
- Parses markdown files with YAML front matter
- Supports `---` delimited front matter for metadata
- Front matter fields: `id`, `title`, `category`, `subcategory`, `keywords`, `synonyms`, `mode`, `priority`, `relatedArticles`, `proactiveSalesTip`
- Body sections: `## Answer`, `## Details`
- Automatic file-based article ID (filename without extension)
- Provider: `markdown`

**Example Markdown File**:

```markdown
---
id: gps-tracking
title: GPS Tracking
category: GPS Tracking
subcategory: Real-time
keywords: gps, tracking, location, gps tracking
synonyms: gps tracker, location tracking
mode: both
priority: 9
relatedArticles: geofence-management, trip-history
proactiveSalesTip: Combine GPS Tracking with Live Diagnostics...
---

## Answer

GPS Tracking shows all your vehicles on a live map with real-time positions...

## Details

The GPS Tracking page uses a dynamic map interface...
```

**Configuration**: `FLEETNIMBLE_MD_KNOWLEDGE_DIR` env var (directory path)

## DatabaseKnowledgeProvider

Tenant-specific provider that loads custom knowledge entries from the database.

**Source**: `aiReceptionistConfig.knowledgeBase` JSON field in PostgreSQL

**Features**:
- Loads per-user knowledge entries
- Supports same fields as JSON provider
- Useful for per-tenant custom FAQs and product information
- Provider: `database`

**Configuration**: Requires `userId` in search options

## Adding a New Provider

1. Create a new file in `backend/src/knowledge/providers/`
2. Export a class implementing the provider interface
3. Register it in `knowledge/index.js` by adding to `providerMap`
4. Add to `KNOWLEDGE_PROVIDER_ORDER` env var if needed

### Provider Interface

```js
class CustomProvider {
  constructor() {
    this.name = 'custom';
    this.type = 'custom';
  }

  async initialize() { /* setup */ }
  async search(query, options) { /* return [{ article, score }] */ }
  async getArticle(id) { /* return article or null */ }
  async getCategory(category) { /* return [articles] */ }
  async listTopics() { /* return [{ id, title, category, subcategory }] */ }
  async searchByKeywords(keywords) { /* return [{ article, score }] */ }
  async getAllArticles() { /* return [articles] */ }
}
```

## Future Provider Types

- **WebsiteProvider**: Indexes FleetNimble website/docs pages
- **PDFProvider**: Extracts knowledge from PDF manuals
- **VectorSearchProvider**: RAG-based semantic search with embeddings
- **APIClientProvider**: Fetches knowledge from external API
