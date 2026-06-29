import { Router } from 'express';
import * as ctrl from '../controllers/aiController.js';
import { authenticate } from '../middleware/auth.js';
import { aiChatLimiter } from '../middleware/rateLimiter.js';

const router = Router();
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
