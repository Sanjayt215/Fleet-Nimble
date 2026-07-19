import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../../config/index.js';
import logger from '../../utils/logger.js';
import { RealtimeSessionManager } from '../../services/realtimeSessionManager.js';
import { buildSystemPrompt, buildToolDefinitions, mapToProviderVoice } from '../../services/receptionistVoice.service.js';
import { RealtimeVoiceProvider } from './realtimeVoiceProvider.interface.js';
import { decodeUlaw, encodeUlaw } from '../../services/audio/twilioAudioCodec.js';
import { convertSampleRate } from '../../services/audio/audioResampler.js';
import * as metrics from '../../services/receptionistMetrics.service.js';

const GEMINI_LIVE_BASE = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent';
const CONNECT_TIMEOUT_MS = 10000;
const SETUP_ACK_TIMEOUT_MS = 10000;
const HEARTBEAT_INTERVAL_MS = 15000;
const MAX_PENDING_AUDIO_FRAMES = 500;
const TWILIO_SAMPLE_RATE = 8000;
const GEMINI_INPUT_RATE = 16000;
const GEMINI_OUTPUT_RATE = 24000;

export class GeminiLiveProvider extends RealtimeVoiceProvider {
  constructor() {
    super();
    this._ws = null;
    this._callSid = null;
    this._sessionContext = null;
    this._rtmSession = null;
    this._apiKey = null;
    this._model = null;
    this._voice = null;
    this._setupSent = false;
    this._setupAcknowledged = false;
    this._setupTimer = null;
    this._connectTimer = null;
    this._heartbeatTimer = null;
    this._pendingAudioQueue = [];
    this._pendingAudioBytes = 0;
    this._lastActivity = Date.now();
    this._functionCallsInFlight = new Map();
    this._currentTurnParts = [];
    this._accumulatedTranscript = '';
    this._turnActive = false;

    // Metrics
    this._connectStart = null;
    this._metrics = {
      connectTime: null,
      firstTokenLatency: null,
      firstAudioLatency: null,
      toolExecutionCount: 0,
      disconnectCount: 0,
      reconnectCount: 0,
      audioBytesSent: 0,
      audioBytesReceived: 0,
      conversationDuration: 0,
    };
  }

  get providerName() { return 'gemini'; }

  async connect(sessionContext) {
    this._sessionContext = sessionContext;
    this._callSid = sessionContext.callSid;
    this._rtmSession = sessionContext.rtmSession;
    this._apiKey = config.gemini?.apiKey || process.env.GEMINI_API_KEY;
    this._model = config.gemini?.liveModel || 'gemini-2.0-flash-exp';
    this._voice = mapToProviderVoice('gemini', config.gemini?.voice || 'Puck');
    this._connectStart = Date.now();

    if (!this._apiKey) {
      throw new Error('Gemini API key not configured');
    }

    const wsUrl = `${GEMINI_LIVE_BASE}?key=${this._apiKey}`;
    logger.info('GEMINI_CONNECTING', { callSid: this._callSid, model: this._model, voice: this._voice });

    try {
      this._ws = new WebSocket(wsUrl);
    } catch (err) {
      throw new Error(`Gemini WebSocket construction failed: ${err.message}`);
    }

    this._connectTimer = setTimeout(() => {
      if (!this._ws || this._ws.readyState !== WebSocket.OPEN) {
        this._cleanup();
        this._emit('error', {
          provider: 'gemini',
          code: 'connect_timeout',
          message: 'Gemini WebSocket connection timeout',
          retryable: true,
          fatal: false,
        });
      }
    }, CONNECT_TIMEOUT_MS);

    this._ws.on('open', () => {
      clearTimeout(this._connectTimer);
      this._connectTimer = null;
      this._connected = true;
      this._metrics.connectTime = Date.now() - this._connectStart;

      metrics.recordProviderEvent({ type: 'connected', latencyMs: this._metrics.connectTime });

      logger.info('GEMINI_CONNECTED', {
        callSid: this._callSid,
        model: this._model,
        connectTimeMs: this._metrics.connectTime,
      });

      if (this._rtmSession) {
        this._rtmSession.setState(RealtimeSessionManager.STATES.CONNECTING);
      }

      this._emit('connected', { provider: 'gemini', model: this._model });

      this._sendSetup().then(() => this._startHeartbeat());
    });

    this._ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        this._lastActivity = Date.now();
        this._handleMessage(msg);
      } catch (err) {
        logger.error('GEMINI_MESSAGE_PARSE_ERROR', {
          callSid: this._callSid,
          error: err.message,
        });
      }
    });

    this._ws.on('close', (code, reason) => {
      this._connected = false;
      this._ready = false;
      this._metrics.disconnectCount++;
      this._stopHeartbeat();

      logger.info('GEMINI_CLOSED', {
        callSid: this._callSid,
        code,
        reason: reason?.toString() || null,
      });

      this._emit('closed', { provider: 'gemini', code, reason: reason?.toString() });
    });

    this._ws.on('error', (err) => {
      logger.error('GEMINI_SOCKET_ERROR', {
        callSid: this._callSid,
        error: err.message,
      });
      this._emit('error', {
        provider: 'gemini',
        code: err.code || 'websocket_error',
        message: err.message,
        retryable: true,
        fatal: false,
      });
    });
  }

  async _sendSetup() {
    const memoryContext = this._sessionContext.memoryContext || '';
    const businessToolsEnabled = this._sessionContext.businessToolsEnabled ?? config.realtime?.businessToolsEnabled ?? true;
    const tools = businessToolsEnabled ? buildToolDefinitions(true) : [];
    const systemPrompt = await buildSystemPrompt(config, memoryContext);

    const setupMessage = {
      setup: {
        model: `models/${this._model}`,
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        generationConfig: {
          temperature: 0.7,
          topP: 0.95,
          topK: 40,
          responseModalities: ['AUDIO'],
        },
        userAudio: {
          encoding: 'LINEAR16',
          sampleRateHertz: GEMINI_INPUT_RATE,
        },
        outputAudio: {
          encoding: 'LINEAR16',
          sampleRateHertz: GEMINI_OUTPUT_RATE,
        },
      },
    };

    if (this._voice) {
      setupMessage.setup.speechConfig = {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: this._voice } },
      };
    }

    if (tools.length > 0) {
      setupMessage.setup.tools = [{
        functionDeclarations: tools.map(t => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
      }];
    }

    const serverVadEnabled = process.env.GEMINI_ENABLE_SERVER_VAD !== 'false';
    if (serverVadEnabled && config.gemini?.enableServerVad !== false) {
      setupMessage.setup.speechConfig = setupMessage.setup.speechConfig || {};
      setupMessage.setup.speechConfig.speechModelV2 = {
        vadType: 'SERVER_VAD',
        preSilenceMs: parseInt(process.env.GEMINI_VAD_PRE_SILENCE_MS || '300', 10),
        postSilenceMs: parseInt(process.env.GEMINI_VAD_POST_SILENCE_MS || '800', 10),
        threshold: parseFloat(process.env.GEMINI_VAD_THRESHOLD || '0.6'),
      };
    }

    this._ws.send(JSON.stringify(setupMessage));
    this._setupSent = true;

    logger.info('GEMINI_SETUP_SENT', {
      callSid: this._callSid,
      hasTools: tools.length > 0,
      toolNames: tools.map(t => t.name),
      hasMemory: !!memoryContext,
      serverVad: serverVadEnabled,
      outputRate: GEMINI_OUTPUT_RATE,
    });

    this._setupTimer = setTimeout(() => {
      if (!this._setupAcknowledged) {
        logger.error('GEMINI_SETUP_TIMEOUT', {
          callSid: this._callSid,
          timeoutMs: SETUP_ACK_TIMEOUT_MS,
        });
        this._emit('error', {
          provider: 'gemini',
          code: 'setup_timeout',
          message: 'Gemini setup not acknowledged within timeout',
          retryable: false,
          fatal: true,
        });
      }
    }, SETUP_ACK_TIMEOUT_MS);
  }

  async sendAudio(audioChunk) {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) return false;

    if (!this._setupAcknowledged) {
      if (this._pendingAudioQueue.length < MAX_PENDING_AUDIO_FRAMES) {
        this._pendingAudioQueue.push(audioChunk);
        this._pendingAudioBytes += audioChunk.length;
      }
      return false;
    }

    try {
      if (this._pendingAudioQueue.length > 0) {
        const queue = this._pendingAudioQueue.splice(0);
        this._pendingAudioBytes = 0;
        for (const chunk of queue) {
          await this._sendAudioChunk(chunk);
        }
      }
      await this._sendAudioChunk(audioChunk);
      return true;
    } catch {
      return false;
    }
  }

  async _sendAudioChunk(audioChunk) {
    const validation = this._validateBase64(audioChunk);
    if (!validation.valid) return;

    const pcm8k = decodeUlaw(audioChunk);
    if (!pcm8k || pcm8k.length === 0) return;

    const pcm16k = convertSampleRate(pcm8k, TWILIO_SAMPLE_RATE, GEMINI_INPUT_RATE);
    const audioBase64 = this._pcm16ToBase64(pcm16k);

    const message = {
      realtimeInput: {
        mediaChunks: [{
          data: audioBase64,
          mimeType: `audio/pcm;rate=${GEMINI_INPUT_RATE}`,
        }],
      },
    };

    this._ws.send(JSON.stringify(message));
    this._metrics.audioBytesSent += audioChunk.length;
  }

  async sendText(text) {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) return false;
    try {
      const message = { realtimeInput: { text } };
      this._ws.send(JSON.stringify(message));
      return true;
    } catch {
      return false;
    }
  }

  async updateInstructions(instructions) {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) return false;
    try {
      const update = {
        setup: {
          systemInstruction: {
            parts: [{ text: instructions }],
          },
        },
      };
      this._ws.send(JSON.stringify(update));
      logger.info('GEMINI_INSTRUCTIONS_UPDATED', { callSid: this._callSid });
      return true;
    } catch {
      return false;
    }
  }

  async sendToolResult(toolCallId, result) {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) return false;
    try {
      const fc = this._functionCallsInFlight.get(toolCallId);
      const name = fc?.name || 'unknown';

      const response = {
        toolResponse: {
          functionResponses: [{
            id: toolCallId,
            name,
            response: {
              name,
              response: result,
            },
          }],
        },
      };

      this._ws.send(JSON.stringify(response));
      this._functionCallsInFlight.delete(toolCallId);
      this._metrics.toolExecutionCount++;

      logger.info('GEMINI_TOOL_RESULT_SENT', {
        callSid: this._callSid,
        toolName: name,
        toolCallId,
        success: result?.success !== false,
      });

      return true;
    } catch (err) {
      logger.error('GEMINI_TOOL_RESULT_FAILED', {
        callSid: this._callSid,
        toolCallId,
        error: err.message,
      });
      return false;
    }
  }

  async cancelResponse() {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) return false;
    try {
      this._ws.send(JSON.stringify({ realtimeInput: { interruption: true } }));
      this._currentTurnParts = [];
      this._turnActive = false;
      return true;
    } catch {
      return false;
    }
  }

  async close(reason) {
    this._stopHeartbeat();
    if (this._ws && this._ws.readyState !== WebSocket.CLOSED) {
      try {
        this._ws.close(1000, reason || 'client');
      } catch { }
    }
    this._cleanup();
    this._connected = false;
    this._ready = false;
    this._pendingAudioQueue = [];
    this._pendingAudioBytes = 0;
    this._functionCallsInFlight.clear();
    this._currentTurnParts = [];
    this._accumulatedTranscript = '';
    this._metrics.conversationDuration = Date.now() - (this._connectStart || Date.now());
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this._heartbeatTimer = setInterval(() => {
      if (this._ws && this._ws.readyState === WebSocket.OPEN) {
        if (Date.now() - this._lastActivity > HEARTBEAT_INTERVAL_MS * 2) {
          logger.warn('GEMINI_HEARTBEAT_STALLED', { callSid: this._callSid });
        }
      } else {
        this._stopHeartbeat();
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  _stopHeartbeat() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }

  _cleanup() {
    this._stopHeartbeat();
    if (this._setupTimer) {
      clearTimeout(this._setupTimer);
      this._setupTimer = null;
    }
    if (this._connectTimer) {
      clearTimeout(this._connectTimer);
      this._connectTimer = null;
    }
  }

  _handleMessage(msg) {
    // Setup complete
    if (msg.setupComplete) {
      this._setupAcknowledged = true;
      if (this._setupTimer) {
        clearTimeout(this._setupTimer);
        this._setupTimer = null;
      }
      this._ready = true;
      this._lastActivity = Date.now();

      if (this._rtmSession) {
        this._rtmSession.setState(RealtimeSessionManager.STATES.CONNECTED);
      }

      logger.info('GEMINI_READY', { callSid: this._callSid });
      this._emit('ready', { provider: 'gemini' });
      return;
    }

    // Server content (model turn)
    if (msg.serverContent) {
      const sc = msg.serverContent;

      if (sc.interrupted) {
        this._currentTurnParts = [];
        this._turnActive = false;
        this._emit('speechStarted', { provider: 'gemini' });
        return;
      }

      if (sc.modelTurn) {
        this._turnActive = true;
        let hasText = false;
        let hasAudio = false;

        for (const part of (sc.modelTurn.parts || [])) {
          if (part.text) {
            hasText = true;
            this._accumulatedTranscript += part.text;
            this._currentTurnParts.push({ type: 'text', text: part.text });

            if (this._metrics.firstTokenLatency === null) {
              this._metrics.firstTokenLatency = Date.now() - this._connectStart;
            }

            this._emit('assistantTranscript', {
              provider: 'gemini',
              text: part.text,
              partial: !sc.turnComplete,
            });
          }

          if (part.inlineData) {
            hasAudio = true;
            const audioBase64 = part.inlineData.data;
            const mimeType = part.inlineData.mimeType || '';

            const pcmProvider = this._base64ToPcm16(audioBase64);
            if (pcmProvider && pcmProvider.length > 0) {
              const pcm8k = convertSampleRate(pcmProvider, GEMINI_OUTPUT_RATE, TWILIO_SAMPLE_RATE);
              const ulaw = encodeUlaw(pcm8k);

              if (ulaw) {
                if (this._metrics.firstAudioLatency === null) {
                  this._metrics.firstAudioLatency = Date.now() - this._connectStart;
                  logger.info('GEMINI_FIRST_AUDIO', {
                    callSid: this._callSid,
                    latencyMs: this._metrics.firstAudioLatency,
                  });
                }

                this._metrics.audioBytesReceived += audioBase64.length;
                this._currentTurnParts.push({ type: 'audio', bytes: audioBase64.length });

                this._emit('audio', {
                  provider: 'gemini',
                  audio: ulaw,
                  format: 'g711_ulaw',
                });
              }
            }
          }
        }

        if (hasText && !hasAudio) {
          this._emit('responseStarted', { provider: 'gemini' });
        }
      }

      if (sc.turnComplete) {
        if (this._accumulatedTranscript) {
          this._emit('assistantTranscript', {
            provider: 'gemini',
            text: this._accumulatedTranscript,
            partial: false,
          });
        }
        if (this._rtmSession) {
          this._rtmSession.setState(RealtimeSessionManager.STATES.LISTENING);
        }
        this._emit('responseCompleted', { provider: 'gemini' });
        this._currentTurnParts = [];
        this._accumulatedTranscript = '';
        this._turnActive = false;
      }

      return;
    }

    // Tool call from Gemini
    if (msg.toolCall) {
      const tc = msg.toolCall;
      if (tc.functionCalls) {
        for (const fc of tc.functionCalls) {
          this._functionCallsInFlight.set(fc.id, { name: fc.name, args: fc.args || {} });

          let parsedArgs = fc.args || {};
          if (typeof parsedArgs === 'string') {
            try {
              parsedArgs = JSON.parse(parsedArgs);
            } catch {
              parsedArgs = {};
            }
          }

          logger.info('GEMINI_TOOL_CALL_RECEIVED', {
            callSid: this._callSid,
            name: fc.name,
            id: fc.id,
            args: JSON.stringify(parsedArgs).substring(0, 200),
          });

          this._emit('toolCall', {
            provider: 'gemini',
            name: fc.name,
            arguments: parsedArgs,
            callId: fc.id,
          });
        }
      }
      return;
    }

    // Error from Gemini
    if (msg.error) {
      const err = msg.error;
      const code = err.code || 'gemini_error';
      const message = err.message || 'Unknown Gemini error';

      const fatalCodes = ['INVALID_ARGUMENT', 'PERMISSION_DENIED', 'UNAUTHENTICATED', 'FAILED_PRECONDITION'];
      const quotaCodes = ['RESOURCE_EXHAUSTED'];
      const isFatal = fatalCodes.includes(code);
      const isQuota = quotaCodes.includes(code) || message.toLowerCase().includes('quota') || message.toLowerCase().includes('rate limit');

      logger.error('GEMINI_ERROR', {
        callSid: this._callSid,
        code,
        message: message.substring(0, 200),
        fatal: isFatal || isQuota,
      });

      this._emit('error', {
        provider: 'gemini',
        code,
        message,
        retryable: !isFatal && !isQuota,
        fatal: isFatal || isQuota,
      });
      return;
    }

    // Unknown message type — log for debugging
    const knownKeys = ['setupComplete', 'serverContent', 'toolCall', 'error'];
    const msgType = Object.keys(msg).find(k => knownKeys.includes(k)) || Object.keys(msg)[0];
    logger.info('GEMINI_EVENT', { callSid: this._callSid, type: msgType });
  }

  _base64ToPcm16(base64Payload) {
    try {
      const raw = atob(base64Payload);
      const sampleCount = Math.floor(raw.length / 2);
      const pcm16 = new Int16Array(sampleCount);
      for (let i = 0; i < sampleCount; i++) {
        const low = raw.charCodeAt(i * 2);
        const high = raw.charCodeAt(i * 2 + 1);
        pcm16[i] = (high << 8) | (low & 0xFF);
      }
      return pcm16;
    } catch {
      return null;
    }
  }

  _pcm16ToBase64(pcm16) {
    const bytes = new Uint8Array(pcm16.length * 2);
    for (let i = 0; i < pcm16.length; i++) {
      bytes[i * 2] = pcm16[i] & 0xFF;
      bytes[i * 2 + 1] = (pcm16[i] >> 8) & 0xFF;
    }
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  _validateBase64(payload) {
    if (typeof payload !== 'string' || payload.length === 0) {
      return { valid: false, reason: 'empty_or_nonstring' };
    }
    try {
      atob(payload);
      return { valid: true };
    } catch {
      return { valid: false, reason: 'invalid_base64' };
    }
  }

  getMetrics() {
    return { ...this._metrics };
  }
}
