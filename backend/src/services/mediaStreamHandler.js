import WebSocket from 'ws';
import { config } from '../config/index.js';
import logger from '../utils/logger.js';
import {
  registerSession,
  getSession,
  removeSession,
  updateSessionActivity,
  setStreamSid,
  setOpenaiWs,
  addTranscriptEntry,
} from './receptionistRealtime.service.js';
import {
  appendToTranscript,
  saveTranscriptChunk,
} from './receptionistTranscript.service.js';
import { mapToOpenAIVoice, buildSystemPrompt, buildToolDefinitions } from './receptionistVoice.service.js';

const OPENAI_REALTIME_URL = 'wss://api.openai.com/v1/realtime';
const SESSION_TIMEOUT = 30000;

const TOOL_HANDLERS = {
  schedule_appointment: async (args, session, io) => {
    const { getCallAnalytics } = await import('./receptionistAnalytics.service.js');
    const { default: prisma } = await import('../utils/prisma.js');
    const appointmentService = await import('./receptionistAppointment.service.js');

    try {
      const appointment = await appointmentService.createAppointment(
        session.metadata.userId,
        {
          callerName: args.callerName || 'Caller',
          callerPhone: args.callerPhone || null,
          callerEmail: args.callerEmail || null,
          companyName: args.companyName || null,
          fleetSize: args.fleetSize || null,
          meetingPurpose: args.meetingPurpose || 'General inquiry',
          scheduledDate: args.preferredDate || new Date(Date.now() + 86400000).toISOString(),
          durationMinutes: 30,
        }
      );

      if (session.metadata.callLogId) {
        await prisma.aiReceptionistCall.update({
          where: { id: session.metadata.callLogId },
          data: { appointmentId: appointment.id },
        });
      }

      if (io) {
        io.to(`user:${session.metadata.userId}`).emit('tool.called', {
          callSid: session.callSid,
          tool: 'schedule_appointment',
          result: { appointmentId: appointment.id },
        });
      }

      return { success: true, appointmentId: appointment.id };
    } catch (err) {
      logger.error('TOOL_SCHEDULE_APPOINTMENT_ERROR', { error: err.message });
      return { success: false, error: err.message };
    }
  },

  create_support_ticket: async (args, session, io) => {
    const supportService = await import('./receptionistSupport.service.js');
    const { default: prisma } = await import('../utils/prisma.js');

    try {
      const ticket = await supportService.createSupportTicket(
        session.metadata.userId,
        {
          callerName: args.callerName || 'Caller',
          callerPhone: args.callerPhone || null,
          callerEmail: args.callerEmail || null,
          companyName: args.companyName || null,
          issueTitle: args.issueTitle || 'Support request',
          issueDescription: args.issueDescription || null,
          urgency: args.urgency || 'MEDIUM',
        }
      );

      if (session.metadata.callLogId) {
        await prisma.aiReceptionistCall.update({
          where: { id: session.metadata.callLogId },
          data: { supportTicketId: ticket.id },
        });
      }

      if (io) {
        io.to(`user:${session.metadata.userId}`).emit('tool.called', {
          callSid: session.callSid,
          tool: 'create_support_ticket',
          result: { ticketId: ticket.id },
        });
      }

      return { success: true, ticketId: ticket.id };
    } catch (err) {
      logger.error('TOOL_CREATE_TICKET_ERROR', { error: err.message });
      return { success: false, error: err.message };
    }
  },

  lookup_customer: async (args, session) => {
    const memoryService = await import('./receptionistMemory.service.js');
    try {
      const customer = await memoryService.findOrCreateCustomer(
        session.metadata.userId,
        {
          phone: args.phone || null,
          email: args.email || null,
          callerName: null,
          company: null,
          fleetSize: null,
        }
      );
      if (customer) {
        const memory = await memoryService.getCustomerMemory(customer.id);
        return { success: true, customer: memory };
      }
      return { success: false, message: 'Customer not found' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  escalate_to_human: async (args, session, io) => {
    const handoffService = await import('./receptionistHandoff.service.js');
    const { default: prisma } = await import('../utils/prisma.js');

    try {
      const result = await handoffService.escalateCall(
        session.metadata.callLogId,
        args.reason,
        args.department || 'support'
      );

      if (io) {
        io.to(`user:${session.metadata.userId}`).emit('call.escalated', {
          callSid: session.callSid,
          callId: session.metadata.callLogId,
          reason: args.reason,
          department: args.department,
        });
      }

      return { success: true, escalated: true, handoffNumber: result?.handoffNumber };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

function handleMediaStream(ws, req) {
  const urlParams = new URL(req.url, config.publicUrl).searchParams;
  const callSid = urlParams.get('callSid');

  if (!callSid) {
    ws.close(4000, 'Missing callSid');
    return;
  }

  const session = registerSession(callSid, ws, {
    ...(getSession(callSid)?.metadata || {}),
  });

  let openaiWs = null;
  let reconnectAttempts = 0;
  const maxReconnectAttempts = 3;
  let responseTimeout = null;
  let isClosing = false;

  async function connectToOpenAI() {
    if (isClosing) return;

    const voice = mapToOpenAIVoice(config.openai.voice);
    const openaiUrl = `${OPENAI_REALTIME_URL}?model=${config.openai.model}`;

    try {
      openaiWs = new WebSocket(openaiUrl, {
        headers: {
          'Authorization': `Bearer ${config.openai.apiKey}`,
          'OpenAI-Beta': 'realtime=v1',
        },
      });

      setOpenaiWs(callSid, openaiWs);

      openaiWs.on('open', () => {
        logger.info('OPENAI_REALTIME_CONNECTED', { callSid });
        reconnectAttempts = 0;

        const sessionUpdate = {
          type: 'session.update',
          session: {
            modalities: ['text', 'audio'],
            instructions: buildSystemPrompt({ businessName: 'FleetNimble' }),
            voice,
            input_audio_transcription: {
              enabled: true,
              model: 'whisper-1',
            },
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 600,
            },
            tools: buildToolDefinitions(),
            tool_choice: 'auto',
            temperature: 0.7,
          },
        };

        openaiWs.send(JSON.stringify(sessionUpdate));

        openaiWs.send(JSON.stringify({
          type: 'response.create',
          response: {
            modalities: ['text', 'audio'],
            instructions: buildSystemPrompt({ businessName: 'FleetNimble' }),
          },
        }));
      });

      openaiWs.on('message', async (data) => {
        try {
          const msg = JSON.parse(data.toString());
          await handleOpenAIMessage(msg, session, openaiWs);
        } catch (err) {
          logger.error('OPENAI_MESSAGE_PARSE_ERROR', { error: err.message });
        }
      });

      openaiWs.on('close', (code, reason) => {
        logger.warn('OPENAI_REALTIME_DISCONNECTED', { callSid, code, reason: reason?.toString() });
        setOpenaiWs(callSid, null);

        if (!isClosing && reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts++;
          logger.info('OPENAI_RECONNECT_ATTEMPT', { callSid, attempt: reconnectAttempts });
          setTimeout(connectToOpenAI, 2000 * reconnectAttempts);
        }
      });

      openaiWs.on('error', (err) => {
        logger.error('OPENAI_REALTIME_ERROR', { callSid, error: err.message });
      });
    } catch (err) {
      logger.error('OPENAI_CONNECT_ERROR', { callSid, error: err.message });
    }
  }

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      updateSessionActivity(callSid);

      switch (msg.event) {
        case 'connected':
          logger.info('TWILIO_MEDIA_CONNECTED', { callSid });
          if (session.metadata.callLogId) {
            const io = req?.app?.get('io');
            if (io) {
              io.to(`user:${session.metadata.userId}`).emit('call.started', {
                callSid,
                callId: session.metadata.callLogId,
                callerNumber: session.metadata.from,
                status: 'IN_PROGRESS',
                timestamp: new Date().toISOString(),
              });
            }
          }
          break;

        case 'start':
          setStreamSid(callSid, msg.streamSid);
          logger.info('TWILIO_MEDIA_STREAM_STARTED', {
            callSid,
            streamSid: msg.streamSid,
          });
          connectToOpenAI();
          break;

        case 'media':
          if (openaiWs?.readyState === WebSocket.OPEN) {
            openaiWs.send(JSON.stringify({
              type: 'input_audio_buffer.append',
              audio: msg.media.payload,
            }));
          }
          break;

        case 'stop':
          logger.info('TWILIO_MEDIA_STREAM_STOPPED', { callSid });
          cleanup();
          break;

        case 'mark':
          break;
      }
    } catch (err) {
      logger.error('TWILIO_MEDIA_MESSAGE_ERROR', { error: err.message });
    }
  });

  ws.on('close', () => {
    logger.info('TWILIO_MEDIA_WS_CLOSED', { callSid });
    cleanup();
  });

  ws.on('error', (err) => {
    logger.error('TWILIO_MEDIA_WS_ERROR', { callSid, error: err.message });
    cleanup();
  });

  function cleanup() {
    if (isClosing) return;
    isClosing = true;

    if (responseTimeout) clearTimeout(responseTimeout);

    if (openaiWs) {
      try {
        openaiWs.close();
      } catch { }
      setOpenaiWs(callSid, null);
    }

    const s = getSession(callSid);
    if (s?.metadata?.callLogId) {
      saveTranscriptChunk(s.metadata.callLogId, s.transcript);
    }

    removeSession(callSid);
  }
}

async function handleOpenAIMessage(msg, session, openaiWs) {
  const { callSid } = session;
  const io = session.ws?.app?.get('io');

  switch (msg.type) {
    case 'session.created':
      logger.info('OPENAI_SESSION_CREATED', { callSid, sessionId: msg.session?.id });
      break;

    case 'session.updated':
      logger.info('OPENAI_SESSION_UPDATED', { callSid });
      break;

    case 'input_audio_buffer.speech_started':
      if (io) {
        io.to(`user:${session.metadata.userId}`).emit('transcript.partial', {
          callSid,
          text: '...',
          isSpeaking: true,
        });
      }
      break;

    case 'input_audio_buffer.speech_stopped':
      break;

    case 'conversation.item.created':
      if (msg.item?.type === 'message' && msg.item?.content) {
        for (const content of msg.item.content) {
          if (content.type === 'text') {
            const role = msg.item.role === 'user' ? 'caller' : 'assistant';
            addTranscriptEntry(callSid, { role, content: content.text });

            if (session.metadata.callLogId) {
              appendToTranscript(session.metadata.callLogId, role, content.text);
            }
          } else if (content.type === 'transcript') {
            const role = msg.item.role === 'user' ? 'caller' : 'assistant';
            addTranscriptEntry(callSid, { role, content: content.transcript });

            if (io) {
              io.to(`user:${session.metadata.userId}`).emit('transcript.final', {
                callSid,
                role,
                text: content.transcript,
                timestamp: new Date().toISOString(),
              });
            }

            if (session.metadata.callLogId) {
              appendToTranscript(session.metadata.callLogId, role, content.transcript);
            }
          } else if (content.type === 'audio') {
          }
        }
      }
      break;

    case 'conversation.item.truncated':
      break;

    case 'response.audio_transcript.delta':
      if (io) {
        io.to(`user:${session.metadata.userId}`).emit('transcript.partial', {
          callSid,
          text: msg.delta,
          isSpeaking: false,
        });
      }
      break;

    case 'response.audio.delta':
      if (session.ws && session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(JSON.stringify({
          event: 'media',
          streamSid: session.streamSid,
          media: { payload: msg.delta },
        }));
      }
      break;

    case 'response.audio.done':
      break;

    case 'response.done':
      break;

    case 'response.function_call_arguments.done':
      await handleToolCall(msg, session, openaiWs, io);
      break;

    case 'error':
      logger.error('OPENAI_REALTIME_ERROR', {
        callSid,
        error: msg.error?.message || JSON.stringify(msg.error),
      });

      if (session.ws && session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(JSON.stringify({
          event: 'media',
          streamSid: session.streamSid,
          media: { payload: '' },
        }));
      }
      break;

    case 'rate_limits.updated':
      break;
  }
}

async function handleToolCall(msg, session, openaiWs, io) {
  const { name, call_id, arguments: rawArgs } = msg;
  let args = {};

  try {
    args = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs;
  } catch {
    args = {};
  }

  logger.info('TOOL_CALLED', { callSid: session.callSid, tool: name, args });

  if (io) {
    io.to(`user:${session.metadata.userId}`).emit('tool.called', {
      callSid: session.callSid,
      tool: name,
      args,
      timestamp: new Date().toISOString(),
    });
  }

  const handler = TOOL_HANDLERS[name];
  let result;

  if (handler) {
    result = await handler(args, session, io);
  } else {
    result = { success: false, error: `Unknown tool: ${name}` };
  }

  if (openaiWs?.readyState === WebSocket.OPEN) {
    openaiWs.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id,
        output: JSON.stringify(result),
      },
    }));
  }
}

function extractIntentFromResponse(text) {
  const lower = text.toLowerCase();
  if (lower.includes('schedule') || lower.includes('appointment') || lower.includes('demo')) return 'schedule_meeting';
  if (lower.includes('support') || lower.includes('ticket')) return 'support_request';
  if (lower.includes('price') || lower.includes('cost') || lower.includes('pricing')) return 'pricing_question';
  if (lower.includes('emergency') || lower.includes('urgent')) return 'emergency_escalation';
  if (lower.includes('transfer') || lower.includes('human') || lower.includes('person') || lower.includes('manager') || lower.includes('speak to')) return 'human_handoff';
  return 'general_question';
}

export { handleMediaStream, handleOpenAIMessage };