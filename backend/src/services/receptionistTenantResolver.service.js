import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import { config } from '../config/index.js';

const TENANT_STATE = {
  userId: null,
  companyId: null,
  source: null,
  ownerValidated: false,
  companyValidated: false,
  persistenceAvailable: false,
};

let lastValidationTime = 0;
const VALIDATION_CACHE_MS = 300000;

const OWNER_CONFIGURED = Boolean(
  config.aiReceptionist?.defaultUserId || process.env.AI_RECEPTIONIST_DEFAULT_USER_ID
);

const COMPANY_CONFIGURED = Boolean(
  config.aiReceptionist?.defaultCompanyId || process.env.AI_RECEPTIONIST_DEFAULT_COMPANY_ID
);

export function getResolvedOwner() {
  return { ...TENANT_STATE };
}

function resolveCompanyId(userRecord) {
  const envCompanyId =
    config.aiReceptionist.defaultCompanyId ||
    process.env.AI_RECEPTIONIST_DEFAULT_COMPANY_ID ||
    null;

  if (envCompanyId) return envCompanyId;
  if (userRecord?.companyId) return userRecord.companyId;
  return null;
}

async function validateCompany(companyId) {
  if (!companyId) return false;
  try {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });
    return Boolean(company);
  } catch {
    return false;
  }
}

async function validateUser(userId) {
  if (!userId) return { valid: false, user: null };
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, companyId: true, deletedAt: true },
    });
    if (!user) return { valid: false, user: null };
    if (user.deletedAt !== null) return { valid: false, user: null };
    return { valid: true, user };
  } catch {
    return { valid: false, user: null };
  }
}

function buildOwnerState(validation) {
  const { userValid, user, companyValid } = validation;
  const userId = userValid && user ? user.id : null;
  const companyId =
    userValid && companyValid
      ? resolveCompanyId(user)
      : null;

  TENANT_STATE.userId = userId;
  TENANT_STATE.companyId = companyId;
  TENANT_STATE.source = userId ? 'environment-default' : null;
  TENANT_STATE.ownerValidated = userValid;
  TENANT_STATE.companyValidated = companyValid;
  TENANT_STATE.persistenceAvailable = userValid && companyValid && Boolean(userId) && Boolean(companyId);
  return { ...TENANT_STATE };
}

export async function resolveTenant(input) {
  const { calledNumber, twilioAccountSid } = input;

  logger.info('TENANT_RESOLUTION_START', {
    calledNumberTail: calledNumber ? calledNumber.slice(-4) : 'unknown',
    hasTwilioAccountSid: Boolean(twilioAccountSid),
  });

  let userId = null;
  let companyId = null;
  let source = null;
  let ownerValidated = false;
  let companyValidated = false;

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

  if (!userId) {
    const defaultUserId =
      config.aiReceptionist.defaultUserId ||
      process.env.AI_RECEPTIONIST_DEFAULT_USER_ID;

    if (defaultUserId) {
      const { valid, user } = await validateUser(defaultUserId);
      if (valid && user) {
        userId = user.id;
        ownerValidated = true;
        source = 'environment-default';

        const resolvedCompanyId = resolveCompanyId(user);
        if (resolvedCompanyId) {
          companyValidated = await validateCompany(resolvedCompanyId);
          if (companyValidated) {
            companyId = resolvedCompanyId;
          }
        }
      }
    }
  }

  if (!ownerValidated && userId) {
    const { valid } = await validateUser(userId);
    ownerValidated = valid;
  }

  if (companyId && !companyValidated) {
    companyValidated = await validateCompany(companyId);
    if (!companyValidated) companyId = null;
  }

  const persistenceAvailable = ownerValidated && companyValidated && Boolean(userId) && Boolean(companyId);

  TENANT_STATE.userId = userId;
  TENANT_STATE.companyId = companyId;
  TENANT_STATE.source = source;
  TENANT_STATE.ownerValidated = ownerValidated;
  TENANT_STATE.companyValidated = companyValidated;
  TENANT_STATE.persistenceAvailable = persistenceAvailable;
  lastValidationTime = Date.now();

  logger.info('TENANT_RESOLUTION_COMPLETE', {
    resolved: persistenceAvailable,
    source: source || 'none',
    ownerValidated,
    companyValidated,
    persistenceAvailable,
  });

  return { ...TENANT_STATE };
}

export function isPersistenceAvailable() {
  return TENANT_STATE.persistenceAvailable;
}

export async function validateOwnerAtStartup() {
  const defaultUserId =
    config.aiReceptionist.defaultUserId ||
    process.env.AI_RECEPTIONIST_DEFAULT_USER_ID;

  if (!defaultUserId) {
    logger.warn('OWNER_VALIDATION_RESULT', {
      ownerConfigured: false,
      ownerValidated: false,
      companyConfigured: false,
      companyValidated: false,
      persistenceAvailable: false,
    });
    return {
      valid: false,
      ownerConfigured: false,
      ownerValidated: false,
      companyConfigured: false,
      companyValidated: false,
      persistenceAvailable: false,
    };
  }

  const { valid: userValid, user } = await validateUser(defaultUserId);

  if (!userValid) {
    logger.warn('OWNER_VALIDATION_RESULT', {
      ownerConfigured: true,
      ownerValidated: false,
      companyConfigured: COMPANY_CONFIGURED,
      companyValidated: false,
      persistenceAvailable: false,
    });
    return {
      valid: false,
      ownerConfigured: true,
      ownerValidated: false,
      companyConfigured: COMPANY_CONFIGURED,
      companyValidated: false,
      persistenceAvailable: false,
    };
  }

  const resolvedCompanyId = resolveCompanyId(user);
  const companyValidated = resolvedCompanyId
    ? await validateCompany(resolvedCompanyId)
    : false;

  TENANT_STATE.userId = user.id;
  TENANT_STATE.companyId = companyValidated ? resolvedCompanyId : null;
  TENANT_STATE.source = 'startup_validation';
  TENANT_STATE.ownerValidated = true;
  TENANT_STATE.companyValidated = companyValidated;
  TENANT_STATE.persistenceAvailable = companyValidated;

  logger.info('OWNER_VALIDATION_RESULT', {
    ownerConfigured: true,
    ownerValidated: true,
    companyConfigured: Boolean(resolvedCompanyId),
    companyValidated,
    persistenceAvailable: companyValidated,
  });

  return {
    valid: companyValidated,
    ownerConfigured: true,
    ownerValidated: true,
    companyConfigured: Boolean(resolvedCompanyId),
    companyValidated,
    persistenceAvailable: companyValidated,
  };
}

export function clearCache() {
  TENANT_STATE.userId = null;
  TENANT_STATE.companyId = null;
  TENANT_STATE.source = null;
  TENANT_STATE.ownerValidated = false;
  TENANT_STATE.companyValidated = false;
  TENANT_STATE.persistenceAvailable = false;
  lastValidationTime = 0;
}
