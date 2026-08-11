import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import { config } from '../config/index.js';
import { AI_RECEPTIONIST_GREETING } from './receptionistVoice.service.js';

const CONFIG_CACHE = new Map();
const CONFIG_CACHE_MS = 300000;

const DEFAULT_CONFIG = {
  agentName: 'FleetNimble AI Receptionist',
  voiceId: config.realtime?.voice || 'Puck',
  language: 'en',
  tone: 'professional',
  personality: 'Warm, professional, concise and helpful',
  greetingMessage: AI_RECEPTIONIST_GREETING,
  businessContext: null,
  knowledgeSourceIds: [],
  primaryGoal: 'Answer caller questions accurately and book qualified demos',
  secondaryGoals: [],
  qualificationQuestions: [],
  bookingRules: {},
  transferRules: {},
  fallbackBehavior: {},
  workingHours: {},
  phoneNumber: null,
  greetingProtected: true,
  enabled: true,
};

/**
 * Agent configuration — one per tenant/phone number (multi-tenant, Alivo-style).
 * Greeting protection: unless an admin has explicitly replaced the greeting,
 * an empty greeting update is rejected so callers always get a professional
 * opening message.
 */
export async function getAgentConfig({ userId, companyId, phoneNumber }) {
  const cacheKey = phoneNumber || companyId || userId;
  if (!cacheKey) return { ...DEFAULT_CONFIG, isDefault: true };

  const cached = CONFIG_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.at < CONFIG_CACHE_MS) return cached.value;

  try {
    const or = [];
    if (companyId) or.push({ companyId });
    if (userId) or.push({ userId });
    if (phoneNumber) or.push({ phoneNumber });
    if (or.length === 0) return { ...DEFAULT_CONFIG, isDefault: true };

    const agentConfig = await prisma.agentConfig.findFirst({
      where: { OR: or },
      orderBy: { updatedAt: 'desc' },
    });

    if (!agentConfig) return { ...DEFAULT_CONFIG, isDefault: true };

    const normalized = { ...DEFAULT_CONFIG, ...agentConfig, isDefault: false };
    CONFIG_CACHE.set(cacheKey, { value: normalized, at: Date.now() });
    return normalized;
  } catch (err) {
    logger.warn('AGENT_CONFIG_GET_FAILED', { userId, companyId, phoneNumber, error: err.message });
    return { ...DEFAULT_CONFIG, isDefault: true };
  }
}

export async function upsertAgentConfig({ userId, companyId, phoneNumber, data }) {
  if (!userId) return { error: 'missing_user' };

  const clean = sanitizeConfig(data);

  try {
    const or = [];
    if (companyId) or.push({ companyId });
    if (userId) or.push({ userId });
    if (phoneNumber) or.push({ phoneNumber });

    const existing = or.length > 0
      ? await prisma.agentConfig.findFirst({ where: { OR: or }, orderBy: { updatedAt: 'desc' } })
      : null;

    if (existing) {
      if (existing.greetingProtected && clean.greetingMessage === '') {
        return { error: 'greeting_protected', message: 'The greeting cannot be empty. A professional greeting is always required.' };
      }
      if (clean.greetingMessage && clean.greetingMessage !== existing.greetingMessage) {
        clean.greetingProtected = false;
      }

      const agentConfig = await prisma.agentConfig.update({
        where: { id: existing.id },
        data: { ...clean, userId, companyId: companyId || existing.companyId || null, phoneNumber: phoneNumber || existing.phoneNumber || null },
      });
      invalidateConfig(phoneNumber || companyId || userId);
      return { agentConfig };
    }

    if (!clean.greetingMessage) clean.greetingMessage = AI_RECEPTIONIST_GREETING;

    const agentConfig = await prisma.agentConfig.create({
      data: { userId, companyId: companyId || null, phoneNumber: phoneNumber || null, ...clean },
    });
    invalidateConfig(phoneNumber || companyId || userId);
    return { agentConfig };
  } catch (err) {
    logger.error('AGENT_CONFIG_UPSERT_FAILED', { userId, companyId, error: err.message });
    return { error: err.message };
  }
}

export async function updateAgentConfig({ userId, companyId, phoneNumber, data }) {
  return upsertAgentConfig({ userId, companyId, phoneNumber, data });
}

export async function getGreeting({ userId, companyId, phoneNumber }) {
  const agentConfig = await getAgentConfig({ userId, companyId, phoneNumber });
  return agentConfig.greetingMessage || AI_RECEPTIONIST_GREETING;
}

export async function setGreeting({ userId, companyId, phoneNumber, greetingMessage }) {
  if (!greetingMessage || !String(greetingMessage).trim()) {
    return { error: 'greeting_protected', message: 'The greeting cannot be empty. A professional greeting is always required.' };
  }
  return upsertAgentConfig({ userId, companyId, phoneNumber, data: { greetingMessage: String(greetingMessage).trim() } });
}

function sanitizeConfig(data) {
  if (!data || typeof data !== 'object') return {};
  const clean = {};
  for (const key of ['agentName', 'voiceId', 'language', 'tone', 'personality', 'greetingMessage', 'businessContext', 'knowledgeSourceIds', 'primaryGoal', 'secondaryGoals', 'qualificationQuestions', 'bookingRules', 'transferRules', 'fallbackBehavior', 'workingHours', 'phoneNumber', 'enabled']) {
    if (data[key] !== undefined) clean[key] = data[key];
  }
  if (clean.greetingMessage !== undefined) {
    clean.greetingMessage = String(clean.greetingMessage).trim();
  }
  return clean;
}

function invalidateConfig(cacheKey) {
  if (cacheKey) CONFIG_CACHE.delete(cacheKey);
}

export function clearAgentConfigCache() {
  CONFIG_CACHE.clear();
}
