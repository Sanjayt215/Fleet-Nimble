# Knowledge Sync Pipeline — Architecture

## Overview

The Knowledge Sync Pipeline is a complete content ingestion system that automatically collects, validates,
normalizes, reviews, and approves external content into the FleetNimble Knowledge Engine. It replaces
manual JSON editing with an automated workflow backed by a state machine and admin approval gates.

## High-Level Flow

```
Content Source (website, docs, markdown dir)
    │
    ▼
Website Crawler ──── SSRF-safe fetch, robots.txt, rate limits
    │
    ▼
Content Extractor ──── HTML/Markdown → structured extraction
    │
    ▼
Content Normalizer ──── raw extraction → engine article format (hash, category, mode, keywords)
    │
    ▼
Content Validator ──── 9+ validation categories (length, injection, secrets, claims)
    │
    ▼
Content Diff ──── duplicate/conflict detection vs. existing approved articles & curated engine
    │
    ▼
Sync Workflow ──── state machine: DISCOVERED → EXTRACTED → VALIDATED → NEEDS_REVIEW → APPROVED/REJECTED → ACTIVE/ARCHIVED
    │
    ▼
SynchronizedContentProvider ──── reads only APPROVED/ACTIVE articles, registered in Knowledge Engine provider order
    │
    ▼
Admin API ──── source CRUD, sync triggers, approval actions, cache refresh
    │
    ▼
Admin UI ──── tabbed dashboard: sources, staged articles, sync history, settings
```

## Key Components

| Component | File | Role |
|---|---|---|
| Source Registry | `sync/sourceRegistry.js` | URL allowlisting, source metadata, type validation |
| Website Crawler | `sync/websiteCrawler.service.js` | SSRF-safe HTTP fetch, robots.txt, depth/pages/rate limits |
| Content Extractor | `sync/contentExtractor.service.js` | HTML and Markdown content → structured fields |
| Content Normalizer | `sync/contentNormalizer.service.js` | Normalized article format with hash, category, mode, keywords |
| Content Validator | `sync/contentValidator.service.js` | 9+ validation categories, prompt injection, secret detection |
| Content Diff | `sync/contentDiff.service.js` | Duplicate detection, conflict detection, field-level comparison |
| Sync Workflow | `sync/syncWorkflow.service.js` | Approval state machine, staging, versioning, audit trail |
| Synchronized Provider | `providers/synchronizedContentProvider.js` | Engine provider loading only ACTIVE articles |
| Admin API | `routes/admin/knowledgeSync.routes.js` | REST endpoints for source + staged article management |
| Admin UI | `frontend/src/pages/KnowledgeSync.jsx` | Tabbed admin interface with source/staged/run views |

## Provider Order

The `KNOWLEDGE_PROVIDER_ORDER` env var controls the relative authority: `json,markdown,synchronized,database`.

Curated JSON articles have highest priority. Crawled content (synchronized provider) sits between
curated markdown and per-tenant database articles.
