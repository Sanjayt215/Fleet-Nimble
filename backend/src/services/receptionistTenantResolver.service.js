import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import { config } from '../config/index.js';

let resolvedOwner = null;
let lastValidationTime = 0;
const VALIDATION_CACHE_MS = 300000;

export function getResolvedOwner() {
  return resolvedOwner;
}

export async function resolveTenant(input) {
  const { calledNumber, twilioAccountSid } = input;

  logger.info('TENANT_RESOLUTION_START', {
    calledNumberTail: calledNumber ? calledNumber.slice(-4) : 'unknown',
    hasTwilioAccountSid: Boolean(twilioAccountSid),
  });

  let userId = null;
  let companyId = null;
  let organizationId = null;
  let source = null;

  // 1. Try to look up by called Twilio number (multi-tenant)
  if (calledNumber) {
    try {
      const configByPhone = await prisma.aiReceptionistConfig.findFirst({
        where: { twilioPhoneNumber: calledNumber },
        select: { userId: true, companyId: true },
      });
      if (configByPhone) {
        userId = configByPhone.userId;
        companyId = configByPhone.companyId || null;
        source = 'twilio_number';
      }
    } catch (err) {
      logger.warn('TENANT_LOOKUP_BY_NUMBER_FAILED', { error: err.message });
    }
  }

  // 2. Fall back to environment default for single-tenant
  if (!userId) {
    const defaultUserId = config.aiReceptionist.defaultUserId || process.env.AI_RECEPTIONIST_DEFAULT_USER_ID;
    const defaultCompanyId = config.aiReceptionist.defaultCompanyId || process.env.AI_RECEPTIONIST_DEFAULT_COMPANY_ID;

    if (defaultUserId) {
      userId = defaultUserId;
      source = 'env_default';
    }

    if (!companyId && defaultCompanyId) {
      companyId = defaultCompanyId;
    }
  }

  let userIdValid = false;
  if (userId) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, active: true },
      });
      if (user && user.active !== false) {
        userIdValid = true;
      } else {
        logger.warn('TENANT_RESOLVED_USER_INACTIVE', {
          exists: Boolean(user),
          userMasked: userId.slice(-4),
        });
      }
    } catch (err) {
      logger.warn('TENANT_USER_VERIFY_FAILED', { error: err.message });
    }
  }

  resolvedOwner = {
    userId: userIdValid ? userId : null,
    companyId: companyId || null,
    organizationId: organizationId || null,
    source: source || 'none',
    userIdValid,
  };

  lastValidationTime = Date.now();

  logger.info('TENANT_RESOLUTION_COMPLETE', {
    resolved: Boolean(resolvedOwner.userId),
    source: resolvedOwner.source,
    userValid: userIdValid,
  });

  return resolvedOwner;
}

export function isPersistenceAvailable() {
  return Boolean(resolvedOwner?.userId && resolvedOwner?.userIdValid);
}

export async function validateOwnerAtStartup() {
  const defaultUserId = config.aiReceptionist.defaultUserId || process.env.AI_RECEPTIONIST_DEFAULT_USER_ID;
  if (!defaultUserId) {
    logger.warn('RECEPTIONIST_OWNER_NOT_CONFIGURED', { reason: 'AI_RECEPTIONIST_DEFAULT_USER_ID not set' });
    return { valid: false, reason: 'not_configured' };
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: defaultUserId },
      select: { id: true, active: true, name: true, email: true },
    });

    if (!user) {
      logger.error('RECEPTIONIST_OWNER_INVALID', { reason: 'user_not_found' });
      return { valid: false, reason: 'user_not_found' };
    }

    if (user.active === false) {
      logger.error('RECEPTIONIST_OWNER_INVALID', { reason: 'user_inactive' });
      return { valid: false, reason: 'user_inactive' };
    }

    resolvedOwner = {
      userId: user.id,
      companyId: config.aiReceptionist.defaultCompanyId || null,
      organizationId: null,
      source: 'startup_validation',
      userIdValid: true,
    };

    logger.info('OWNER_VALIDATED', {
      source: 'startup_validation',
    });

    return { valid: true, user: { id: user.id, name: user.name } };
  } catch (err) {
    logger.error('RECEPTIONIST_OWNER_VALIDATION_FAILED', { error: err.message });
    return { valid: false, reason: err.message };
  }
}

export function clearCache() {
  resolvedOwner = null;
  lastValidationTime = 0;
}
