import WebSocket from 'ws';
import { config } from '../../config/index.js';
import logger from '../../utils/logger.js';
import { RealtimeSessionManager } from '../../services/realtimeSessionManager.js';
import { buildSystemPrompt, buildToolDefinitions, mapToProviderVoice } from '../../services/receptionistVoice.service.js';
import { RealtimeVoiceProvider } from './realtimeVoiceProvider.interface.js';
import { decodeUlaw, encodeUlaw } from '../../services/audio/twilioAudioCodec.js';
import { convertSampleRate } from '../../services/audio/audioResampler.js';
import * as metrics from '../../services/receptionistMetrics.service.js';

const GEMINI_LIVE_API_VERSION = 'v1beta';
const GEMINI_LIVE_BASE = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.${GEMINI_LIVE_API_VERSION}.GenerativeService.BidiGenerateContent`;
const DEFAULT_GEMINI_LIVE_MODEL = 'gemini-3.1-flash-live-preview';

const SUPPORTED_REALTIME_MODELS = new Set([
  'gemini-3.1-flash-live-preview',
  'gemini-live-2.5-flash-native-audio',
  'gemini-3.5-live-translate-preview',
]);

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
    this._resumptionHandle = null;
    this._sessionId = null;

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
    this._model = config.gemini?.liveModel || DEFAULT_GEMINI_LIVE_MODEL;
    this._voice = mapToProviderVoice('gemini', config.gemini?.voice || 'Puck');
    this._connectStart = Date.now();

    if (sessionContext.resumptionHandle) {
      this._resumptionHandle = sessionContext.resumptionHandle;
      logger.info('GEMINI_RESUMPTION_HANDLE_SET', {
        callSid: this._callSid,
        handlePrefix: sessionContext.resumptionHandle.substring(0, 16),
      });
    }

    if (!this._apiKey) {
      throw new Error('Gemini API key not configured');
    }

    if (!SUPPORTED_REALTIME_MODELS.has(this._model)) {
      const supported = [...SUPPORTED_REALTIME_MODELS].join(', ');
      throw new Error(
        `Model "${this._model}" does not support bidiGenerateContent (Gemini Live API). `
        + `Supported models: ${supported}`
      );
    }

    const wsUrl = `${GEMINI_LIVE_BASE}?key=${this._apiKey}`;
    logger.info('GEMINI_CONNECTING', { callSid: this._callSid, model: this._model, voice: this._voice, apiKeyPresent: !!this._apiKey, apiVersion: GEMINI_LIVE_API_VERSION });

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

      const reasonStr = reason?.toString() || null;
      const timeConnected = this._connectStart ? Date.now() - this._connectStart : null;

      const CLOSE_CODE_MEANINGS = {
        1000: 'NORMAL_CLOSURE',
        1001: 'GOING_AWAY',
        1002: 'PROTOCOL_ERROR',
        1003: 'UNSUPPORTED_DATA',
        1005: 'NO_STATUS',
        1006: 'ABNORMAL_CLOSURE',
        1007: 'INVALID_PAYLOAD',
        1008: 'POLICY_VIOLATION',
        1009: 'MESSAGE_TOO_BIG',
        1010: 'MANDATORY_EXTENSION',
        1011: 'INTERNAL_ERROR',
        1012: 'SERVICE_RESTART',
        1013: 'TRY_AGAIN_LATER',
        1014: 'BAD_GATEWAY',
        1015: 'TLS_HANDSHAKE_FAIL',
        4000: 'APPLICATION_ERROR',
        4001: 'TOKEN_EXPIRED',
        4002: 'SESSION_EXPIRED',
        4003: 'CONCURRENT_CHANNEL_LIMIT',
        4004: 'AUTHENTICATION_FAILED',
        4005: 'INVALID_REQUEST',
        4006: 'SESSION_EXHAUSTED',
        4007: 'RESOURCE_EXHAUSTED',
        4008: 'QUOTA_EXCEEDED',
        4009: 'RATE_LIMITED',
      };

      logger.warn('GEMINI_CLOSED', {
        callSid: this._callSid,
        code,
        codeMeaning: CLOSE_CODE_MEANINGS[code] || 'UNKNOWN',
        reason: reasonStr,
        timeConnectedMs: timeConnected,
        timeConnectedSeconds: timeConnected ? Math.round(timeConnected / 1000) : null,
        hasResumptionHandle: !!this._resumptionHandle,
        setupAcknowledged: this._setupAcknowledged,
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
    const serverVadEnabled = process.env.GEMINI_ENABLE_SERVER_VAD !== 'false';
    const vadDisabled = serverVadEnabled === false || config.gemini?.enableServerVad === false;

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
      },
    };

    const gc = setupMessage.setup.generationConfig;

    if (this._voice) {
      gc.speechConfig = {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: this._voice },
        },
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

    if (!vadDisabled) {
      setupMessage.setup.realtimeInputConfig = {
        automaticActivityDetection: {
          disabled: false,
          startOfSpeechSensitivity: 'START_SENSITIVITY_LOW',
          endOfSpeechSensitivity: 'END_SENSITIVITY_LOW',
          prefixPaddingMs: parseInt(process.env.GEMINI_VAD_PRE_SILENCE_MS || '300', 10),
          silenceDurationMs: parseInt(process.env.GEMINI_VAD_POST_SILENCE_MS || '800', 10),
        },
      };
    }

    if (process.env.GEMINI_ENABLE_CONTEXT_COMPRESSION !== 'false') {
      setupMessage.setup.contextWindowCompression = {
        triggerTokens: parseInt(process.env.GEMINI_COMPRESSION_TRIGGER_TOKENS || '80000', 10),
        slidingWindow: {
          targetTokens: parseInt(process.env.GEMINI_COMPRESSION_TARGET_TOKENS || '40000', 10),
        },
      };
    }

    if (process.env.GEMINI_ENABLE_SESSION_RESUMPTION !== 'false') {
      if (this._resumptionHandle) {
        setupMessage.setup.sessionResumption = { handle: this._resumptionHandle };
      } else {
        setupMessage.setup.sessionResumption = {};
      }
    }

    this._debugLogSend('setup', setupMessage);
    this._logSetupPayload(setupMessage);

    const validation = this._validateSetupPayload(setupMessage);
    if (!validation.valid) {
      this._emit('error', {
        provider: 'gemini',
        code: 'setup_validation_error',
        message: `Setup payload validation failed — ${validation.reasons.join('; ')}`,
        retryable: false,
        fatal: true,
      });
      return;
    }

    this._logProtocolCompliance(setupMessage);
    this._ws.send(JSON.stringify(setupMessage));
    this._setupSent = true;

    logger.info('GEMINI_SETUP_SENT', {
      callSid: this._callSid,
      model: this._model,
      voice: this._voice,
      hasTools: tools.length > 0,
      toolNames: tools.map(t => t.name),
      hasMemory: !!memoryContext,
      serverVad: !vadDisabled,
      outputRate: GEMINI_OUTPUT_RATE,
      validationPassed: true,
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
        audio: {
          data: audioBase64,
          mimeType: `audio/pcm;rate=${GEMINI_INPUT_RATE}`,
        },
      },
    };

    this._debugLogSend('realtimeInput', message);
    this._ws.send(JSON.stringify(message));
    this._metrics.audioBytesSent += audioChunk.length;
  }

  async sendText(text) {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) return false;
    try {
      const message = { realtimeInput: { text } };
      this._debugLogSend('realtimeInput', message);
      this._ws.send(JSON.stringify(message));
      return true;
    } catch {
      return false;
    }
  }

  async updateInstructions(instructions) {
    logger.warn('GEMINI_INSTRUCTIONS_UNSUPPORTED', {
      callSid: this._callSid,
      message: 'Gemini Live does not support dynamic instruction updates after setup. '
        + 'The setup message is only valid as the first message in the session.',
    });
    return false;
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
            response: result,
          }],
        },
      };

      this._debugLogSend('toolResponse', response);
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
    this._currentTurnParts = [];
    this._turnActive = false;
    return true;
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
    this._resumptionHandle = null;
    this._sessionId = null;
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

      logger.info('GEMINI_READY', { callSid: this._callSid, model: this._model, toolsRegistered: this._sessionContext?.businessToolsEnabled ? 'yes' : 'no' });
      this._emit('ready', { provider: 'gemini' });
      return;
    }

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

    if (msg.goAway) {
      const goAway = msg.goAway;
      const timeLeftMs = goAway.timeLeft ? parseInt(goAway.timeLeft.replace('s', ''), 10) * 1000 : null;
      logger.warn('GEMINI_GO_AWAY', {
        callSid: this._callSid,
        timeLeftSeconds: timeLeftMs ? timeLeftMs / 1000 : null,
        hasResumptionHandle: !!this._resumptionHandle,
        sessionId: this._sessionId,
      });
      this._emit('goAway', {
        provider: 'gemini',
        timeLeftMs,
        resumptionHandle: this._resumptionHandle,
      });
      return;
    }

    if (msg.sessionResumptionUpdate) {
      const update = msg.sessionResumptionUpdate;
      if (update.handle) {
        this._resumptionHandle = update.handle;
        logger.info('GEMINI_RESUMPTION_HANDLE_RECEIVED', {
          callSid: this._callSid,
          expireTime: update.expireTime || null,
        });
      }
      if (update.sessionId) {
        this._sessionId = update.sessionId;
      }
      return;
    }

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

    const knownKeys = ['setupComplete', 'serverContent', 'toolCall', 'error', 'goAway', 'sessionResumptionUpdate'];
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

  _logSetupPayload(msg) {
    const json = JSON.stringify(msg, null, 2);
    logger.info('GEMINI_SETUP_PAYLOAD', {
      callSid: this._callSid,
      payload: json,
      payloadSizeBytes: json.length,
    });
  }

  _validateSetupPayload(msg) {
    const reasons = [];
    const setup = msg.setup || {};

    const VALID_SETUP_FIELDS = new Set([
      'model', 'generationConfig', 'systemInstruction', 'tools',
      'realtimeInputConfig', 'sessionResumption', 'contextWindowCompression',
      'inputAudioTranscription', 'outputAudioTranscription', 'proactivity', 'historyConfig',
    ]);

    const VALID_GC_FIELDS = new Set([
      'candidateCount', 'maxOutputTokens', 'temperature', 'topP', 'topK',
      'presencePenalty', 'frequencyPenalty', 'responseModalities',
      'speechConfig', 'mediaResolution',
    ]);

    const VALID_SPEECH_CONFIG_FIELDS = new Set(['voiceConfig']);
    const VALID_VOICE_CONFIG_FIELDS = new Set(['prebuiltVoiceConfig']);
    const VALID_PREBUILT_VOICE_FIELDS = new Set(['voiceName']);
    const VALID_REALTIME_INPUT_CONFIG_FIELDS = new Set(['automaticActivityDetection']);

    const VALID_AAD_FIELDS = new Set([
      'disabled', 'startOfSpeechSensitivity', 'endOfSpeechSensitivity',
      'prefixPaddingMs', 'silenceDurationMs',
    ]);

    const VALID_START_SENSITIVITY = new Set([
      'START_SENSITIVITY_UNSPECIFIED',
      'START_SENSITIVITY_HIGH',
      'START_SENSITIVITY_LOW',
    ]);

    const VALID_END_SENSITIVITY = new Set([
      'END_SENSITIVITY_UNSPECIFIED',
      'END_SENSITIVITY_HIGH',
      'END_SENSITIVITY_LOW',
    ]);

    const VALID_MODALITIES = new Set(['AUDIO', 'TEXT']);

    const invalidSetup = Object.keys(setup).filter(k => !VALID_SETUP_FIELDS.has(k));
    for (const f of invalidSetup) {
      reasons.push(`UNSUPPORTED_FIELD: setup.${f} is not a documented BidiGenerateContentSetup field`);
    }

    if (setup.generationConfig && typeof setup.generationConfig === 'object') {
      const invalidGc = Object.keys(setup.generationConfig).filter(k => !VALID_GC_FIELDS.has(k));
      for (const f of invalidGc) {
        reasons.push(`UNSUPPORTED_FIELD: setup.generationConfig.${f} is not in the GenerationConfig allowlist for Live`);
      }
    }

    if (setup.generationConfig?.speechConfig && typeof setup.generationConfig.speechConfig === 'object') {
      const invalidSc = Object.keys(setup.generationConfig.speechConfig).filter(k => !VALID_SPEECH_CONFIG_FIELDS.has(k));
      for (const f of invalidSc) {
        reasons.push(`UNSUPPORTED_FIELD: setup.generationConfig.speechConfig.${f} is not a supported SpeechConfig field`);
      }
    }

    if (setup.generationConfig?.speechConfig?.voiceConfig && typeof setup.generationConfig.speechConfig.voiceConfig === 'object') {
      const invalidVc = Object.keys(setup.generationConfig.speechConfig.voiceConfig).filter(k => !VALID_VOICE_CONFIG_FIELDS.has(k));
      for (const f of invalidVc) {
        reasons.push(`UNSUPPORTED_FIELD: setup.generationConfig.speechConfig.voiceConfig.${f} is not a supported VoiceConfig field`);
      }
    }

    if (setup.generationConfig?.speechConfig?.voiceConfig?.prebuiltVoiceConfig && typeof setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig === 'object') {
      const invalidPvc = Object.keys(setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig).filter(k => !VALID_PREBUILT_VOICE_FIELDS.has(k));
      for (const f of invalidPvc) {
        reasons.push(`UNSUPPORTED_FIELD: setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.${f} is not a supported field`);
      }
    }

    if (setup.realtimeInputConfig && typeof setup.realtimeInputConfig === 'object') {
      const invalidRic = Object.keys(setup.realtimeInputConfig).filter(k => !VALID_REALTIME_INPUT_CONFIG_FIELDS.has(k));
      for (const f of invalidRic) {
        reasons.push(`UNSUPPORTED_FIELD: setup.realtimeInputConfig.${f} is not a documented RealtimeInputConfig field`);
      }
    }

    if (setup.realtimeInputConfig?.automaticActivityDetection && typeof setup.realtimeInputConfig.automaticActivityDetection === 'object') {
      const invalidAad = Object.keys(setup.realtimeInputConfig.automaticActivityDetection).filter(k => !VALID_AAD_FIELDS.has(k));
      for (const f of invalidAad) {
        reasons.push(`UNSUPPORTED_FIELD: setup.realtimeInputConfig.automaticActivityDetection.${f} is not a documented field`);
      }

      const aad = setup.realtimeInputConfig.automaticActivityDetection;
      if (aad.startOfSpeechSensitivity !== undefined) {
        if (!VALID_START_SENSITIVITY.has(aad.startOfSpeechSensitivity)) {
          reasons.push(
            `INVALID_ENUM: setup.realtimeInputConfig.automaticActivityDetection.startOfSpeechSensitivity = "${aad.startOfSpeechSensitivity}"`
            + ` — must be one of: ${[...VALID_START_SENSITIVITY].join(', ')}`
          );
        }
      }
      if (aad.endOfSpeechSensitivity !== undefined) {
        if (!VALID_END_SENSITIVITY.has(aad.endOfSpeechSensitivity)) {
          reasons.push(
            `INVALID_ENUM: setup.realtimeInputConfig.automaticActivityDetection.endOfSpeechSensitivity = "${aad.endOfSpeechSensitivity}"`
            + ` — must be one of: ${[...VALID_END_SENSITIVITY].join(', ')}`
          );
        }
      }
    }

    if (setup.generationConfig?.responseModalities && Array.isArray(setup.generationConfig.responseModalities)) {
      for (const m of setup.generationConfig.responseModalities) {
        if (!VALID_MODALITIES.has(m)) {
          reasons.push(
            `INVALID_ENUM: setup.generationConfig.responseModalities contains "${m}"`
            + ` — must be one of: ${[...VALID_MODALITIES].join(', ')}`
          );
        }
      }
    }

    return { valid: reasons.length === 0, reasons };
  }

  _debugLogSend(type, payload) {
    const json = JSON.stringify(payload);
    const keys = Object.keys(payload);
    logger.info('GEMINI_WS_SEND', {
      callSid: this._callSid,
      type,
      topLevelKeys: keys,
      payloadSize: json.length,
    });
  }

  getResumptionHandle() {
    return this._resumptionHandle;
  }

  getSessionId() {
    return this._sessionId;
  }

  getMetrics() {
    return { ...this._metrics };
  }

  static getApiVersion() {
    return GEMINI_LIVE_API_VERSION;
  }

  static getBaseUrl() {
    return GEMINI_LIVE_BASE;
  }

  static getSupportedModels() {
    return [...SUPPORTED_REALTIME_MODELS];
  }

  static isModelSupported(model) {
    return SUPPORTED_REALTIME_MODELS.has(model);
  }

  _logProtocolCompliance(payload) {
    const report = [];

    const json = JSON.stringify(payload);
    const removedOrChanged = [];

    if (json.includes('userAudio') || json.includes('outputAudio')) {
      removedOrChanged.push('OPENAI_ARTIFACT_REMAINING: userAudio/outputAudio still present in payload');
    }

    if (json.includes('speechModelV2')) {
      removedOrChanged.push('REMOVED_FIELD: speechModelV2 should not be present');
    }

    const setup = payload.setup || {};
    const gc = setup.generationConfig || {};

    report.push('--- Gemini Live Protocol Compliance Report ---');

    const topFields = Object.keys(setup);
    report.push(`Top-level fields: [${topFields.join(', ')}]`);

    if (topFields.includes('model')) report.push('  model ✓ — present');
    if (topFields.includes('systemInstruction')) report.push('  systemInstruction ✓ — present as Content { parts: [{ text }] }');
    if (topFields.includes('generationConfig')) {
      const gcFields = Object.keys(gc || {});
      report.push(`  generationConfig ✓ — fields: [${gcFields.join(', ')}]`);

      const knownGc = ['candidateCount','maxOutputTokens','temperature','topP','topK','presencePenalty','frequencyPenalty','responseModalities','speechConfig','mediaResolution'];
      const unknownGc = gcFields.filter(f => !knownGc.includes(f));
      for (const u of unknownGc) {
        report.push(`    WARNING: ${u} is not in the documented GenerationConfig allowlist`);
      }
    }
    if (topFields.includes('tools')) report.push('  tools ✓ — array of Tool with functionDeclarations');
    if (topFields.includes('realtimeInputConfig')) {
      const ric = setup.realtimeInputConfig || {};
      const ricFields = Object.keys(ric);
      report.push(`  realtimeInputConfig ✓ — fields: [${ricFields.join(', ')}]`);
      if (ric.automaticActivityDetection) {
        const aad = ric.automaticActivityDetection;
        const aadFields = Object.keys(aad);
        report.push(`    automaticActivityDetection ✓ — fields: [${aadFields.join(', ')}]`);

        report.push(`    startOfSpeechSensitivity: "${aad.startOfSpeechSensitivity}"`);
        const validSss = ['START_SENSITIVITY_UNSPECIFIED','START_SENSITIVITY_HIGH','START_SENSITIVITY_LOW'];
        if (validSss.includes(aad.startOfSpeechSensitivity)) {
          report.push('      ✓ valid protobuf enum name');
        } else {
          report.push('      ✗ INVALID — must be full enum name (e.g. START_SENSITIVITY_LOW)');
        }

        report.push(`    endOfSpeechSensitivity: "${aad.endOfSpeechSensitivity}"`);
        const validEss = ['END_SENSITIVITY_UNSPECIFIED','END_SENSITIVITY_HIGH','END_SENSITIVITY_LOW'];
        if (validEss.includes(aad.endOfSpeechSensitivity)) {
          report.push('      ✓ valid protobuf enum name');
        } else {
          report.push('      ✗ INVALID — must be full enum name (e.g. END_SENSITIVITY_LOW)');
        }
      }
    }

    if (gc.speechConfig) {
      const sc = gc.speechConfig;
      const scFields = Object.keys(sc);
      report.push(`  speechConfig ✓ — fields: [${scFields.join(', ')}]`);
      if (sc.voiceConfig) {
        const vcFields = Object.keys(sc.voiceConfig);
        report.push(`    voiceConfig ✓ — fields: [${vcFields.join(', ')}]`);
        if (sc.voiceConfig.prebuiltVoiceConfig) {
          const pvc = sc.voiceConfig.prebuiltVoiceConfig;
          report.push(`      prebuiltVoiceConfig.voiceName: "${pvc.voiceName}" ✓`);
        }
      }
    }

    if (removedOrChanged.length > 0) {
      for (const r of removedOrChanged) {
        report.push(`  ${r}`);
      }
    }

    report.push('--- End Protocol Compliance Report ---');

    for (const line of report) {
      logger.info('GEMINI_COMPLIANCE', { callSid: this._callSid, line });
    }
  }
}
