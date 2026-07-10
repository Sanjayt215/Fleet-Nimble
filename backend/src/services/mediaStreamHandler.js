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
import { mapToOpenAIVoice, buildSystemPrompt } from './receptionistVoice.service.js';

const OPENAI_REALTIME_URL = 'wss://api.openai.com/v1/realtime';
const MAX_RECONNECT_ATTEMPTS = 3;

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
  const maxReconnectAttempts = MAX_RECONNECT_ATTEMPTS;
  let responseTimeout = null;
  let isClosing = false;
  let audioStreamingStarted = false;

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

        case 'start': {
          setStreamSid(callSid, msg.streamSid);
          const start = msg.start || {};
          const session = getSession(callSid);
          if (session) {
            session.metadata = {
              ...session.metadata,
              caller: start.from || null,
              calledNumber: start.to || null,
              from: start.from || null,
              to: start.to || null,
              sessionId: start.callSid || callSid,
            };
          }
          logger.info('TWILIO_MEDIA_STREAM_STARTED', {
            callSid,
            streamSid: msg.streamSid,
            fromTail: start.from ? start.from.slice(-4) : 'unknown',
            toTail: start.to ? start.to.slice(-4) : 'unknown',
          });
          connectToOpenAI();
          break;
        }

        case 'media':
          if (!audioStreamingStarted) {
            audioStreamingStarted = true;
            logger.info('TWILIO_AUDIO_STREAMING_STARTED', { callSid, streamSid: msg.streamSid });
          }
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

export { handleMediaStream, handleOpenAIMessage };