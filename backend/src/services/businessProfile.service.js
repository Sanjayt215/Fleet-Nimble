import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

const PROFILE_CACHE = new Map();
const PROFILE_CACHE_MS = 300000;

/**
 * Business knowledge intelligence — tenant-scoped onboarding profile.
 * Every record belongs to a tenant (userId, optionally companyId).
 * DB failures degrade gracefully (return null) so voice calls never break.
 */
export async function getBusinessProfile({ userId, companyId }) {
  if (!userId) return null;

  const cacheKey = companyId || userId;
  const cached = PROFILE_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.at < PROFILE_CACHE_MS) return cached.value;

  try {
    const where = companyId ? { companyId } : { userId };
    const profile = await prisma.businessProfile.findFirst({
      where,
      orderBy: { updatedAt: 'desc' },
    });
    PROFILE_CACHE.set(cacheKey, { value: profile, at: Date.now() });
    return profile;
  } catch (err) {
    logger.warn('BUSINESS_PROFILE_GET_FAILED', { userId, companyId, error: err.message });
    return null;
  }
}

export async function createBusinessProfile({ userId, companyId, data }) {
  if (!userId) return { error: 'missing_user' };
  if (!data?.businessName) return { error: 'missing_business_name' };

  try {
    const existing = companyId
      ? await prisma.businessProfile.findFirst({ where: { companyId } })
      : await prisma.businessProfile.findFirst({ where: { userId } });

    if (existing) {
      const updated = await prisma.businessProfile.update({
        where: { id: existing.id },
        data: { ...sanitize(data), version: { increment: 1 } },
      });
      invalidateProfile(companyId || userId);
      return { profile: updated, created: false };
    }

    const profile = await prisma.businessProfile.create({
      data: { userId, companyId: companyId || null, ...sanitize(data) },
    });
    invalidateProfile(companyId || userId);
    return { profile, created: true };
  } catch (err) {
    logger.error('BUSINESS_PROFILE_CREATE_FAILED', { userId, companyId, error: err.message });
    return { error: err.message };
  }
}

export async function updateBusinessProfile({ userId, companyId, data }) {
  if (!userId) return { error: 'missing_user' };

  try {
    const existing = companyId
      ? await prisma.businessProfile.findFirst({ where: { companyId } })
      : await prisma.businessProfile.findFirst({ where: { userId } });

    if (!existing) return { error: 'not_found' };

    const profile = await prisma.businessProfile.update({
      where: { id: existing.id },
      data: { ...sanitize(data), version: { increment: 1 } },
    });
    invalidateProfile(companyId || userId);
    return { profile };
  } catch (err) {
    logger.error('BUSINESS_PROFILE_UPDATE_FAILED', { userId, companyId, error: err.message });
    return { error: err.message };
  }
}

export async function upsertBusinessProfile({ userId, companyId, data }) {
  if (!userId) return { error: 'missing_user' };
  if (!data?.businessName) return { error: 'missing_business_name' };
  try {
    const existing = companyId
      ? await prisma.businessProfile.findFirst({ where: { companyId } })
      : await prisma.businessProfile.findFirst({ where: { userId } });

    if (existing) {
      const profile = await prisma.businessProfile.update({
        where: { id: existing.id },
        data: { ...sanitize(data), version: { increment: 1 } },
      });
      invalidateProfile(companyId || userId);
      return { profile };
    }

    const profile = await prisma.businessProfile.create({
      data: { userId, companyId: companyId || null, ...sanitize(data) },
    });
    invalidateProfile(companyId || userId);
    return { profile };
  } catch (err) {
    logger.error('BUSINESS_PROFILE_UPSERT_FAILED', { userId, companyId, error: err.message });
    return { error: err.message };
  }
}

export async function deleteBusinessProfile({ userId, companyId }) {
  if (!userId) return { error: 'missing_user' };
  try {
    const existing = companyId
      ? await prisma.businessProfile.findFirst({ where: { companyId } })
      : await prisma.businessProfile.findFirst({ where: { userId } });
    if (!existing) return { error: 'not_found' };
    await prisma.businessProfile.delete({ where: { id: existing.id } });
    invalidateProfile(companyId || userId);
    return { success: true };
  } catch (err) {
    logger.error('BUSINESS_PROFILE_DELETE_FAILED', { userId, companyId, error: err.message });
    return { error: err.message };
  }
}

function sanitize(data) {
  const pick = (key) => (data[key] !== undefined ? data[key] : undefined);
  const cleaned = {};
  for (const key of ['businessName', 'website', 'industry', 'description', 'products', 'services', 'locations', 'businessHours', 'contact', 'pricing', 'faqs', 'policies', 'bookingRules', 'leadQualificationRules', 'status']) {
    const value = pick(key);
    if (value !== undefined) cleaned[key] = value;
  }
  return cleaned;
}

function invalidateProfile(cacheKey) {
  if (cacheKey) PROFILE_CACHE.delete(cacheKey);
}

export function clearProfileCache() {
  PROFILE_CACHE.clear();
}
