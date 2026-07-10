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
import { mapToOpenAIVoice, buildSystemPrompt, AI_RECEPTIONIST_GREETING } from './receptionistVoice.service.js';

const OPENAI_REALTIME_URL = 'wss://api.openai.com/v1/realtime';
const MAX_RECONNECT_ATTEMPTS = 3;

function buildOpenAiUrl() {
  return `${OPENAI_REALTIME_URL}?model=${encodeURIComponent(config.realtime.model)}`;
}

function handleMediaStream(ws, req) {
  const urlParams = new URL(req.url, config.publicUrl).searchParams;
  const urlCallSid = urlParams.get('callSid') || null;

  let callSid = urlCallSid;
  let session = null;
  let openaiWs = null;
  let reconnectAttempts = 0;
  let isClosing = false;
  let audioBridgeActive = false;
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

  function connectToOpenAI() {
    if (isClosing || !callSid) return;

    if (!config.realtime.configured) {
      logger.error('REALTIME_CALL_FAILED', { callSid, reason: 'realtime_not_configured' });
      gracefulClose();
      return;
    }

    logger.info('OPENAI_REALTIME_CONNECTING', { callSid });
    const voice = mapToOpenAIVoice(config.realtime.voice);

    try {
      openaiWs = new WebSocket(buildOpenAiUrl(), {
        headers: {
          Authorization: `Bearer ${config.openai.apiKey}`,
          'OpenAI-Beta': 'realtime=v1',
        },
      });
      setOpenaiWs(callSid, openaiWs);
    } catch (err) {
      logger.error('REALTIME_CALL_FAILED', { callSid, reason: 'openai_connect_error', error: err.message });
      gracefulClose();
      return;
    }

    openaiWs.on('open', () => {
      if (isClosing) return;
      logger.info('OPENAI_REALTIME_CONNECTED', { callSid });
      reconnectAttempts = 0;

      openaiWs.send(JSON.stringify({
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
      }));

      // Speak the opening greeting exactly once.
      openaiWs.send(JSON.stringify({
        type: 'response.create',
        response: {
          modalities: ['text', 'audio'],
          instructions: `Say exactly: "${AI_RECEPTIONIST_GREETING}"`,
        },
      }));
      logger.info('AI_GREETING_REQUESTED', { callSid });
    });

    openaiWs.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString());
        await handleOpenAIMessage(msg, session, openaiWs);
      } catch (err) {
        logger.error('OPENAI_MESSAGE_PARSE_ERROR', { callSid, error: err.message });
      }
    });

    openaiWs.on('close', (code, reason) => {
      logger.warn('OPENAI_REALTIME_CLOSED', { callSid, code, reason: reason?.toString() });
      setOpenaiWs(callSid, null);

      if (isClosing) return;
      if (session?.stopReconnect) {
        gracefulClose();
        return;
      }
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        logger.info('OPENAI_RECONNECT_ATTEMPT', { callSid, attempt: reconnectAttempts });
        scheduleTimer(connectToOpenAI, 2000 * reconnectAttempts);
      } else {
        gracefulClose();
      }
    });

    openaiWs.on('error', (err) => {
      logger.error('OPENAI_REALTIME_ERROR', { callSid, error: err.message });
      if (!isClosing && (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS || session?.stopReconnect)) {
        gracefulClose();
      }
    });
  }

  function gracefulClose() {
    if (isClosing) return;
    isClosing = true;
    clearTimers();

    try {
      if (openaiWs && openaiWs.readyState !== WebSocket.CLOSED) openaiWs.close();
    } catch { }
    setOpenaiWs(callSid, null);

    try {
      if (ws && ws.readyState !== WebSocket.CLOSED) ws.close();
    } catch { }

    if (callSid) removeSession(callSid);
    logger.info('CALL_SESSION_CLEANED', { callSid });
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

        setStreamSid(callSid, streamSid);
        session = registerSession(callSid, ws, {
          from: params.from || start.from || null,
          to: params.to || start.to || null,
          caller: params.from || start.from || null,
          calledNumber: params.to || start.to || null,
          sessionId: start.callSid || callSid,
        });
        session.streamSid = streamSid;
        session.timers = timers;

        logger.info('TWILIO_MEDIA_STARTED', {
          callSid,
          streamSid,
          fromTail: (params.from || start.from || '').slice(-4) || 'unknown',
        });

        // Max call duration hard limit.
        scheduleTimer(() => {
          endCallGracefully('Thank you for calling FleetNimble. Please contact us again if you need further help. Goodbye.');
        }, config.realtime.maxCallSeconds * 1000);

        // Idle / silence watchdog (re-armed continuously).
        const silenceMs = Math.max(5000, config.realtime.silenceTimeoutSeconds * 1000);
        const silenceInterval = setInterval(() => {
          if (isClosing || !session) return;
          if (Date.now() - session.lastActivityAt > config.realtime.silenceTimeoutSeconds * 1000) {
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
          break;
        }
        if (!audioBridgeActive) {
          audioBridgeActive = true;
          logger.info('AUDIO_BRIDGE_ACTIVE', { callSid, streamSid: msg.streamSid });
        }
        if (openaiWs?.readyState === WebSocket.OPEN) {
          openaiWs.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: payload }));
        }
        break;
      }

      case 'mark':
        // Playback acknowledgement — no action required.
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

async function handleOpenAIMessage(msg, session, openaiWs) {
  if (!session) return;
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
      // Barge-in: cancel any in-progress assistant response.
      if (openaiWs?.readyState === WebSocket.OPEN) {
        try {
          openaiWs.send(JSON.stringify({ type: 'response.cancel' }));
        } catch { }
      }
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
      // Authentication / invalid-model failures cannot be retried successfully.
      if (['invalid_api_key', 'authentication', 'model_not_found', 'unsupported_model'].includes(msg.error?.code) ||
          (msg.error?.message || '').toLowerCase().includes('authentication')) {
        session.stopReconnect = true;
      }
      break;

    case 'rate_limits.updated':
      break;
  }
}

export { handleMediaStream, handleOpenAIMessage };
