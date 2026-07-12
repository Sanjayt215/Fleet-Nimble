import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import { config } from '../config/index.js';

let resolvedOwner = null;

export function getResolvedOwner() {
  return resolvedOwner;
}

export async function resolveTenant(input) {
  const { calledNumber, twilioAccountSid } = input;

  logger.info('TENANT_RESOLUTION_START', {
    calledNumberTail: calledNumber ? calledNumber.slice(-4) : 'unknown',
    hasTwilioAccountSid: Boolean(twilioAccountSid),
  });

  // 1. Try to look up AI Receptionist config by called Twilio number
  let userId = null;
  let companyId = null;
  let organizationId = null;
  let source = null;

  try {
    if (calledNumber) {
      const config = await prisma.aiReceptionistConfig.findFirst({
        where: { twilioPhoneNumber: calledNumber },
        select: { userId: true, companyId: true },
      });
      if (config) {
        userId = config.userId;
        companyId = config.companyId;
        source = 'twilio_number';
      }
    }
  } catch (err) {
    logger.warn('TENANT_LOOKUP_BY_NUMBER_FAILED', { error: err.message });
  }

  // 2. Fall back to environment default for single-tenant
  if (!userId) {
    const defaultUserId = process.env.AI_RECEPTIONIST_DEFAULT_USER_ID;
    if (defaultUserId) {
      userId = defaultUserId;
      source = 'env_default';
    }
  }

  if (!companyId) {
    const defaultCompanyId = process.env.AI_RECEPTIONIST_DEFAULT_COMPANY_ID;
    if (defaultCompanyId) {
      companyId = defaultCompanyId;
    }
  }

  // 3. Validate that the resolved userId exists in the database
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
          userIdMasked: userId.slice(-4),
          exists: Boolean(user),
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

export function clearCache() {
  resolvedOwner = null;
}
