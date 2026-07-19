import https from 'https';
import http from 'http';
import { URL } from 'url';
import logger from '../../utils/logger.js';
import { isUrlAllowed, getSourceForUrl } from './sourceRegistry.js';

const CRAWLER_USER_AGENT = 'FleetNimbleKnowledgeCrawler/1.0 (+https://fleetnimble.com)';

const PRIVATE_IP_RANGES = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/,
  /^fe80:/,
];

const BLOCKED_PROTOCOLS = ['file:', 'data:', 'ftp:', 'blob:', 'javascript:'];

const BLOCKED_PATH_PATTERNS = [
  /\/login/i,
  /\/signup/i,
  /\/register/i,
  /\/account/i,
  /\/dashboard/i,
  /\/admin/i,
  /\/billing/i,
  /\/payment/i,
  /\/api\/.*/i,
  /\/auth\//i,
  /\/logout/i,
  /\/password/i,
  /\/reset/i,
  /\/secret/i,
  /\/token/i,
  /\/keys?/i,
  /\/credential/i,
  /\/wp-admin/i,
  /\/wp-login/i,
  /\/app\//i,
  /\/_next\//i,
  /\/cdn-cgi\//i,
];

const ALLOWED_CONTENT_TYPES = [
  'text/html',
  'text/plain',
  'text/markdown',
  'application/xhtml+xml',
];

const MAX_RESPONSE_SIZE = 5 * 1024 * 1024;
const DEFAULT_TIMEOUT = 15000;
const MAX_REDIRECTS = 5;

const visitedUrls = new Set();
let pendingCrawlCount = 0;

export function resetCrawlerState() {
  visitedUrls.clear();
  pendingCrawlCount = 0;
}

export function getCrawlerStats() {
  return { visitedCount: visitedUrls.size, pendingCount: pendingCrawlCount };
}

function isPrivateIp(hostname) {
  return PRIVATE_IP_RANGES.some(pattern => pattern.test(hostname));
}

function isBlockedProtocol(protocol) {
  return BLOCKED_PROTOCOLS.includes(protocol);
}

function isBlockedPath(path) {
  return BLOCKED_PATH_PATTERNS.some(pattern => pattern.test(path));
}

function normalizeUrl(urlString) {
  try {
    const url = new URL(urlString);
    url.hash = '';
    url.search = '';
    return url.href.replace(/\/+$/, '') + '/';
  } catch {
    return null;
  }
}

function resolveRedirectUrl(location, originalUrl) {
  try {
    const resolved = new URL(location, originalUrl);
    if (isBlockedProtocol(resolved.protocol)) return null;
    const source = getSourceForUrl(originalUrl);
    if (!source) return null;
    const domainOk = source.allowedDomains.some(d =>
      resolved.hostname.toLowerCase() === d.toLowerCase() ||
      resolved.hostname.toLowerCase().endsWith('.' + d.toLowerCase())
    );
    if (!domainOk) return null;
    if (isPrivateIp(resolved.hostname)) return null;
    return resolved.href;
  } catch {
    return null;
  }
}

export async function fetchRobotsTxt(baseUrl) {
  try {
    const robotsUrl = new URL('/robots.txt', baseUrl).href;
    const response = await fetchUrl(robotsUrl);
    if (response) {
      return parseRobotsTxt(response.body, baseUrl);
    }
  } catch {
    // robots.txt not available — proceed without restrictions
  }
  return { disallowedPaths: [], crawlDelay: 0 };
}

function parseRobotsTxt(content, baseUrl) {
  const result = { disallowedPaths: [], crawlDelay: 0 };
  const lines = content.split('\n');
  let currentUserAgent = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('User-agent:')) {
      currentUserAgent = trimmed.substring(11).trim().toLowerCase();
    }
    if (currentUserAgent === '*' || currentUserAgent === 'fleetnimbleknowledgecrawler') {
      if (trimmed.startsWith('Disallow:')) {
        const path = trimmed.substring(9).trim();
        if (path) result.disallowedPaths.push(path);
      }
      if (trimmed.startsWith('Crawl-delay:')) {
        const delay = parseInt(trimmed.substring(12).trim(), 10);
        if (!isNaN(delay) && delay > 0) {
          result.crawlDelay = Math.max(result.crawlDelay, delay);
        }
      }
    }
  }
  return result;
}

function isDisallowedByRobots(path, robotsRules) {
  if (!robotsRules) return false;
  return robotsRules.disallowedPaths.some(dp => {
    if (dp === '/') return true;
    return path.startsWith(dp);
  });
}

function fetchUrl(urlString, timeout = DEFAULT_TIMEOUT) {
  return new Promise((resolve, reject) => {
    try {
      const url = new URL(urlString);

      if (isPrivateIp(url.hostname)) {
        return reject(new Error('SSRF_BLOCKED_PRIVATE_IP'));
      }
      if (isBlockedProtocol(url.protocol)) {
        return reject(new Error(`SSRF_BLOCKED_PROTOCOL: ${url.protocol}`));
      }
      if (!isUrlAllowed(urlString)) {
        return reject(new Error('URL_NOT_ALLOWED'));
      }
      if (isBlockedPath(url.pathname)) {
        return reject(new Error('PATH_BLOCKED'));
      }

      const isHttps = url.protocol === 'https:';
      const transport = isHttps ? https : http;

      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: 'GET',
        headers: {
          'User-Agent': CRAWLER_USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,text/plain,text/markdown',
          'Accept-Language': 'en-US,en;q=0.5',
        },
        timeout,
        rejectUnauthorized: true,
      };

      const req = transport.request(options, (res) => {
        const statusCode = res.statusCode || 0;

        if ([301, 302, 303, 307, 308].includes(statusCode)) {
          const location = res.headers.location;
          if (!location) return reject(new Error('REDIRECT_WITHOUT_LOCATION'));
          const resolved = resolveRedirectUrl(location, urlString);
          if (!resolved) return reject(new Error('REDIRECT_BLOCKED'));
          return resolve({ redirect: resolved, statusCode });
        }

        if (statusCode >= 400) {
          return reject(new Error(`HTTP_${statusCode}`));
        }

        const contentType = (res.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        const isAllowed = ALLOWED_CONTENT_TYPES.some(t => contentType.includes(t));
        if (!isAllowed && !contentType.startsWith('text/')) {
          return reject(new Error(`UNSUPPORTED_CONTENT_TYPE: ${contentType}`));
        }

        const chunks = [];
        let totalSize = 0;

        res.on('data', (chunk) => {
          totalSize += chunk.length;
          if (totalSize > MAX_RESPONSE_SIZE) {
            req.destroy();
            return reject(new Error('RESPONSE_TOO_LARGE'));
          }
          chunks.push(chunk);
        });

        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf-8');
          resolve({ body, statusCode, contentType, headers: res.headers });
        });
      });

      req.on('error', (err) => reject(err));
      req.on('timeout', () => { req.destroy(); reject(new Error('REQUEST_TIMEOUT')); });

      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

export async function crawlPage(urlString, options = {}) {
  const {
    depth = 0,
    maxDepth = 2,
    maxPages = 50,
    rateLimitMs = 1000,
    robotsRules = null,
  } = options;

  if (pendingCrawlCount >= maxPages) {
    return { skipped: true, reason: 'max_pages_reached' };
  }

  const normalized = normalizeUrl(urlString);
  if (!normalized) return { skipped: true, reason: 'invalid_url' };

  if (visitedUrls.has(normalized)) {
    return { skipped: true, reason: 'duplicate' };
  }

  const parsed = new URL(normalized);
  if (isBlockedPath(parsed.pathname)) {
    return { skipped: true, reason: 'path_blocked' };
  }

  if (robotsRules && isDisallowedByRobots(parsed.pathname, robotsRules)) {
    return { skipped: true, reason: 'robots_disallowed' };
  }

  visitedUrls.add(normalized);
  pendingCrawlCount++;

  await delay(rateLimitMs);

  try {
    const response = await fetchUrl(normalized);
    visitedUrls.add(normalized);

    if (response.redirect) {
      const result = await crawlPage(response.redirect, {
        ...options,
        depth,
        maxPages: maxPages - (pendingCrawlCount - 1),
      });
      result.redirectedFrom = normalized;
      return result;
    }

    const result = {
      url: normalized,
      body: response.body,
      contentType: response.contentType,
      depth,
      headers: response.headers,
      skipped: false,
    };

    // Find linked pages if within depth limit
    if (depth < maxDepth && pendingCrawlCount < maxPages) {
      const links = extractLinks(response.body, normalized);
      const source = getSourceForUrl(normalized);
      const allowedLinks = links.filter(link => {
        if (!source) return false;
        try {
          const linkUrl = new URL(link);
          return source.allowedDomains.some(d =>
            linkUrl.hostname.toLowerCase() === d.toLowerCase() ||
            linkUrl.hostname.toLowerCase().endsWith('.' + d.toLowerCase())
          ) && !isBlockedPath(linkUrl.pathname) &&
            (source.allowedPaths.length === 0 || source.allowedPaths.some(p => linkUrl.pathname.startsWith(p)));
        } catch {
          return false;
        }
      });

      const subPages = [];
      for (const link of allowedLinks) {
        if (pendingCrawlCount >= maxPages) break;
        if (visitedUrls.has(normalizeUrl(link))) continue;
        if (link === normalized) continue;

        const subResult = await crawlPage(link, {
          ...options,
          depth: depth + 1,
          maxPages,
          rateLimitMs,
          robotsRules,
        });
        if (!subResult.skipped) {
          subPages.push(subResult);
        }
      }
      result.subPages = subPages;
    }

    return result;
  } catch (err) {
    const errorKey = err.message?.startsWith('SSRF') ? 'ssrf_blocked'
      : err.message?.startsWith('REDIRECT') ? 'redirect_blocked'
      : err.message?.startsWith('HTTP_') ? 'http_error'
      : err.message === 'RESPONSE_TOO_LARGE' ? 'response_too_large'
      : err.message === 'REQUEST_TIMEOUT' ? 'timeout'
      : 'fetch_failed';

    return { skipped: true, reason: errorKey, url: normalized, error: err.message };
  }
}

export async function startCrawl(source) {
  resetCrawlerState();

  if (!source.enabled) {
    return { error: 'source_disabled' };
  }

  if (source.type === 'website' && source.baseUrl) {
    const robotsRules = await fetchRobotsTxt(source.baseUrl);
    const result = await crawlPage(source.baseUrl, {
      maxDepth: source.crawlDepth || 2,
      maxPages: source.maxPages || 50,
      rateLimitMs: source.rateLimitMs || 1000,
      robotsRules,
    });
    return { result, robotsRules, stats: getCrawlerStats() };
  }

  if (source.type === 'local-documentation' && source.localPath) {
    return crawlLocalDirectory(source);
  }

  return { error: 'unsupported_source_type' };
}

async function crawlLocalDirectory(source) {
  try {
    const { readdir, readFile, stat } = await import('fs/promises');
    const { join, extname } = await import('path');

    const pages = [];

    async function walkDir(dirPath, depth = 0) {
      if (depth > (source.crawlDepth || 3)) return;
      if (pages.length >= (source.maxPages || 200)) return;

      try {
        const entries = await readdir(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          if (pages.length >= (source.maxPages || 200)) break;
          const fullPath = join(dirPath, entry.name);

          if (entry.isDirectory()) {
            if (!entry.name.startsWith('.')) {
              await walkDir(fullPath, depth + 1);
            }
          } else if (entry.isFile()) {
            const ext = extname(entry.name).toLowerCase();
            if (['.md', '.mdx', '.txt', '.html'].includes(ext)) {
              const content = await readFile(fullPath, 'utf-8');
              pages.push({
                url: fullPath,
                body: content,
                contentType: ext === '.md' || ext === '.mdx' ? 'text/markdown' : ext === '.html' ? 'text/html' : 'text/plain',
                depth,
                skipped: false,
              });
            }
          }
        }
      } catch (err) {
        logger.warn('CRAWL_DIR_SKIPPED', { dir: dirPath, error: err.message });
      }
    }

    await walkDir(source.localPath);

    return {
      result: { subPages: pages },
      stats: { visitedCount: pages.length, pendingCount: 0 },
    };
  } catch (err) {
    logger.error('CRAWL_DIR_FAILED', { localPath: source.localPath, error: err.message });
    return { error: 'local_crawl_failed', message: err.message };
  }
}

function extractLinks(html, baseUrl) {
  const links = [];
  const hrefRegex = /<a[^>]+href=["']([^"']+)["']/gi;
  let match;

  while ((match = hrefRegex.exec(html)) !== null) {
    try {
      const resolved = new URL(match[1], baseUrl);
      if (resolved.protocol === 'https:' || resolved.protocol === 'http:') {
        if (!isPrivateIp(resolved.hostname)) {
          links.push(resolved.href);
        }
      }
    } catch {
      // skip invalid URLs
    }
  }

  return [...new Set(links)];
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
