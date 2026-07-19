# Source Registry

## Overview

The Source Registry manages all configured knowledge sources. It provides URL allowlisting,
source type validation, and runtime source loading from both database and defaults.

## Supported Source Types

| Type | Description |
|---|---|
| `website` | Standard HTTP/HTTPS website |
| `help-center` | Help center / knowledge base URL |
| `api-docs` | API documentation |
| `local-markdown` | Local markdown files on disk |
| `github-wiki` | GitHub wiki URL |
| `rss-feed` | RSS/Atom feed |

## Default Sources

Three pre-configured default sources:

1. **FleetNimble Website** — `https://fleetnimble.com` (type: website)
2. **FleetNimble Help Center** — `https://help.fleetnimble.com` (type: help-center)
3. **Local Documentation** — `./docs` (type: local-markdown)

## URL Security

- `isUrlAllowed(url)`: checks against allowed domains, allowed paths, and blocked paths
- Only HTTPS and HTTP protocols are permitted
- `file:`/`data:`/`ftp:`/`blob:`/`javascript:` protocols are rejected
- Private IP ranges (127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16) are blocked

## Source Fields

| Field | Type | Default | Description |
|---|---|---|---|
| name | string | — | Human-readable source name |
| sourceType | string | — | One of the 6 supported types |
| baseUrl | string? | null | Base URL for crawling |
| localPath | string? | null | Local directory path for markdown |
| enabled | boolean | true | Whether the source is active |
| allowedDomains | string[] | [] | Whitelisted domains |
| allowedPaths | string[] | [] | Whitelisted URL path prefixes |
| blockedPaths | string[] | [] | Blocked URL path patterns |
| crawlDepth | int | 2 | Max link-following depth |
| maxPages | int | 50 | Max pages per sync |
| rateLimitMs | int | 1000 | Delay between requests |
| requiresApproval | boolean | true | Whether articles need admin approval |
| schedule | string? | null | Cron expression for auto-sync |

## Database Model

The `KnowledgeSource` model in Prisma stores all source configurations with full indexing on
enabled status and sync-related fields.
