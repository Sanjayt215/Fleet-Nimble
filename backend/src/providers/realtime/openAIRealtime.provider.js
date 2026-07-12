import WebSocket from 'ws';
import { config } from '../../config/index.js';
import logger from '../../utils/logger.js';
import { RealtimeModelValidator } from '../../services/realtimeModelValidator.js';
import { RealtimeSessionManager } from '../../services/realtimeSessionManager.js';
import { mapToProviderVoice, buildSystemPrompt, buildToolDefinitions } from '../../services/receptionistVoice.service.js';
import { RealtimeVoiceProvider } from './realtimeVoiceProvider.interface.js';

const OPENAI_REALTIME_URL = 'wss://api.openai.com/v1/realtime';
const WS_UPGRADE_TIMEOUT_MS = 8000;
const SESSION_CREATED_TIMEOUT_MS = 8000;
const SESSION_UPDATE_TIMEOUT_MS = 8000;

export class OpenAIRealtimeProvider extends RealtimeVoiceProvider {
  constructor() {
    super();
    this._ws = null;
    this._callSid = null;
    this._sessionContext = null;
    this._rtmSession = null;
    this._sessionCreatedReceived = false;
    this._sessionUpdateAcknowledged = false;
    this._sessionCreatedTimer = null;
    this._sessionUpdateTimer = null;
    this._toolsSent = false;
  }

  get providerName() { return 'openai'; }

  async connect(sessionContext) {
    this._sessionContext = sessionContext;
    this._callSid = sessionContext.callSid;
    this._rtmSession = sessionContext.rtmSession;

    const model = config.realtime.model;
    const voice = mapToProviderVoice('openai', config.realtime.voice);

    const modelValid = RealtimeModelValidator.validate(model);
    if (!modelValid.valid) {
      const err = new Error(`Model validation failed: ${modelValid.reason}`);
      err.code = 'model_validation_failed';
      throw err;
    }

    const openaiUrl = `${OPENAI_REALTIME_URL}?model=${encodeURIComponent(model)}`;

    try {
      this._ws = new WebSocket(openaiUrl, {
        headers: { Authorization: `Bearer ${config.openai.apiKey}` },
      });
    } catch (err) {
      throw new Error(`WebSocket construction failed: ${err.message}`);
    }

    const openTimeout = setTimeout(() => {
      if (!this._ws || this._ws.readyState !== WebSocket.OPEN) {
        this._cleanup();
        this._emit('error', {
          provider: 'openai',
          code: 'connect_timeout',
          message: 'WebSocket connection timeout',
          retryable: true,
          fatal: false,
        });
      }
    }, WS_UPGRADE_TIMEOUT_MS);

    this._ws.on('open', () => {
      clearTimeout(openTimeout);
      this._connected = true;
      logger.info('OPENAI_SOCKET_OPEN', { callSid: this._callSid, model });
      this._emit('connected', { provider: 'openai', model });

      const memoryContext = sessionContext.memoryContext || '';
      const tools = sessionContext.businessToolsEnabled ? buildToolDefinitions(true) : [];

      const basePayload = {
        type: 'session.update',
        session: {
          modalities: ['text', 'audio'],
          instructions: buildSystemPrompt(config, memoryContext),
          voice,
          input_audio_format: 'g711_ulaw',
          output_audio_format: 'g711_ulaw',
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 600,
          },
        },
      };
      this._ws.send(JSON.stringify(basePayload));
      logger.info('SESSION_UPDATE_SENT', {
        callSid: this._callSid,
        keys: Object.keys(basePayload.session),
        hasTools: tools.length > 0,
      });

      if (tools.length > 0) {
        setTimeout(() => {
          if (this._ws && this._ws.readyState === WebSocket.OPEN) {
            const toolsPayload = { type: 'session.update', session: { tools, tool_choice: 'auto' } };
            this._ws.send(JSON.stringify(toolsPayload));
            this._toolsSent = true;
          }
        }, 2000);
      }

      this._sessionCreatedTimer = setTimeout(() => {
        logger.error('SESSION_CREATED_TIMEOUT', {
          callSid: this._callSid,
          timeoutMs: SESSION_CREATED_TIMEOUT_MS,
        });
        RealtimeModelValidator.markFailed(model, 'session.created timeout');
        this._emit('error', {
          provider: 'openai',
          code: 'session_created_timeout',
          message: 'session.created event not received',
          retryable: false,
          fatal: true,
        });
      }, SESSION_CREATED_TIMEOUT_MS);
    });

    this._ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        this._handleMessage(msg);
      } catch (err) {
        logger.error('OPENAI_MESSAGE_PARSE_ERROR', {
          callSid: this._callSid,
          error: err.message,
        });
      }
    });

    this._ws.on('close', (code, reason) => {
      this._connected = false;
      this._ready = false;
      logger.info('OPENAI_SOCKET_CLOSED', {
        callSid: this._callSid,
        code,
        reason: reason?.toString() || null,
      });
      this._emit('closed', { provider: 'openai', code, reason: reason?.toString() });
    });

    this._ws.on('error', (err) => {
      logger.error('OPENAI_SOCKET_ERROR', {
        callSid: this._callSid,
        error: err.message,
      });
      this._emit('error', {
        provider: 'openai',
        code: err.code || 'websocket_error',
        message: err.message,
        retryable: true,
        fatal: false,
      });
    });
  }

  async sendAudio(audioChunk) {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) return false;
    try {
      this._ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: audioChunk }));
      return true;
    } catch {
      return false;
    }
  }

  async sendText(text) {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) return false;
    try {
      const msg = {
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text }],
        },
      };
      this._ws.send(JSON.stringify(msg));
      this._ws.send(JSON.stringify({ type: 'response.create' }));
      return true;
    } catch {
      return false;
    }
  }

  async updateInstructions(instructions) {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) return false;
    try {
      this._ws.send(JSON.stringify({
        type: 'session.update',
        session: { instructions },
      }));
      return true;
    } catch {
      return false;
    }
  }

  async sendToolResult(toolCallId, result) {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) return false;
    try {
      this._ws.send(JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id: toolCallId,
          output: JSON.stringify(result),
        },
      }));
      this._ws.send(JSON.stringify({ type: 'response.create' }));
      return true;
    } catch {
      return false;
    }
  }

  async cancelResponse() {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) return false;
    try {
      this._ws.send(JSON.stringify({ type: 'response.cancel' }));
      return true;
    } catch {
      return false;
    }
  }

  async close(reason) {
    if (this._ws && this._ws.readyState !== WebSocket.CLOSED) {
      try {
        this._ws.close(1000, reason || 'client');
      } catch { }
    }
    this._cleanup();
    this._connected = false;
    this._ready = false;
  }

  _cleanup() {
    if (this._sessionCreatedTimer) {
      clearTimeout(this._sessionCreatedTimer);
      this._sessionCreatedTimer = null;
    }
    if (this._sessionUpdateTimer) {
      clearTimeout(this._sessionUpdateTimer);
      this._sessionUpdateTimer = null;
    }
  }

  _handleMessage(msg) {
    if (msg.type && msg.type !== 'response.audio.delta' && msg.type !== 'input_audio_buffer.speech_started') {
      logger.info('OPENAI_EVENT_TYPE', { callSid: this._callSid, type: msg.type });
    }

    if (msg.type === 'session.created') {
      if (this._sessionCreatedTimer) {
        clearTimeout(this._sessionCreatedTimer);
        this._sessionCreatedTimer = null;
      }
      this._sessionCreatedReceived = true;
      RealtimeModelValidator.markSucceeded(config.realtime.model);
      logger.info('OPENAI_SESSION_CREATED', {
        callSid: this._callSid,
        sessionId: msg.session?.id,
        model: msg.session?.model,
      });
      if (this._rtmSession) {
        this._rtmSession.setState(RealtimeSessionManager.STATES.CONNECTED);
      }
      this._sessionUpdateTimer = setTimeout(() => {
        if (!this._sessionUpdateAcknowledged) {
          logger.warn('SESSION_UPDATE_TIMEOUT', {
            callSid: this._callSid,
            timeoutMs: SESSION_UPDATE_TIMEOUT_MS,
          });
          this._sessionUpdateAcknowledged = true;
          if (this._sessionCreatedReceived) {
            this._ready = true;
            this._emit('ready', { provider: 'openai' });
          }
        }
      }, SESSION_UPDATE_TIMEOUT_MS);
    }

    if (msg.type === 'session.updated') {
      this._sessionUpdateAcknowledged = true;
      if (this._sessionUpdateTimer) {
        clearTimeout(this._sessionUpdateTimer);
        this._sessionUpdateTimer = null;
      }
      logger.info('OPENAI_SESSION_UPDATED', { callSid: this._callSid });
      if (this._sessionCreatedReceived && !this._ready) {
        this._ready = true;
        this._emit('ready', { provider: 'openai' });
      }
    }

    if (msg.type === 'response.audio.delta') {
      this._emit('audio', {
        provider: 'openai',
        audio: msg.delta,
        format: 'g711_ulaw',
      });
    }

    if (msg.type === 'input_audio_buffer.speech_started') {
      this._emit('speechStarted', { provider: 'openai' });
    }

    if (msg.type === 'conversation.item.created') {
      if (msg.item?.type === 'message' && msg.item?.content) {
        for (const content of msg.item.content) {
          if (content.type === 'transcript') {
            const role = msg.item.role === 'user' ? 'caller' : 'assistant';
            if (role === 'caller') {
              this._emit('callerTranscript', {
                provider: 'openai',
                text: content.transcript,
              });
            } else {
              this._emit('assistantTranscript', {
                provider: 'openai',
                text: content.transcript,
              });
            }
          }
        }
      }
      if (msg.item?.type === 'function_call' && msg.item?.name) {
        logger.info('FUNCTION_CALL_RECEIVED', {
          callSid: this._callSid,
          name: msg.item.name,
          callId: msg.item.call_id,
        });
      }
    }

    if (msg.type === 'response.function_call_arguments.done') {
      const { name, arguments: rawArgs, call_id } = msg;
      let args = {};
      try {
        args = rawArgs ? JSON.parse(rawArgs) : {};
      } catch {
        args = {};
      }
      this._emit('toolCall', {
        provider: 'openai',
        name,
        arguments: args,
        callId: call_id,
      });
    }

    if (msg.type === 'response.created') {
      this._emit('responseStarted', { provider: 'openai' });
    }

    if (msg.type === 'response.audio_transcript.delta') {
      this._emit('assistantTranscript', {
        provider: 'openai',
        text: msg.delta,
        partial: true,
      });
    }

    if (msg.type === 'response.done') {
      this._emit('responseCompleted', { provider: 'openai' });
    }

    if (msg.type === 'error') {
      const err = msg.error || {};
      logger.error('OPENAI_ERROR_EVENT', {
        callSid: this._callSid,
        errorType: err.type,
        errorCode: err.code,
        errorMessage: err.message?.substring(0, 200),
      });
      this._emit('error', {
        provider: 'openai',
        code: err.code || 'openai_error',
        message: err.message || 'Unknown OpenAI error',
        retryable: err.code !== 'insufficient_quota' && err.code !== 'invalid_api_key',
        fatal: err.code === 'insufficient_quota' || err.code === 'invalid_api_key' || err.code === 'billing_not_active',
      });
    }
  }
}
