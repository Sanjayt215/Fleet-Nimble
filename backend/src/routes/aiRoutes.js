import { Router } from 'express';
import * as ctrl from '../controllers/aiController.js';
import { authenticate } from '../middleware/auth.js';
import { aiChatLimiter } from '../middleware/rateLimiter.js';
import { config } from '../config/index.js';
import { getProviderInfo } from '../services/ai/aiProvider.js';
import prisma from '../utils/prisma.js';

const router = Router();

// Public health endpoint (no auth required)
router.get('/health', async (_req, res) => {
  if (!config.ai.healthCheckEnabled) {
    return res.json({ status: 'ok', module: 'ai-assistant', healthCheck: 'disabled' });
  }
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'ok',
      module: 'ai-assistant',
      providerMode: config.ai.providerMode,
      provider: config.ai.provider,
      model: config.ai.model,
      memoryEnabled: config.ai.memoryEnabled,
      cacheEnabled: config.ai.cacheEnabled,
      receptionistEnabled: config.ai.receptionistEnabled,
      voiceAgentMode: config.ai.voiceAgentMode,
      memory: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch {
    res.status(503).json({
      status: 'degraded',
      module: 'ai-assistant',
      providerMode: config.ai.providerMode,
      provider: config.ai.provider,
      model: config.ai.model,
      memoryEnabled: config.ai.memoryEnabled,
      cacheEnabled: config.ai.cacheEnabled,
      receptionistEnabled: config.ai.receptionistEnabled,
      voiceAgentMode: config.ai.voiceAgentMode,
      memory: 'disconnected',
      timestamp: new Date().toISOString(),
    });
  }
});

router.use(authenticate);

// POST /api/ai/chat - Send message and get AI response
router.post('/chat', aiChatLimiter, ctrl.chat);

// GET /api/ai/chats - Get all chats for user
router.get('/chats', ctrl.getChats);

// GET /api/ai/chats/:chatId - Get specific chat with messages
router.get('/chats/:chatId', ctrl.getChat);

// DELETE /api/ai/chats/:chatId - Delete a chat
router.delete('/chats/:chatId', ctrl.deleteChat);

// GET /api/ai/insights - Get proactive insights
router.get('/insights', ctrl.getInsights);

export default router;
