# Testing Guide

## Unit Tests

### Source Registry
- Validate `isUrlAllowed` blocks private IPs, file://, data://
- Validate `getSourceForUrl` returns correct source
- Validate `SUPPORTED_TYPES` enum completeness

### Website Crawler
- SSRF: attempt to crawl 127.0.0.1, 10.x.x.x, 192.168.x.x → blocked
- SSRF: attempt file:///etc/passwd → blocked
- robots.txt parsing: respect Disallow rules
- Content-Type filtering: reject non-HTML responses
- Redirect safety: max 5 redirects, cross-domain blocked
- Local directory crawl with glob patterns

### Content Extractor
- HTML extraction from sample page (title, meta, headings, FAQ, tables)
- Markdown extraction with YAML front matter
- Edge cases: empty page, no headings, no body
- FAQ extraction from schema.org JSON-LD
- Content cleaning: nav, footer, scripts removed

### Content Normalizer
- SHA-256 content hash stability
- Category detection from keywords
- Mode detection (sales vs support keyword scoring)
- Keyword and synonym generation

### Content Validator
- Prompt injection patterns (10 test cases)
- Secret detection (API keys, tokens, private keys)
- Length boundaries (min 50, max 10,000)
- Placeholder detection (lorem ipsum, TBD)

### Content Diff
- Duplicate detection via contentHash
- Near duplicate detection (>85% similarity)
- Conflict detection (answer similarity < 50%)
- Field-level change summary

### Sync Workflow
- State machine transitions (DISCOVERED → ACTIVE)
- Auto-approval when requiresApproval=false
- Version snapshot creation
- Rejection and archival

## Integration Tests

### End-to-End Sync
1. Create a source pointing to a local test directory
2. Trigger sync
3. Verify staged articles created with correct status
4. Approve an article
5. Verify SynchronizedContentProvider returns it
6. Re-sync: verify unchanged articles are skipped

### Admin API
- Test all CRUD endpoints for sources
- Test sync trigger
- Test approval/rejection/archive actions
- Test pagination on staged articles

## Load Testing

- Crawl a large source (500+ pages) with rate limiting
- Verify memory usage stays bounded
- Verify crawl respects maxPages limit
- Test concurrent sync requests for different sources
