import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import { AppError } from '../middleware/errorHandler.js';
import * as businessProfileService from '../services/businessProfile.service.js';
import * as businessKnowledgeService from '../services/businessKnowledge.service.js';
import * as agentConfigService from '../services/agentConfig.service.js';
import { answerKnowledgeQuestion } from '../services/receptionistQA.service.js';
import { buildReceptionistPlan } from '../fleetBrain/receptionistPlanner.service.js';
import { NEW_TOOL_DEFINITIONS, getNewToolNames } from '../services/toolRegistry.service.js';

// ── Business Profile (Phase 3 — Business Onboarding) ──

export async function getBusinessProfile(req, res, next) {
  try {
    const profile = await businessProfileService.getBusinessProfile({ userId: req.userId, companyId: req.user.companyId });
    res.json({ success: true, data: profile });
  } catch (err) { next(err); }
}

export async function createBusinessProfile(req, res, next) {
  try {
    const result = await businessProfileService.createBusinessProfile({ userId: req.userId, companyId: req.user.companyId, data: req.body });
    if (result.error) throw new AppError(result.error === 'missing_business_name' ? 'Business name is required' : result.message || result.error, 400);
    res.status(201).json({ success: true, data: result.profile, created: result.created });
  } catch (err) { next(err); }
}

export async function updateBusinessProfile(req, res, next) {
  try {
    const result = await businessProfileService.updateBusinessProfile({ userId: req.userId, companyId: req.user.companyId, data: req.body });
    if (result.error) throw new AppError(result.error === 'not_found' ? 'Business profile not found' : result.error, result.error === 'not_found' ? 404 : 400);
    res.json({ success: true, data: result.profile });
  } catch (err) { next(err); }
}

export async function deleteBusinessProfile(req, res, next) {
  try {
    const result = await businessProfileService.deleteBusinessProfile({ userId: req.userId, companyId: req.user.companyId });
    if (result.error) throw new AppError(result.error === 'not_found' ? 'Business profile not found' : result.error, result.error === 'not_found' ? 404 : 400);
    res.json({ success: true, data: { deleted: true } });
  } catch (err) { next(err); }
}

// ── Business Knowledge Documents (Phase 2/4 — Website & manual ingestion) ──

export async function listDocuments(req, res, next) {
  try {
    const { status, category, page = '1', limit = '20' } = req.query;
    const result = await businessKnowledgeService.getDocuments({
      userId: req.userId,
      companyId: req.user.companyId,
      status,
      category,
      page: parseInt(page, 10),
      limit: Math.min(parseInt(limit, 10), 100),
    });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function getDocument(req, res, next) {
  try {
    const document = await businessKnowledgeService.getDocumentById(req.userId, req.params.id, req.user.companyId);
    if (!document) throw new AppError('Document not found', 404, 'NOT_FOUND');
    res.json({ success: true, data: document });
  } catch (err) { next(err); }
}

export async function createDocument(req, res, next) {
  try {
    const result = await businessKnowledgeService.createDocument({ userId: req.userId, companyId: req.user.companyId, data: req.body });
    if (result.error) throw new AppError(result.error === 'missing_title_or_content' ? 'Title and content are required' : result.error, 400);
    res.status(201).json({ success: true, data: result.document, chunkCount: result.chunkCount });
  } catch (err) { next(err); }
}

export async function updateDocument(req, res, next) {
  try {
    const result = await businessKnowledgeService.updateDocument({ userId: req.userId, companyId: req.user.companyId, documentId: req.params.id, data: req.body });
    if (result.error) throw new AppError(result.error === 'not_found' ? 'Document not found' : result.error, result.error === 'not_found' ? 404 : 400);
    res.json({ success: true, data: result.document });
  } catch (err) { next(err); }
}

export async function deleteDocument(req, res, next) {
  try {
    const result = await businessKnowledgeService.deleteDocument({ userId: req.userId, companyId: req.user.companyId, documentId: req.params.id });
    if (result.error) throw new AppError(result.error === 'not_found' ? 'Document not found' : result.error, result.error === 'not_found' ? 404 : 400);
    res.json({ success: true, data: { deleted: true } });
  } catch (err) { next(err); }
}

export async function approveDocument(req, res, next) {
  try {
    const result = await businessKnowledgeService.approveDocument({ userId: req.userId, companyId: req.user.companyId, documentId: req.params.id });
    if (result.error) throw new AppError(result.error === 'not_found' ? 'Document not found' : result.error, result.error === 'not_found' ? 404 : 400);
    res.json({ success: true, data: result.document });
  } catch (err) { next(err); }
}

// ── Agent Configuration (Phase 3/5 — Agent Setup) ──

export async function getAgentConfig(req, res, next) {
  try {
    const agentConfig = await agentConfigService.getAgentConfig({ userId: req.userId, companyId: req.user.companyId, phoneNumber: req.query.phoneNumber || null });
    res.json({ success: true, data: agentConfig });
  } catch (err) { next(err); }
}

export async function updateAgentConfig(req, res, next) {
  try {
    const result = await agentConfigService.upsertAgentConfig({ userId: req.userId, companyId: req.user.companyId, phoneNumber: req.body.phoneNumber || null, data: req.body });
    if (result.error) throw new AppError(result.message || result.error, result.error === 'greeting_protected' ? 400 : 400);
    res.json({ success: true, data: result.agentConfig });
  } catch (err) { next(err); }
}

export async function updateGreeting(req, res, next) {
  try {
    const result = await agentConfigService.setGreeting({
      userId: req.userId,
      companyId: req.user.companyId,
      phoneNumber: req.body.phoneNumber || null,
      greetingMessage: req.body.greetingMessage,
    });
    if (result.error) throw new AppError(result.message || result.error, 400);
    res.json({ success: true, data: result.agentConfig });
  } catch (err) { next(err); }
}

// ── Test Your AI (Phase 13) ──

export async function testYourAI(req, res, next) {
  try {
    const { message, sessionContext = {}, useBrain = false } = req.body;
    if (!message || typeof message !== 'string') throw new AppError('Message is required', 400);

    if (useBrain) {
      const plan = await buildReceptionistPlan({
        userId: req.userId,
        companyId: req.user.companyId,
        message,
        session: { ...sessionContext, companyId: req.user.companyId },
        channel: 'text',
      });
      res.json({ success: true, data: plan });
      return;
    }

    const result = await answerKnowledgeQuestion({
      userId: req.userId,
      companyId: req.user.companyId,
      message,
      sessionContext: { ...sessionContext, conversationMode: sessionContext.conversationMode || 'both' },
    });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

// ── Observability (Phase 12) ──

export async function listInteractions(req, res, next) {
  try {
    const { page = '1', limit = '20', intent, channel, success } = req.query;
    const pageNum = parseInt(page, 10);
    const limitNum = Math.min(parseInt(limit, 10), 100);
    const where = { companyId: req.user.companyId || req.userId };
    if (intent) where.intent = intent;
    if (channel) where.channel = channel;
    if (success !== undefined) where.success = success === 'true';

    const [items, total] = await Promise.all([
      prisma.aiInteractionLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (pageNum - 1) * limitNum, take: limitNum }),
      prisma.aiInteractionLog.count({ where }),
    ]);
    res.json({ success: true, data: { items, total, page: pageNum, limit: limitNum } });
  } catch (err) { next(err); }
}

export async function getBusinessAnalytics(req, res, next) {
  try {
    const days = Math.min(parseInt(req.query.days || '30', 10), 365);
    const since = new Date();
    since.setDate(since.getDate() - days);

    const where = { companyId: req.user.companyId || req.userId, createdAt: { gte: since } };

    const [total, successful, handoffs, bookings, leads, byIntent, byChannel] = await Promise.all([
      prisma.aiInteractionLog.count({ where }),
      prisma.aiInteractionLog.count({ where: { ...where, success: true } }),
      prisma.aiInteractionLog.count({ where: { ...where, handoff: true } }),
      prisma.aiInteractionLog.count({ where: { ...where, booking: true } }),
      prisma.aiInteractionLog.count({ where: { ...where, leadCreation: true } }),
      prisma.aiInteractionLog.groupBy({ by: ['intent'], where, _count: { _all: true } }),
      prisma.aiInteractionLog.groupBy({ by: ['channel'], where, _count: { _all: true } }),
    ]);

    res.json({
      success: true,
      data: {
        total,
        successful,
        successRate: total > 0 ? Math.round((successful / total) * 100) : 0,
        handoffs,
        bookings,
        leads,
        byIntent: byIntent.map((row) => ({ intent: row.intent, count: row._count._all })),
        byChannel: byChannel.map((row) => ({ channel: row.channel, count: row._count._all })),
        days,
      },
    });
  } catch (err) { next(err); }
}

// ── Controlled tools introspection ──

export async function listControlledTools(_req, res, next) {
  try {
    res.json({
      success: true,
      data: {
        tools: NEW_TOOL_DEFINITIONS,
        names: getNewToolNames(),
      },
    });
  } catch (err) { next(err); }
}
