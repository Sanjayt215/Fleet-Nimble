/**
 * AI Cache Service
 * Provides caching layer for sub-2 second response times
 */

// Simple in-memory cache with TTL
const cache = new Map();
const DEFAULT_TTL = 30000; // 30 seconds default TTL

/**
 * Set cache value
 */
export function setCache(key, value, ttl = DEFAULT_TTL) {
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttl,
  });
}

/**
 * Get cache value
 */
export function getCache(key) {
  const cached = cache.get(key);
  
  if (!cached) {
    return null;
  }
  
  // Check if expired
  if (Date.now() > cached.expiresAt) {
    cache.delete(key);
    return null;
  }
  
  return cached.value;
}

/**
 * Delete cache value
 */
export function deleteCache(key) {
  cache.delete(key);
}

/**
 * Clear all cache
 */
export function clearCache() {
  cache.clear();
}

/**
 * Clean up expired cache entries
 */
export function cleanupExpiredCache() {
  const now = Date.now();
  
  for (const [key, cached] of cache.entries()) {
    if (now > cached.expiresAt) {
      cache.delete(key);
    }
  }
}

// Run cleanup every minute
let cacheCleanupInterval = null;

export function startCacheCleanup() {
  if (cacheCleanupInterval) return;
  cacheCleanupInterval = setInterval(cleanupExpiredCache, 60000);
}

export function stopCacheCleanup() {
  if (cacheCleanupInterval) {
    clearInterval(cacheCleanupInterval);
    cacheCleanupInterval = null;
  }
}

/**
 * Get or set cache with factory function
 */
export async function getOrSetCache(key, factory, ttl = DEFAULT_TTL) {
  const cached = getCache(key);
  
  if (cached !== null) {
    return cached;
  }
  
  const value = await factory();
  setCache(key, value, ttl);
  
  return value;
}

/**
 * Generate cache key for user-specific data
 */
export function generateCacheKey(userId, type, identifier = '') {
  return `${userId}:${type}:${identifier}`;
}
