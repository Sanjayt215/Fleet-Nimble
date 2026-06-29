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
      reply: `FleetNimble AI is online, but the advanced analysis failed temporarily${errorMessage}. Please try again or ask a simpler fleet question.`,
      chatId: chatId || null,
      metadata: {
        title: "FleetNimble AI Assistant",
        confidence: "LOW",
        dataFreshness: "UNKNOWN",
        simulatedNote: null,
        suggestedActions: [
          "Summarize my fleet health",
          "Show critical alerts",
          "Show vehicles needing maintenance",
          "Show offline vehicles"
        ]
      }
    }
  };
}

export async function chat(req, res, next) {
  console.log('AI_REQUEST_START', { userId: req.userId, message: req.body.message?.substring(0, 50) });
  
  let chat;
  let chatId;
  
  try {
    const { message, vehicleId, chatId: providedChatId, stream = false } = req.body;
    const userId = req.userId;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    let chatHistory = [];

    // Get or create chat
    try {
      if (providedChatId) {
        chat = await aiService.getChatWithMessages(providedChatId, userId);
        if (chat && chat.messages) {
          chatHistory = chat.messages.map((m) => ({
            role: m.role,
            content: m.content,
          }));
        }
      } else {
        // Create new chat with title from first message
        const title = message.substring(0, 50) + (message.length > 50 ? '...' : '');
        chat = await aiService.createChat(userId, title);
      }
    } catch (chatError) {
      console.error('AI FAILED AT CHAT CREATION/RETRIEVAL', chatError);
      console.error(chatError.stack);
      // Create a minimal chat object to continue
      chat = { id: 'fallback-' + Date.now() };
    }
    
    chatId = chat.id;

    // Save user message with vehicleId
    try {
      await aiService.saveMessage(chat.id, 'user', message, {
        vehicleId,
      });
    } catch (saveError) {
      console.error('AI FAILED AT SAVE USER MESSAGE', saveError);
      console.error(saveError.stack);
    }

    // Audit log user message
    try {
      await logAiInteraction(userId, chat.id, 'user', message, vehicleId, req);
    } catch (auditError) {
      console.error('AI FAILED AT AUDIT LOG', auditError);
      console.error(auditError.stack);
    }

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
        try {
          await aiService.saveMessage(chat.id, 'assistant', fullResponse, {
            vehicleId,
          });
        } catch (saveError) {
          console.error('AI FAILED AT SAVE AI MESSAGE', saveError);
          console.error(saveError.stack);
        }

        // Audit log AI response
        try {
          await logAiInteraction(userId, chat.id, 'assistant', fullResponse, vehicleId, req);
        } catch (auditError) {
          console.error('AI FAILED AT AUDIT LOG', auditError);
          console.error(auditError.stack);
        }

        res.write('data: [DONE]\n\n');
        res.end();
        console.log('CONTROLLER RESPONSE SENT', { userId, chatId, stream: true });
      } catch (streamError) {
        console.error('AI FAILED AT STREAM', streamError);
        console.error(streamError.stack);
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
        
        console.log('AI ORCHESTRATOR SUCCESS', { userId, chatId });
      } catch (orchestratorError) {
        console.error('AI FAILED AT ORCHESTRATOR', orchestratorError);
        console.error(orchestratorError.stack);
        
        // Return fallback response
        const fallback = getFallbackResponse(chatId, orchestratorError);
        
        // Save fallback response
        try {
          await aiService.saveMessage(chat.id, 'assistant', fallback.data.reply, {
            vehicleId,
            contextSummary: { hasVehicles: false, vehicleCount: 0 },
            metadata: fallback.data.metadata,
          });
        } catch (saveError) {
          console.error('AI FAILED AT SAVE FALLBACK', saveError);
          console.error(saveError.stack);
        }

        // Audit log fallback response
        try {
          await logAiInteraction(userId, chat.id, 'assistant', fallback.data.reply, vehicleId, req);
        } catch (auditError) {
          console.error('AI FAILED AT AUDIT LOG', auditError);
          console.error(auditError.stack);
        }

        console.log('CONTROLLER RESPONSE SENT', { userId, chatId, fallback: true });
        return res.json(fallback);
      }

      // Validate response object
      if (!response) {
        console.error('AI FAILED AT RESPONSE VALIDATION - response is null');
        const fallback = getFallbackResponse(chatId, new Error('Response is null'));
        return res.json(fallback);
      }

      // Save AI response
      try {
        await aiService.saveMessage(chat.id, 'assistant', response, {
          vehicleId,
          contextSummary: {
            vehicleCount: context?.vehicleCount || 0,
            hasVehicles: context?.hasVehicles || false,
          },
          metadata,
        });
      } catch (saveError) {
        console.error('AI FAILED AT SAVE AI RESPONSE', saveError);
        console.error(saveError.stack);
      }

      // Audit log AI response
      try {
        await logAiInteraction(userId, chat.id, 'assistant', response, vehicleId, req);
      } catch (auditError) {
        console.error('AI FAILED AT AUDIT LOG', auditError);
        console.error(auditError.stack);
      }

      // Update chat timestamp
      try {
        await aiService.getChatWithMessages(chat.id, userId);
      } catch (updateError) {
        console.error('AI FAILED AT CHAT UPDATE', updateError);
        console.error(updateError.stack);
      }

      // Standardize response shape with validation
      const safeMetadata = metadata || {
        title: "FleetNimble AI Assistant",
        metrics: {},
        risks: [],
        recommendedAction: null,
        confidence: "MEDIUM",
        dataFreshness: "UNKNOWN",
        simulatedNote: null,
        suggestedActions: [
          "Summarize my fleet health",
          "Show critical alerts",
          "Show vehicles needing maintenance",
          "Show offline vehicles"
        ]
      };

      const responseData = {
        success: true,
        data: {
          reply: response || 'No response generated',
          chatId: chat.id,
          metadata: safeMetadata
        },
      };
      
      console.log('CONTROLLER RESPONSE SENT', { userId, chatId, fallback: false });
      return res.json(responseData);
    }
  } catch (err) {
    console.error('AI FAILED AT CONTROLLER', err);
    console.error(err.stack);
    
    // Always return HTTP 200 with fallback response
    // Auth errors are handled by middleware before reaching here
    const fallback = getFallbackResponse(chatId || null, err);
    console.log('CONTROLLER FALLBACK RESPONSE SENT', { userId: req.userId, chatId });
    return res.json(fallback);
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
