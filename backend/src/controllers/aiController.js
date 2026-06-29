import { AppError } from '../middleware/errorHandler.js';
import * as aiService from '../services/aiService.js';
import { generateProactiveInsights } from '../services/aiProactiveInsights.js';
import prisma from '../utils/prisma.js';

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

export async function chat(req, res, next) {
  try {
    const { message, vehicleId, chatId, stream = false } = req.body;
    const userId = req.userId;

    if (!message || message.trim().length === 0) {
      throw new AppError('Message is required', 400, 'VALIDATION_ERROR');
    }

    let chat;
    let chatHistory = [];

    // Get or create chat
    if (chatId) {
      chat = await aiService.getChatWithMessages(chatId, userId);
      chatHistory = chat.messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));
    } else {
      // Create new chat with title from first message
      const title = message.substring(0, 50) + (message.length > 50 ? '...' : '');
      chat = await aiService.createChat(userId, title);
    }

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
      } catch (streamError) {
        res.write(`data: ${JSON.stringify({ error: streamError.message })}\n\n`);
        res.end();
      }
    } else {
      // Non-streaming response
      const { response, context, metadata } = await aiService.processChatMessage(
        userId,
        message,
        vehicleId,
        chatHistory
      );

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

      res.json({
        success: true,
        data: {
          chatId: chat.id,
          response,
          context,
          metadata,
        },
      });
    }
  } catch (err) {
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
