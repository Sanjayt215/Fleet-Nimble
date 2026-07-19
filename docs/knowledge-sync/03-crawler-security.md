# Crawler Security

## SSRF Protection

The Website Crawler implements multiple layers of SSRF (Server-Side Request Forgery) protection:

### Protocol Filtering

Only `http:` and `https:` protocols are permitted. The following protocols are explicitly blocked:

- `file:` — local file access
- `data:` — data URIs
- `ftp:` — FTP protocol
- `blob:` — blob URIs
- `javascript:` — JavaScript URIs

### Private IP Blocking

All resolved IPs are checked against private/reserved ranges:

- `127.0.0.0/8` — loopback
- `10.0.0.0/8` — private class A
- `172.16.0.0/12` — private class B
- `192.168.0.0/16` — private class C
- `169.254.0.0/16` — link-local
- `0.0.0.0/8` — current network
- `::1/128` — IPv6 loopback
- `fc00::/7` — IPv6 unique local
- `fe80::/10` — IPv6 link-local

### Redirect Safety

- Maximum 5 redirects followed
- Each redirect target is re-validated against the domain allowlist
- Cross-domain redirects are blocked unless the target domain is explicitly allowed

### Path Blocklist

The following path patterns are blocked (case-insensitive):

- `/login`, `/signup`, `/register`
- `/dashboard`, `/admin`, `/manage`
- `/billing`, `/payment`, `/invoice`
- `/api`, `/v1/`, `/graphql`
- `/credentials`, `/secret`, `/token`
- `wp-admin`, `wp-login`
- `_next`, `_nuxt` (static build internals)

### Request Limits

- Maximum response size: 5 MB
- Request timeout: 15 seconds
- Content-Type must be `text/html`, `text/plain`, `text/markdown`, or `application/xhtml+xml`

## robots.txt Compliance

- Fetches and parses `/robots.txt` per domain
- Respects `User-agent: *` directives
- Respects `Disallow` rules
- Respects `Crawl-delay` directives
- Cached per domain per crawl session

## Rate Limiting

- Configurable per-source delay between requests (default: 1000ms)
- Tracks rate limit state per domain
- Respects `Retry-After` headers if present
