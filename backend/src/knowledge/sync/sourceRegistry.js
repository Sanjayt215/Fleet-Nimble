import logger from '../../utils/logger.js';

const SUPPORTED_TYPES = [
  'website',
  'sitemap',
  'markdown-directory',
  'json-file',
  'local-documentation',
  'api-documentation',
];

const DEFAULT_SOURCES = [
  {
    id: 'fleetnimble-website',
    name: 'FleetNimble Public Website',
    type: 'website',
    baseUrl: 'https://fleetnimble.com',
    enabled: false,
    allowedDomains: ['fleetnimble.com'],
    allowedPaths: ['/features', '/pricing', '/about', '/docs', '/help', '/faq', '/blog', '/product', '/solutions', '/integrations', '/security', '/contact'],
    blockedPaths: ['/login', '/signup', '/account', '/dashboard', '/admin', '/billing', '/api', '/app', '/demo', '/_next', '/cdn-cgi', '/wp-admin', '/wp-login'],
    crawlDepth: 2,
    maxPages: 50,
    rateLimitMs: 1500,
    requiresApproval: true,
    defaultCategory: 'Web',
    defaultMode: 'both',
    priority: 5,
    owner: 'system',
    schedule: null,
  },
  {
    id: 'fleetnimble-help-center',
    name: 'FleetNimble Help Center',
    type: 'website',
    baseUrl: 'https://help.fleetnimble.com',
    enabled: false,
    allowedDomains: ['help.fleetnimble.com'],
    allowedPaths: ['/articles', '/categories', '/faq', '/troubleshooting', '/guides', '/tutorials'],
    blockedPaths: ['/login', '/signup', '/account', '/admin', '/dashboard', '/api', '/auth', '/_next', '/cdn-cgi'],
    crawlDepth: 2,
    maxPages: 100,
    rateLimitMs: 1000,
    requiresApproval: true,
    defaultCategory: 'Help Center',
    defaultMode: 'both',
    priority: 6,
    owner: 'system',
    schedule: '0 6 * * 1',
  },
  {
    id: 'fleetnimble-docs-repo',
    name: 'FleetNimble Local Documentation',
    type: 'local-documentation',
    localPath: 'docs',
    enabled: true,
    allowedDomains: [],
    allowedPaths: [],
    blockedPaths: [],
    crawlDepth: 3,
    maxPages: 200,
    rateLimitMs: 0,
    requiresApproval: true,
    defaultCategory: 'Documentation',
    defaultMode: 'both',
    priority: 7,
    owner: 'system',
    schedule: '0 5 * * *',
  },
];

let sources = [];

export function getSupportedTypes() {
  return [...SUPPORTED_TYPES];
}

export function getDefaultSources() {
  return DEFAULT_SOURCES.map(s => ({ ...s }));
}

export async function loadSources() {
  try {
    const { default: prisma } = await import('../../utils/prisma.js');
    const dbSources = await prisma.knowledgeSource.findMany({ orderBy: { createdAt: 'asc' } });
    if (dbSources.length > 0) {
      sources = dbSources.map(s => ({
        id: s.id,
        name: s.name,
        type: s.sourceType,
        baseUrl: s.baseUrl,
        localPath: s.localPath,
        enabled: s.enabled,
        allowedDomains: s.allowedDomains || [],
        allowedPaths: s.allowedPaths || [],
        blockedPaths: s.blockedPaths || [],
        crawlDepth: s.crawlDepth,
        maxPages: s.maxPages,
        rateLimitMs: s.rateLimitMs,
        requiresApproval: s.requiresApproval,
        defaultCategory: s.defaultCategory,
        defaultMode: s.defaultMode,
        priority: s.priority,
        owner: s.owner,
        schedule: s.schedule,
        lastSyncedAt: s.lastSyncedAt,
        lastSyncStatus: s.lastSyncStatus,
        metadata: s.metadata,
      }));
      logger.info('KNOWLEDGE_SOURCES_LOADED', { count: sources.length });
    } else {
      logger.info('KNOWLEDGE_SOURCES_EMPTY_DEFAULTS', { count: DEFAULT_SOURCES.length });
    }
  } catch (err) {
    logger.warn('KNOWLEDGE_SOURCES_LOAD_FAILED', { error: err.message });
    sources = [];
  }
  return sources;
}

export function getSources() {
  return [...sources];
}

export function getSource(id) {
  return sources.find(s => s.id === id) || null;
}

export function getEnabledSources() {
  return sources.filter(s => s.enabled);
}

export function addSource(source) {
  const existing = sources.findIndex(s => s.id === source.id);
  if (existing >= 0) {
    sources[existing] = { ...sources[existing], ...source };
  } else {
    sources.push(source);
  }
}

export function removeSource(id) {
  sources = sources.filter(s => s.id !== id);
}

export function isUrlAllowed(url) {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    const path = parsed.pathname;

    for (const source of sources) {
      if (!source.enabled) continue;
      if (source.allowedDomains.length === 0) continue;

      const domainMatch = source.allowedDomains.some(d => {
        const domain = d.toLowerCase();
        return hostname === domain || hostname.endsWith('.' + domain);
      });

      if (!domainMatch) continue;

      if (source.allowedPaths.length > 0) {
        const pathAllowed = source.allowedPaths.some(p => path.startsWith(p));
        if (!pathAllowed) continue;
      }

      if (source.blockedPaths.length > 0) {
        const pathBlocked = source.blockedPaths.some(p => path.startsWith(p));
        if (pathBlocked) return false;
      }

      return true;
    }

    return false;
  } catch {
    return false;
  }
}

export function getSourceForUrl(url) {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    const path = parsed.pathname;

    for (const source of sources) {
      if (!source.enabled) continue;
      const domainMatch = source.allowedDomains.some(d => hostname === d.toLowerCase() || hostname.endsWith('.' + d.toLowerCase()));
      if (!domainMatch) continue;
      if (source.allowedPaths.length > 0 && !source.allowedPaths.some(p => path.startsWith(p))) continue;
      if (source.blockedPaths.some(p => path.startsWith(p))) continue;
      return source;
    }
    return null;
  } catch {
    return null;
  }
}
