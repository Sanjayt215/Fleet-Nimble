import { AppError } from '../middleware/errorHandler.js';
import * as aiService from '../services/aiService.js';
import { generateProactiveInsights } from '../services/aiProactiveInsights.js';
import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

// Audit logging helper
async function logAiInteraction(userId, chatId, messageType, content, vehicleId, req) {
  try {
    await prisma.aiAuditLog.create({
      data: {
        userId,
        chatId,
        messageType,
        content,
        vehicleId,
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.get('user-agent'),
      },
    });
  } catch (error) {
    // Don't fail the request if audit logging fails
    console.error('Audit logging failed:', error);
  }
}

// Fallback response generator
function getFallbackResponse(chatId, error = null) {
  const errorMessage = error ? ` Error: ${error.message}` : '';
  return {
    success: true,
    data: {
      reply: `I could not complete the advanced analysis right now${errorMessage}. The AI Assistant is online. Please try a simpler fleet question.`,
      chatId,
      metadata: {
        title: "AI Assistant",
        metrics: {},
        risks: [],
        recommendedAction: "Try a simpler question",
        confidence: "LOW",
        dataFreshness: "UNKNOWN",
        simulatedNote: null,
        suggestedActions: []
      }
    }
  };
}

export async function chat(req, res, next) {
  logger.info('AI_CHAT_START', { userId: req.userId, message: req.body.message?.substring(0, 50) });
  
  let chat;
  let chatId;
  
  try {
    const { message, vehicleId, chatId: providedChatId, stream = false } = req.body;
    const userId = req.userId;

    if (!message || message.trim().length === 0) {
      throw new AppError('Message is required', 400, 'VALIDATION_ERROR');
    }

    let chatHistory = [];

    // Get or create chat
    if (providedChatId) {
      chat = await aiService.getChatWithMessages(providedChatId, userId);
      chatHistory = chat.messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));
    } else {
      // Create new chat with title from first message
      const title = message.substring(0, 50) + (message.length > 50 ? '...' : '');
      chat = await aiService.createChat(userId, title);
    }
    
    chatId = chat.id;

    // Save user message with vehicleId
    await aiService.saveMessage(chat.id, 'user', message, {
      vehicleId,
    });

    // Audit log user message
    await logAiInteraction(userId, chat.id, 'user', message, vehicleId, req);

    // Streaming response
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      let fullResponse = '';

      const onChunk = (chunk) => {
        fullResponse += chunk;
        res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
      };

      try {
        await aiService.processChatMessageStream(
          userId,
          message,
          vehicleId,
          chatHistory,
          onChunk
        );

        // Save complete AI response
        await aiService.saveMessage(chat.id, 'assistant', fullResponse, {
          vehicleId,
        });

        // Audit log AI response
        await logAiInteraction(userId, chat.id, 'assistant', fullResponse, vehicleId, req);

        res.write('data: [DONE]\n\n');
        res.end();
        logger.info('AI_RESPONSE_SENT', { userId, chatId, stream: true });
      } catch (streamError) {
        logger.error('AI_STREAM_ERROR', { userId, chatId, error: streamError.message });
        res.write(`data: ${JSON.stringify({ error: streamError.message })}\n\n`);
        res.end();
      }
    } else {
      // Non-streaming response with timeout protection
      let response, context, metadata;
      
      try {
        const result = await Promise.race([
          aiService.processChatMessage(userId, message, vehicleId, chatHistory),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('AI Orchestrator timeout after 20 seconds')), 20000)
          )
        ]);
        
        response = result.response;
        context = result.context;
        metadata = result.metadata;
        
        logger.info('AI_ORCHESTRATOR_SUCCESS', { userId, chatId });
      } catch (orchestratorError) {
        logger.error('AI_ORCHESTRATOR_ERROR', { userId, chatId, error: orchestratorError.message });
        
        // Return fallback response
        const fallback = getFallbackResponse(chatId, orchestratorError);
        
        // Save fallback response
        await aiService.saveMessage(chat.id, 'assistant', fallback.data.reply, {
          vehicleId,
          contextSummary: { hasVehicles: false, vehicleCount: 0 },
          metadata: fallback.data.metadata,
        });

        // Audit log fallback response
        await logAiInteraction(userId, chat.id, 'assistant', fallback.data.reply, vehicleId, req);

        logger.info('AI_RESPONSE_SENT', { userId, chatId, fallback: true });
        return res.json(fallback);
      }

      // Save AI response
      await aiService.saveMessage(chat.id, 'assistant', response, {
        vehicleId,
        contextSummary: {
          vehicleCount: context.vehicleCount,
          hasVehicles: context.hasVehicles,
        },
        metadata,
      });

      // Audit log AI response
      await logAiInteraction(userId, chat.id, 'assistant', response, vehicleId, req);

      // Update chat timestamp
      await aiService.getChatWithMessages(chat.id, userId);

      // Standardize response shape
      res.json({
        success: true,
        data: {
          reply: response,
          chatId: chat.id,
          metadata: metadata || {
            title: "AI Assistant",
            metrics: {},
            risks: [],
            recommendedAction: null,
            confidence: "MEDIUM",
            dataFreshness: "UNKNOWN",
            simulatedNote: null,
            suggestedActions: []
          }
        },
      });
      
      logger.info('AI_RESPONSE_SENT', { userId, chatId, fallback: false });
    }
  } catch (err) {
    logger.error('AI_CHAT_ERROR', { userId: req.userId, chatId, error: err.message });
    
    // If we have a chatId, return fallback response
    if (chatId) {
      try {
        const fallback = getFallbackResponse(chatId, err);
        return res.json(fallback);
      } catch (fallbackError) {
        logger.error('FALLBACK_ERROR', { error: fallbackError.message });
      }
    }
    
    next(err);
  }
}

export async function getChats(req, res, next) {
  try {
    const userId = req.userId;
    const chats = await aiService.getUserChats(userId);

    res.json({
      success: true,
      data: chats,
    });
  } catch (err) {
    next(err);
  }
}

export async function getChat(req, res, next) {
  try {
    const { chatId } = req.params;
    const userId = req.userId;

    const chat = await aiService.getChatWithMessages(chatId, userId);

    res.json({
      success: true,
      data: chat,
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteChat(req, res, next) {
  try {
    const { chatId } = req.params;
    const userId = req.userId;

    await aiService.deleteChat(chatId, userId);

    res.json({
      success: true,
      message: 'Chat deleted',
    });
  } catch (err) {
    next(err);
  }
}

export async function getInsights(req, res, next) {
  try {
    const userId = req.userId;
    const insights = await generateProactiveInsights(userId);

    res.json({
      success: true,
      data: insights,
    });
  } catch (err) {
    next(err);
  }
}
