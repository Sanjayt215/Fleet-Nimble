import WebSocket from 'ws';
import { config } from '../config/index.js';
import logger from '../utils/logger.js';
import { RealtimeSessionManager } from './realtimeSessionManager.js';
import { RealtimeModelValidator } from './realtimeModelValidator.js';
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
import { mapToOpenAIVoice, buildSystemPrompt, AI_RECEPTIONIST_GREETING } from './receptionistVoice.service.js';

const OPENAI_REALTIME_URL = 'wss://api.openai.com/v1/realtime';
const MAX_RECONNECT_ATTEMPTS = 3;
const SESSION_CREATED_TIMEOUT_MS = 15000;

function buildOpenAiUrl() {
  return `${OPENAI_REALTIME_URL}?model=${encodeURIComponent(config.realtime.model)}`;
}

function validateAudioPayload(payload) {
  if (typeof payload !== 'string' || payload.length === 0) {
    return { valid: false, reason: 'empty_or_nonstring' };
  }
  try {
    const decoded = atob(payload);
    return { valid: true, byteLength: decoded.length };
  } catch {
    return { valid: false, reason: 'invalid_base64' };
  }
}

function handleMediaStream(ws, req) {
  const urlParams = new URL(req.url, config.publicUrl).searchParams;
  const urlCallSid = urlParams.get('callSid') || null;

  let callSid = urlCallSid;
  let rtmSession = null;
  let legacySession = null;
  let openaiWs = null;
  let reconnectAttempts = 0;
  let isClosing = false;
  let audioBridgeActive = false;
  let greetingSent = false;
  let sessionCreatedTimer = null;
  const timers = [];

  function scheduleTimer(fn, ms) {
    const handle = setTimeout(() => {
      try {
        fn();
      } catch (e) {
        logger.error('TIMER_ERROR', { callSid, error: e.message });
      }
    }, ms);
    timers.push(handle);
    return handle;
  }

  function clearTimers() {
    while (timers.length) {
      const handle = timers.pop();
      try {
        clearTimeout(handle);
        clearInterval(handle);
      } catch { }
    }
  }

  function sendGreeting() {
    if (greetingSent) return;
    greetingSent = true;
    if (rtmSession) {
      rtmSession.greetingSent = true;
      rtmSession.setState(RealtimeSessionManager.STATES.GREETING);
    }
    if (openaiWs?.readyState === WebSocket.OPEN) {
      const greetingPayload = {
        type: 'response.create',
        response: {
          modalities: ['text', 'audio'],
          instructions: `Say exactly: "${AI_RECEPTIONIST_GREETING}"`,
        },
      };
      openaiWs.send(JSON.stringify(greetingPayload));
      logger.info('AI_GREETING_REQUESTED', {
        callSid,
        greetingText: AI_RECEPTIONIST_GREETING,
      });
    }
  }

  function connectToOpenAI() {
    if (isClosing || !callSid) return;

    if (!config.realtime.configured) {
      logger.error('REALTIME_CALL_FAILED', { callSid, reason: 'realtime_not_configured' });
      gracefulClose();
      return;
    }

    const modelValid = RealtimeModelValidator.validate(config.realtime.model);
    if (!modelValid.valid) {
      logger.error('REALTIME_CALL_FAILED', {
        callSid,
        reason: 'model_validation_failed',
        model: config.realtime.model,
        validation: modelValid,
      });
      gracefulClose();
      return;
    }

    if (rtmSession) rtmSession.setState(RealtimeSessionManager.STATES.CONNECTING);
    logger.info('OPENAI_REALTIME_CONNECTING', { callSid });
    const voice = mapToOpenAIVoice(config.realtime.voice);
    const openaiUrl = buildOpenAiUrl();

    try {
      openaiWs = new WebSocket(openaiUrl, {
        headers: {
          Authorization: `Bearer ${config.openai.apiKey}`,
          'OpenAI-Beta': 'realtime=v1',
        },
      });
      if (rtmSession) rtmSession.openAiSocket = openaiWs;
      if (legacySession) setOpenaiWs(callSid, openaiWs);
    } catch (err) {
      logger.error('REALTIME_CALL_FAILED', { callSid, reason: 'openai_connect_error', error: err.message });
      gracefulClose();
      return;
    }

    openaiWs.on('open', () => {
      if (isClosing) return;
      logger.info('OPENAI_REALTIME_CONNECTED', { callSid });
      reconnectAttempts = 0;

      const sessionUpdatePayload = {
        type: 'session.update',
        session: {
          modalities: ['text', 'audio'],
          instructions: buildSystemPrompt({ businessName: 'FleetNimble' }),
          voice,
          input_audio_format: 'g711_ulaw',
          output_audio_format: 'g711_ulaw',
          input_audio_transcription: { enabled: true, model: 'whisper-1' },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 600,
            interrupt_response: true,
          },
          temperature: 0.7,
        },
      };
      openaiWs.send(JSON.stringify(sessionUpdatePayload));

      sessionCreatedTimer = setTimeout(() => {
        if (isClosing) return;
        logger.error('SESSION_CREATED_TIMEOUT', {
          callSid,
          timeoutMs: SESSION_CREATED_TIMEOUT_MS,
        });
        RealtimeModelValidator.markFailed(config.realtime.model, 'session.created timeout');
        gracefulClose();
      }, SESSION_CREATED_TIMEOUT_MS);
    });

    openaiWs.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.type === 'session.created') {
          if (sessionCreatedTimer) {
            clearTimeout(sessionCreatedTimer);
            sessionCreatedTimer = null;
          }
          RealtimeModelValidator.markSucceeded(config.realtime.model);
          logger.info('OPENAI_SESSION_CREATED', {
            callSid,
            sessionId: msg.session?.id,
            model: msg.session?.model || config.realtime.model,
          });
          if (rtmSession) rtmSession.setState(RealtimeSessionManager.STATES.CONNECTED);
          sendGreeting();
        }

        await handleOpenAIMessage(msg, rtmSession, legacySession, openaiWs);
      } catch (err) {
        logger.error('OPENAI_MESSAGE_PARSE_ERROR', { callSid, error: err.message });
      }
    });

    openaiWs.on('close', (code, reason) => {
      logger.warn('OPENAI_REALTIME_CLOSED', { callSid, code, reason: reason?.toString() });
      if (legacySession) setOpenaiWs(callSid, null);
      if (rtmSession) rtmSession.openAiSocket = null;

      if (isClosing) return;
      if (legacySession?.stopReconnect || rtmSession?.stopReconnect) {
        gracefulClose();
        return;
      }
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        if (rtmSession) rtmSession.reconnectCount = reconnectAttempts;
        logger.info('OPENAI_RECONNECT_ATTEMPT', { callSid, attempt: reconnectAttempts });
        scheduleTimer(connectToOpenAI, 2000 * reconnectAttempts);
      } else {
        gracefulClose();
      }
    });

    openaiWs.on('error', (err) => {
      logger.error('OPENAI_REALTIME_ERROR', { callSid, error: err.message });
      if (!isClosing && (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS || legacySession?.stopReconnect || rtmSession?.stopReconnect)) {
        gracefulClose();
      }
    });
  }

  function gracefulClose() {
    if (isClosing) return;
    isClosing = true;
    if (rtmSession) rtmSession.setState(RealtimeSessionManager.STATES.CLOSING);
    clearTimers();
    if (sessionCreatedTimer) {
      clearTimeout(sessionCreatedTimer);
      sessionCreatedTimer = null;
    }

    try {
      if (openaiWs && openaiWs.readyState !== WebSocket.CLOSED) openaiWs.close();
    } catch { }
    if (legacySession) setOpenaiWs(callSid, null);
    if (rtmSession) rtmSession.openAiSocket = null;

    try {
      if (ws && ws.readyState !== WebSocket.CLOSED) ws.close();
    } catch { }

    if (callSid) {
      const startedAt = rtmSession?.startedAt || legacySession?.startedAt || null;
      if (legacySession) removeSession(callSid);
      if (rtmSession) RealtimeSessionManager.remove(callSid);
      if (rtmSession) rtmSession.setState(RealtimeSessionManager.STATES.CLOSED);
      logger.info('CALL_SESSION_CLEANED', { callSid });
      logger.info('DIAG_CALL_ENDED', {
        callSid,
        totalDurationMs: startedAt ? (Date.now() - startedAt) : 0,
        audioBridgeWasActive: audioBridgeActive,
        reconnectAttempts,
      });
    } else {
      logger.info('CALL_SESSION_CLEANED', { callSid: null });
    }
  }

  function endCallGracefully(message) {
    if (isClosing) return;
    if (!openaiWs || openaiWs.readyState !== WebSocket.OPEN) {
      gracefulClose();
      return;
    }
    try {
      openaiWs.send(JSON.stringify({
        type: 'response.create',
        response: { modalities: ['text', 'audio'], instructions: `Say exactly: "${message}"` },
      }));
    } catch { }
    scheduleTimer(gracefulClose, 4000);
  }

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      logger.warn('TWILIO_MEDIA_MESSAGE_ERROR', { callSid, error: 'malformed_json' });
      return;
    }
    if (!msg || typeof msg.event !== 'string') {
      logger.warn('TWILIO_MEDIA_MESSAGE_ERROR', { callSid, error: 'missing_event' });
      return;
    }
    updateSessionActivity(callSid);
    if (rtmSession) rtmSession.updateActivity();

    switch (msg.event) {
      case 'connected':
        logger.info('TWILIO_MEDIA_CONNECTED', { callSid });
        break;

      case 'start': {
        const start = msg.start || {};
        const params = start.customParameters || {};
        callSid = callSid || params.callSid || start.callSid || null;

        if (!callSid) {
          logger.error('REALTIME_CALL_FAILED', { reason: 'missing_callSid' });
          try { ws.close(4000, 'Missing callSid'); } catch { }
          return;
        }

        const streamSid = start.streamSid || null;
        if (!streamSid) {
          logger.warn('TWILIO_MEDIA_STARTED', { callSid, warning: 'missing_streamSid' });
        }

        rtmSession = RealtimeSessionManager.create(callSid, ws, {
          from: params.from || start.from || null,
          to: params.to || start.to || null,
          caller: params.from || start.from || null,
          calledNumber: params.to || start.to || null,
          sessionId: start.callSid || callSid,
        });
        rtmSession.streamSid = streamSid;

        setStreamSid(callSid, streamSid);
        legacySession = registerSession(callSid, ws, {
          from: params.from || start.from || null,
          to: params.to || start.to || null,
          caller: params.from || start.from || null,
          calledNumber: params.to || start.to || null,
          sessionId: start.callSid || callSid,
        });
        legacySession.streamSid = streamSid;
        legacySession.timers = timers;

        logger.info('TWILIO_MEDIA_STARTED', {
          callSid,
          streamSid,
          fromTail: (params.from || start.from || '').slice(-4) || 'unknown',
        });

        scheduleTimer(() => {
          endCallGracefully('Thank you for calling FleetNimble. Please contact us again if you need further help. Goodbye.');
        }, config.realtime.maxCallSeconds * 1000);

        const silenceMs = Math.max(5000, config.realtime.silenceTimeoutSeconds * 1000);
        const silenceInterval = setInterval(() => {
          if (isClosing || !rtmSession) return;
          if (Date.now() - rtmSession.lastActivity > config.realtime.silenceTimeoutSeconds * 1000) {
            endCallGracefully('Thank you for calling FleetNimble. Please contact us again if you need further help. Goodbye.');
          }
        }, silenceMs);
        timers.push(silenceInterval);

        connectToOpenAI();
        break;
      }

      case 'media': {
        const payload = msg?.media?.payload;
        if (typeof payload !== 'string') {
          logger.warn('TWILIO_MEDIA_MESSAGE_ERROR', { callSid, error: 'missing_audio_payload' });
          if (rtmSession) rtmSession.droppedPackets++;
          break;
        }

        const validation = validateAudioPayload(payload);
        if (!validation.valid) {
          logger.warn('TWILIO_AUDIO_VALIDATION_FAILED', {
            callSid,
            reason: validation.reason,
          });
          if (rtmSession) rtmSession.droppedPackets++;
          break;
        }

        if (!audioBridgeActive) {
          audioBridgeActive = true;
          logger.info('AUDIO_BRIDGE_ACTIVE', { callSid, streamSid: msg.streamSid });
        }

        if (rtmSession) {
          rtmSession.audioBytesReceived += validation.byteLength;
          rtmSession.packetsReceived++;
        }

        if (openaiWs?.readyState === WebSocket.OPEN) {
          openaiWs.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: payload }));
        } else {
          logger.warn('DIAG_USER_AUDIO_DROP_OPENAI_NOT_OPEN', {
            callSid,
            payloadSize: payload.length,
            openaiWsReadyState: openaiWs?.readyState,
          });
          if (rtmSession) rtmSession.droppedPackets++;
        }
        break;
      }

      case 'mark':
        break;

      case 'stop':
        logger.info('TWILIO_MEDIA_STOPPED', { callSid });
        gracefulClose();
        break;
    }
  });

  ws.on('close', () => {
    logger.info('TWILIO_MEDIA_WS_CLOSED', { callSid });
    gracefulClose();
  });

  ws.on('error', (err) => {
    logger.error('TWILIO_MEDIA_WS_ERROR', { callSid, error: err.message });
    gracefulClose();
  });
}

export async function handleOpenAIMessage(msg, rtmSession, legacySession, openaiWs) {
  if (!rtmSession && !legacySession) return;
  const { callSid } = rtmSession || legacySession || {};
  const io = legacySession?.ws?.app?.get('io');

  switch (msg.type) {
    case 'session.created':
      break;

    case 'session.updated':
      logger.info('OPENAI_SESSION_UPDATED', { callSid });
      break;

    case 'input_audio_buffer.speech_started':
      if (openaiWs?.readyState === WebSocket.OPEN) {
        try {
          openaiWs.send(JSON.stringify({ type: 'response.cancel' }));
        } catch { }
      }
      if (rtmSession && rtmSession.state !== RealtimeSessionManager.STATES.LISTENING) {
        rtmSession.setState(RealtimeSessionManager.STATES.LISTENING);
      }
      if (io) {
        io.to(`user:${legacySession?.metadata?.userId}`).emit('transcript.partial', {
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
            if (legacySession?.metadata?.callLogId) {
              appendToTranscript(legacySession.metadata.callLogId, role, content.text);
            }
          } else if (content.type === 'transcript') {
            const role = msg.item.role === 'user' ? 'caller' : 'assistant';
            addTranscriptEntry(callSid, { role, content: content.transcript });
            if (io) {
              io.to(`user:${legacySession?.metadata?.userId}`).emit('transcript.final', {
                callSid,
                role,
                text: content.transcript,
                timestamp: new Date().toISOString(),
              });
            }
            if (legacySession?.metadata?.callLogId) {
              appendToTranscript(legacySession.metadata.callLogId, role, content.transcript);
            }
          }
        }
      }
      break;

    case 'conversation.item.truncated':
      break;

    case 'response.audio_transcript.delta':
      if (io) {
        io.to(`user:${legacySession?.metadata?.userId}`).emit('transcript.partial', {
          callSid,
          text: msg.delta,
          isSpeaking: false,
        });
      }
      break;

    case 'response.audio.delta': {
      if (!msg.delta || typeof msg.delta !== 'string' || msg.delta.length === 0) {
        logger.warn('OPENAI_AUDIO_DELTA_EMPTY', { callSid });
        if (rtmSession) rtmSession.droppedPackets++;
        break;
      }

      const deltaSize = msg.delta.length;
      const streamSid = rtmSession?.streamSid || legacySession?.streamSid;

      if (!streamSid) {
        logger.warn('OPENAI_AUDIO_DELTA_NO_STREAM_SID', { callSid });
        if (rtmSession) rtmSession.droppedPackets++;
        break;
      }

      if (rtmSession) {
        if (rtmSession.state === RealtimeSessionManager.STATES.GREETING ||
            rtmSession.state === RealtimeSessionManager.STATES.LISTENING) {
          rtmSession.setState(RealtimeSessionManager.STATES.RESPONDING);
        }
        rtmSession.audioBytesSent += deltaSize;
        rtmSession.packetsSent++;
      }

      const twilioSocket = legacySession?.ws || rtmSession?.twilioSocket;
      if (twilioSocket && twilioSocket.readyState === WebSocket.OPEN) {
        twilioSocket.send(JSON.stringify({
          event: 'media',
          streamSid,
          media: { payload: msg.delta },
        }));
      } else {
        logger.warn('DIAG_AUDIO_DROP_TWILIO_WS_CLOSED', {
          callSid,
          deltaSize,
        });
        if (rtmSession) rtmSession.droppedPackets++;
      }
      break;
    }

    case 'response.audio.done':
      break;

    case 'response.done':
      if (rtmSession) {
        if (rtmSession.state === RealtimeSessionManager.STATES.RESPONDING ||
            rtmSession.state === RealtimeSessionManager.STATES.GREETING) {
          rtmSession.greetingSent = true;
          rtmSession.setState(RealtimeSessionManager.STATES.LISTENING);
        }
      }
      break;

    case 'error':
      logger.error('OPENAI_REALTIME_ERROR', {
        callSid,
        error: msg.error?.message || JSON.stringify(msg.error),
        errorCode: msg.error?.code || null,
        errorType: msg.error?.type || null,
        errorParam: msg.error?.param || null,
      });
      if (['invalid_api_key', 'authentication', 'model_not_found', 'unsupported_model'].includes(msg.error?.code) ||
          (msg.error?.message || '').toLowerCase().includes('authentication')) {
        RealtimeModelValidator.markFailed(config.realtime.model, msg.error?.message || 'unknown');
        if (legacySession) legacySession.stopReconnect = true;
        if (rtmSession) rtmSession.stopReconnect = true;
        logger.warn('DIAG_OPENAI_ERROR_FATAL', {
          callSid,
          code: msg.error?.code,
          stopReconnect: true,
        });
      }
      break;

    case 'rate_limits.updated':
      break;
  }
}

export { handleMediaStream };
