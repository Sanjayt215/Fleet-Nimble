import { AppError } from '../middleware/errorHandler.js';
import * as aiService from '../services/aiService.js';

export async function chat(req, res, next) {
  try {
    const { message, vehicleId, chatId } = req.body;
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

    // Save user message
    await aiService.saveMessage(chat.id, 'user', message, {
      vehicleId,
    });

    // Process with AI
    const { response, context } = await aiService.processChatMessage(
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
    });

    // Update chat timestamp
    await aiService.getChatWithMessages(chat.id, userId); // This will trigger updatedAt

    res.json({
      success: true,
      data: {
        chatId: chat.id,
        response,
        context,
      },
    });
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
