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
  bufferTranscriptEntry,
  flushPendingTranscripts,
} from './receptionistTranscript.service.js';
import { mapToOpenAIVoice, buildSystemPrompt, buildToolDefinitions } from './receptionistVoice.service.js';
import * as orchestrator from './receptionistOrchestrator.service.js';
import * as transcriptService from './receptionistTranscript.service.js';
import * as callService from './receptionistCall.service.js';
import { redirectToGreeting } from './twilioWebhook.service.js';
import * as providerHealth from './receptionistProviderHealth.service.js';
import { resolveTenant, isPersistenceAvailable, getResolvedOwner } from './receptionistTenantResolver.service.js';

const OPENAI_REALTIME_URL = 'wss://api.openai.com/v1/realtime';
const MAX_RECONNECT_ATTEMPTS = 3;
const SESSION_CREATED_TIMEOUT_MS = 8000;
const SESSION_UPDATE_TIMEOUT_MS = 8000;
const GREETING_AUDIO_TIMEOUT_MS = 10000;
const WS_UPGRADE_TIMEOUT_MS = 8000;

const BUSINESS_TOOLS_ENABLED = config.realtime?.businessToolsEnabled ?? true;

const ALLOWED_TOOLS = new Set([
  'lookup_customer',
  'create_appointment',
  'create_support_ticket',
  'save_customer_note',
  'request_human_handoff',
  'end_call',
]);

const COMPLETED_TOOL_CALLS = new Set();
const MAX_TOOL_RETRIES = 2;
const TOOL_TIMEOUT_MS = 15000;
const ROLLBACK_ACTIONS = [];

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

  logger.info('TWILIO_WS_CONNECTION_OPEN', { pathname: req.url, urlCallSid });

  let callSid = urlCallSid;
  let rtmSession = null;
  let legacySession = null;
  let openaiWs = null;
  let reconnectAttempts = 0;
  let isClosing = false;
  let audioBridgeActive = false;
  let greetingSent = false;
  let sessionCreatedTimer = null;
  let sessionUpdateTimer = null;
  let sessionUpdateAcknowledged = false;
  let sessionCreatedReceived = false;
  let greetingTimeoutMs = GREETING_AUDIO_TIMEOUT_MS;
  let greetingTimeoutTimer = null;
  let fullDuplexEstablished = false;
  let lastDropLogTime = 0;
  let droppedFrameCount = 0;
  let firstDropLogged = false;
  const timers = [];

  let callRecordId = null;
  let userId = null;
  let customerMemory = null;
  let customerId = null;
  let collectedData = {};
  let currentIntent = null;
  let currentStage = 'greeting';
  let pendingAction = null;
  let callTranscriptBuffer = [];

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
    if (!providerHealth.getInternalState().available) {
      logger.warn('GREETING_SKIPPED_PROVIDER_UNAVAILABLE', { callSid });
      return;
    }
    greetingSent = true;
    if (rtmSession) {
      rtmSession.greetingSent = true;
      rtmSession.diagGreetingRequestTime = Date.now();
      rtmSession.setState(RealtimeSessionManager.STATES.GREETING);
    }
    if (openaiWs?.readyState === WebSocket.OPEN) {
      const greetingText = customerMemory?.isReturning && customerMemory?.customer?.name
        ? `Welcome back, ${customerMemory.customer.name}. Last time we discussed FleetNimble. How may I help you today?`
        : "Hello. Thank you for calling FleetNimble. I'm the FleetNimble AI Receptionist. How may I help you today?";
      const greetingPayload = {
        type: 'response.create',
        response: {
          modalities: ['text', 'audio'],
          instructions: `Say: "${greetingText}"`,
        },
      };
      openaiWs.send(JSON.stringify(greetingPayload));
      logger.info('GREETING_REQUEST_STARTED', { callSid, personalized: !!customerMemory });

      if (greetingTimeoutTimer) clearTimeout(greetingTimeoutTimer);
      greetingTimeoutTimer = setTimeout(() => {
        if (isClosing || !callSid) return;
        logger.error('GREETING_TIMEOUT', { callSid, timeoutMs: greetingTimeoutMs });
        endCallGracefully('Thank you for calling FleetNimble. Our system is experiencing a delay. Please try again later. Goodbye.');
      }, greetingTimeoutMs);
      timers.push(greetingTimeoutTimer);
    } else {
      logger.warn('GREETING_SKIPPED_OPENAI_NOT_OPEN', { callSid, readyState: openaiWs?.readyState });
    }
  }

  async function executeToolCall(functionName, args) {
    let result;

    switch (functionName) {
      case 'lookup_customer': {
        if (args?.phone && userId) {
          const memory = await orchestrator.lookupCustomerByPhone(userId, args.phone);
          if (memory) {
            customerMemory = memory;
            customerId = memory.customer?.id;
            result = { found: true, name: memory.customer?.name, company: memory.customer?.companyName, isReturning: memory.isReturning, lastContact: memory.customer?.lastContactAt };
          } else {
            result = { found: false };
          }
        } else {
          result = { found: false, reason: 'no_phone_or_user' };
        }
        break;
      }

      case 'create_appointment': {
        if (!BUSINESS_TOOLS_ENABLED) {
          logger.warn('VOICE_AGENT_TOOL_FAILED', { tool: 'create_appointment', error: 'feature_disabled', callSid });
          return { error: 'feature_disabled', message: 'Business tools are currently disabled' };
        }

        collectedData.callerName = collectedData.callerName || args?.callerName;
        collectedData.company = collectedData.company || args?.companyName;
        collectedData.fleetSize = collectedData.fleetSize || args?.fleetSize;
        collectedData.email = collectedData.email || args?.email;
        collectedData.phone = collectedData.phone || args?.phone;
        collectedData.meetingPurpose = collectedData.meetingPurpose || args?.meetingPurpose;

        if (args?.scheduledDateTime) {
          const dt = new Date(args.scheduledDateTime);
          if (!isNaN(dt.getTime())) {
            collectedData.preferredDate = dt.toISOString().split('T')[0];
            collectedData.preferredTime = dt.toTimeString().split(' ')[0].substring(0, 5);
          }
        }

        const session = {
          userId, callId: callRecordId, customerId, collectedData,
          currentStage, pendingAction,
        };

        let orchestratorResult;
        try {
          orchestratorResult = await orchestrator.executeAppointmentCreation(session);
        } catch (err) {
          logger.error('VOICE_AGENT_TOOL_FAILED', {
            tool: 'create_appointment',
            payload: args,
            error: err.message,
            stack: err.stack,
            callSid,
            customerId,
            sessionId: callRecordId,
            conversationState: currentStage,
          });
          return { success: false, message: 'I encountered a system error creating the appointment. Our team has been notified.', error: err.message };
        }

        if (orchestratorResult.actionResult) {
          collectedData = orchestratorResult.collectedData || collectedData;
          collectedData.appointmentCreated = true;
          pendingAction = null;
          currentStage = 'completed';
          result = { success: true, appointmentId: orchestratorResult.actionResult.id, message: orchestratorResult.reply };
        } else {
          logger.error('VOICE_AGENT_TOOL_FAILED', {
            tool: 'create_appointment',
            payload: args,
            error: orchestratorResult.reply,
            callSid,
            customerId,
            sessionId: callRecordId,
            conversationState: currentStage,
          });
          result = { success: false, message: orchestratorResult.reply || 'Unable to create the appointment.', error: 'creation_failed' };
        }
        break;
      }

      case 'create_support_ticket': {
        if (!BUSINESS_TOOLS_ENABLED) {
          logger.warn('VOICE_AGENT_TOOL_FAILED', { tool: 'create_support_ticket', error: 'feature_disabled', callSid });
          return { error: 'feature_disabled', message: 'Business tools are currently disabled' };
        }
        collectedData.issue = args?.issueTitle || args?.issueDescription || collectedData.issue;
        collectedData.callerName = collectedData.callerName || args?.callerName;
        collectedData.phone = collectedData.phone || args?.callerPhone;
        collectedData.email = collectedData.email || args?.callerEmail;
        collectedData.company = collectedData.company || args?.companyName;
        collectedData.urgency = args?.urgency || collectedData.urgency || 'MEDIUM';
        collectedData.vehicleReference = args?.relatedVehicle || collectedData.vehicleReference;

        const session = {
          userId, callId: callRecordId, customerId, collectedData,
          currentStage, pendingAction,
        };

        let orchestratorResult;
        try {
          orchestratorResult = await orchestrator.executeSupportTicketCreation(session);
        } catch (err) {
          logger.error('VOICE_AGENT_TOOL_FAILED', {
            tool: 'create_support_ticket',
            payload: args,
            error: err.message,
            stack: err.stack,
            callSid,
            customerId,
            sessionId: callRecordId,
            conversationState: currentStage,
          });
          return { success: false, message: 'I encountered a system error creating the support ticket. Our team has been notified.', error: err.message };
        }

        if (orchestratorResult.actionResult) {
          collectedData.supportTicketCreated = true;
          pendingAction = null;
          currentStage = 'completed';
          result = { success: true, ticketId: orchestratorResult.actionResult.id, message: orchestratorResult.reply };
        } else {
          logger.error('VOICE_AGENT_TOOL_FAILED', {
            tool: 'create_support_ticket',
            payload: args,
            error: orchestratorResult.reply,
            callSid,
            customerId,
            sessionId: callRecordId,
            conversationState: currentStage,
          });
          result = { success: false, message: orchestratorResult.reply || 'Unable to create the support ticket.', error: 'creation_failed' };
        }
        break;
      }

      case 'save_customer_note': {
        if (customerId && args?.content) {
          const { default: crmService } = await import('./receptionistCRM.service.js');
          await crmService.addCustomerNote(userId, customerId, args.content, args.noteType || 'CALL');
          result = { success: true, noteSaved: true };
        } else {
          result = { success: false, reason: 'missing_customer_or_content' };
        }
        break;
      }

      case 'request_human_handoff': {
        const department = args?.department || 'support';
        if (callRecordId) {
          const { default: handoffService } = await import('./receptionistHandoff.service.js');
          await handoffService.escalateCall(callRecordId, args?.reason || 'Caller requested human', department);
        }
        result = { success: true, department, message: 'Handoff initiated' };
        break;
      }

      case 'end_call': {
        result = { success: true, message: 'Ending call' };
        scheduleTimer(() => {
          endCallGracefully('Thank you for calling FleetNimble. Have a great day! Goodbye.');
        }, 1000);
        break;
      }

      default:
        result = { error: 'not_implemented', message: `Tool ${functionName} not implemented` };
    }

    return result;
  }

  async function rollbackToolCall(functionName, originalArgs) {
    logger.warn('TOOL_ROLLBACK', { callSid, functionName });
    switch (functionName) {
      case 'create_appointment':
        collectedData.appointmentCreated = false;
        currentStage = 'collecting';
        break;
      case 'create_support_ticket':
        collectedData.supportTicketCreated = false;
        currentStage = 'collecting';
        break;
      case 'save_customer_note':
        break;
    }
    ROLLBACK_ACTIONS.length = 0;
  }

  async function handleToolCall(functionName, args, callId) {
    const toolCallKey = `${callSid}_${functionName}_${callId}`;
    if (COMPLETED_TOOL_CALLS.has(toolCallKey)) {
      logger.warn('DUPLICATE_TOOL_CALL_REJECTED', { callSid, functionName });
      return { error: 'duplicate_call', message: 'This action has already been completed' };
    }

    if (!ALLOWED_TOOLS.has(functionName)) {
      logger.warn('UNKNOWN_TOOL_REJECTED', { callSid, functionName });
      return { error: 'unknown_tool', message: 'Tool not available' };
    }

    logger.info('TOOL_CALL_EXECUTING', { callSid, functionName, args });

    let lastError = null;
    const maxRetries = functionName === 'lookup_customer' ? 0 : MAX_TOOL_RETRIES;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('tool_timeout')), TOOL_TIMEOUT_MS)
      );

      try {
        const result = await Promise.race([
          executeToolCall(functionName, args),
          timeoutPromise,
        ]);

        if (result && result.success === false && attempt < maxRetries) {
          lastError = result.error || 'transient_failure';
          logger.warn('TOOL_RETRY', { callSid, functionName, attempt, error: lastError });
          if (attempt < maxRetries - 1) {
            await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 500));
          }
          continue;
        }

        COMPLETED_TOOL_CALLS.add(toolCallKey);
        return result;
      } catch (err) {
        lastError = err.message;
        logger.warn('TOOL_RETRY', { callSid, functionName, attempt, error: err.message });

        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 500;
          await new Promise(r => setTimeout(r, delay));
          continue;
        }

        await rollbackToolCall(functionName, args);

        logger.error('VOICE_AGENT_TOOL_FAILED', {
          tool: functionName,
          payload: args,
          error: err.message,
          stack: err.stack,
          callSid,
          customerId,
          sessionId: callRecordId,
          conversationState: currentStage,
        });
        return { success: false, message: 'I encountered an issue processing that request. Our team has been notified.', error: err.message };
      }
    }

    await rollbackToolCall(functionName, args);
    logger.error('VOICE_AGENT_TOOL_FAILED', {
      tool: functionName,
      payload: args,
      error: lastError || 'max_retries_exceeded',
      callSid,
      customerId,
      sessionId: callRecordId,
      conversationState: currentStage,
    });
    return { success: false, message: 'Unable to complete that action after multiple attempts.', error: lastError || 'max_retries_exceeded' };
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
    logger.info('OPENAI_CONNECT_ATTEMPT', { callSid, model: config.realtime.model });
    const voice = mapToOpenAIVoice(config.realtime.voice);
    const openaiUrl = buildOpenAiUrl();

    try {
      openaiWs = new WebSocket(openaiUrl, {
        headers: {
          Authorization: `Bearer ${config.openai.apiKey}`,
        },
      });
      if (rtmSession) rtmSession.openAiSocket = openaiWs;
      if (legacySession) setOpenaiWs(callSid, openaiWs);
    } catch (err) {
      logger.error('REALTIME_CALL_FAILED', { callSid, reason: 'openai_connect_error', error: err.message });
      gracefulClose();
      return;
    }

    // Open timeout
    const openTimeout = scheduleTimer(() => {
      if (isClosing) return;
      logger.error('OPENAI_SOCKET_OPEN_TIMEOUT', { callSid, timeoutMs: WS_UPGRADE_TIMEOUT_MS });
      gracefulClose();
    }, WS_UPGRADE_TIMEOUT_MS);

    openaiWs.on('open', () => {
      if (isClosing) return;
      clearTimeout(openTimeout);
      logger.info('OPENAI_SOCKET_OPEN', { callSid, model: config.realtime.model });
      reconnectAttempts = 0;

      const memoryContext = customerMemory
        ? buildMemoryContext(customerMemory)
        : '';

      const tools = BUSINESS_TOOLS_ENABLED ? buildToolDefinitions(true) : [];

      // Send minimal session.update first — some models reject unknown fields
      const basePayload = {
        type: 'session.update',
        session: {
          modalities: ['text', 'audio'],
          instructions: buildSystemPrompt({ businessName: 'FleetNimble', realtime: config.realtime }, memoryContext),
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
      openaiWs.send(JSON.stringify(basePayload));
      logger.info('SESSION_UPDATE_SENT', {
        callSid,
        keys: Object.keys(basePayload.session),
        hasTools: tools.length > 0,
      });
      if (tools.length > 0) {
        scheduleTimer(() => {
          if (isClosing || openaiWs?.readyState !== WebSocket.OPEN) return;
          const toolsPayload = { type: 'session.update', session: { tools, tool_choice: 'auto' } };
          openaiWs.send(JSON.stringify(toolsPayload));
        }, 2000);
      }

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

        // Log every non-audio event type for diagnostics
        if (msg.type && msg.type !== 'response.audio.delta' && msg.type !== 'input_audio_buffer.speech_started') {
          logger.info('OPENAI_EVENT_TYPE', { callSid, type: msg.type });
        }

        if (msg.type === 'session.created') {
          if (sessionCreatedTimer) {
            clearTimeout(sessionCreatedTimer);
            sessionCreatedTimer = null;
          }
          sessionCreatedReceived = true;
          RealtimeModelValidator.markSucceeded(config.realtime.model);
          logger.info('OPENAI_SESSION_CREATED', {
            callSid,
            sessionId: msg.session?.id,
            model: msg.session?.model || config.realtime.model,
          });
          if (rtmSession) rtmSession.setState(RealtimeSessionManager.STATES.CONNECTED);

          // Set fallback timeout for session.updated
          sessionUpdateTimer = setTimeout(() => {
            if (isClosing) return;
            if (!sessionUpdateAcknowledged) {
              logger.warn('SESSION_UPDATE_TIMEOUT', { callSid, timeoutMs: SESSION_UPDATE_TIMEOUT_MS });
              sessionUpdateAcknowledged = true;
              if (sessionCreatedReceived && !greetingSent) sendGreeting();
            }
          }, SESSION_UPDATE_TIMEOUT_MS);
          timers.push(sessionUpdateTimer);
        }

        if (msg.type === 'session.updated') {
          sessionUpdateAcknowledged = true;
          if (sessionUpdateTimer) {
            clearTimeout(sessionUpdateTimer);
            sessionUpdateTimer = null;
          }
          logger.info('SESSION_UPDATE_ACCEPTED', { callSid });
        }

        // Gate greeting on BOTH session.created AND session.updated
        if (sessionCreatedReceived && sessionUpdateAcknowledged && !greetingSent) {
          sendGreeting();
        }

        // Track first greeting audio delta in closure scope (greetingTimeoutTimer is here)
        if (msg.type === 'response.audio.delta' && rtmSession && !rtmSession.greetingAudioReceived && rtmSession.state === RealtimeSessionManager.STATES.GREETING) {
          rtmSession.greetingAudioReceived = true;
          rtmSession.diagGreetingFirstAudioTime = Date.now();
          const latencyMs = rtmSession.diagGreetingRequestTime ? Date.now() - rtmSession.diagGreetingRequestTime : null;
          logger.info('GREETING_FIRST_AUDIO_RECEIVED', { callSid, latencyMs });
          if (greetingTimeoutTimer) {
            clearTimeout(greetingTimeoutTimer);
            greetingTimeoutTimer = null;
          }
        }

        await handleOpenAIMessage(msg, rtmSession, legacySession, openaiWs);
      } catch (err) {
        logger.error('OPENAI_MESSAGE_PARSE_ERROR', { callSid, error: err.message });
      }
    });

    openaiWs.on('close', (code, reason) => {
      logger.info('OPENAI_SOCKET_CLOSED', {
        callSid,
        code,
        reason: reason?.toString() || null,
        model: config.realtime.model,
      });
      if (legacySession) setOpenaiWs(callSid, null);
      if (rtmSession) rtmSession.openAiSocket = null;

      if (isClosing) return;
      // Fatal provider errors — never reconnect
      if (!providerHealth.getInternalState().available || legacySession?.stopReconnect || rtmSession?.stopReconnect) {
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
      const classification = providerHealth.classifyError(err);
      if (classification.fatal) {
        providerHealth.handleFatalError(err, callSid);
        if (legacySession) legacySession.stopReconnect = true;
        if (rtmSession) rtmSession.stopReconnect = true;
        gracefulClose();
        return;
      }
      providerHealth.handleTransientError(err, callSid);
      if (rtmSession) {
        rtmSession.lastError = { message: err.message, code: err.code, time: Date.now() };
      }
      if (!isClosing && (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS || legacySession?.stopReconnect || rtmSession?.stopReconnect)) {
        gracefulClose();
      }
    });

    openaiWs.on('unexpected-response', (req, res) => {
      let bodyChunks = [];
      res.on('data', (chunk) => bodyChunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(bodyChunks).toString();
        logger.error('OPENAI_UNEXPECTED_RESPONSE', {
          callSid,
          statusCode: res.statusCode,
          statusMessage: res.statusMessage,
          model: config.realtime.model,
        });
        const errForHealth = { code: `http_${res.statusCode}`, message: body.substring(0, 200) };
        providerHealth.handleFatalError(errForHealth, callSid);
        if (legacySession) legacySession.stopReconnect = true;
        if (rtmSession) rtmSession.stopReconnect = true;
        gracefulClose();
      });
    });
  }

  async function gracefulClose() {
    if (isClosing) return;
    isClosing = true;
    if (rtmSession) rtmSession.setState(RealtimeSessionManager.STATES.CLOSING);
    clearTimers();
    if (sessionCreatedTimer) {
      clearTimeout(sessionCreatedTimer);
      sessionCreatedTimer = null;
    }
    if (greetingTimeoutTimer) {
      clearTimeout(greetingTimeoutTimer);
      greetingTimeoutTimer = null;
    }
    if (sessionUpdateTimer) {
      clearTimeout(sessionUpdateTimer);
      sessionUpdateTimer = null;
    }

    const greetingNotDelivered = !greetingSent || (rtmSession && !rtmSession.greetingAudioReceived && greetingSent);

    if (greetingNotDelivered && callSid) {
      logger.info('FALLBACK_REDIRECT_TO_GREETING', { callSid, greetingSent, greetingAudioReceived: rtmSession?.greetingAudioReceived });
      try {
        await redirectToGreeting(callSid);
      } catch { /* best effort */ }
    }

    try {
      if (callRecordId || callSid) {
        await flushPendingTranscripts();
        const summaryText = callTranscriptBuffer
          .filter(t => t.role === 'assistant')
          .slice(-3)
          .map(t => t.content?.substring(0, 100))
          .join(' | ') || 'Call completed';
        const transcriptJson = JSON.stringify(callTranscriptBuffer.slice(-500));

        await orchestrator.updateCallRecordAtEnd({
          callId: callRecordId,
          callSid,
          userId,
          intent: currentIntent,
          summary: summaryText,
          transcript: transcriptJson,
          sentiment: 'neutral',
          customerId,
        }).catch(e => logger.warn('CALL_END_UPDATE_FAILED', { error: e.message }));

        if (customerId) {
          await orchestrator.updateCRMAfterCall({
            userId,
            customerId,
            collectedData,
            intent: currentIntent,
            summary: summaryText,
            sentiment: 'neutral',
          }).catch(e => logger.warn('CRM_END_UPDATE_FAILED', { error: e.message }));
        }
      }
    } catch (err) {
      logger.warn('CALL_END_CLEANUP_ERROR', { callSid, error: err.message });
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
      if (legacySession) removeSession(callSid);
      if (rtmSession) RealtimeSessionManager.remove(callSid);
      if (rtmSession) rtmSession.setState(RealtimeSessionManager.STATES.CLOSED);
      logger.info('CALL_SESSION_CLEANED', {
        callSid,
        greetingSent,
        greetingAudioReceived: rtmSession?.greetingAudioReceived,
        totalDroppedAudioFrames: droppedFrameCount,
        providerError: providerHealth.getInternalState().lastErrorCode,
      });
    }
    providerHealth.enableAudioForwarding();
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
        logger.info('TWILIO_CONNECTED_EVENT', { callSid });
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

        // Resolve tenant owner for this call
        const callerPhone = params.from || start.from || null;
        const calledNumber = params.to || start.to || null;
        const twilioAccountSid = params.AccountSid || null;

        resolveTenant({ calledNumber, twilioAccountSid, callSid }).then(owner => {
          if (owner?.userId) {
            userId = owner.userId;
            logger.info('TENANT_RESOLVED_FOR_CALL', { callSid, source: owner.source });
          } else {
            logger.warn('TENANT_NOT_RESOLVED', { callSid });
          }
        });

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

        if (callerPhone) {
          const normalized = callerPhone.replace(/[^\d+]/g, '');
          // Only look up customer if we have a valid resolved userId
          const lookupUserId = userId || getResolvedOwner()?.userId;
          orchestrator.lookupCustomerByPhone(lookupUserId, normalized).then(memory => {
            if (memory && memory.customer) {
              customerMemory = memory;
              customerId = memory.customer?.id;
              if (memory.customer?.userId) userId = memory.customer.userId;
              logger.info('CUSTOMER_IDENTIFIED', { callSid, name: memory.customer?.name });
            }
          }).catch(() => {});
        }

        // Only create call record if we have a valid resolved userId
        const recordUserId = userId || getResolvedOwner()?.userId;
        if (recordUserId && isPersistenceAvailable()) {
          orchestrator.createCallRecord({
            userId: recordUserId,
            callSid,
            from: callerPhone,
            to: calledNumber,
            twilioAccountSid,
          }).then(record => {
            if (record) {
              callRecordId = record.id;
              if (legacySession) legacySession.metadata.callLogId = record.id;
            }
          }).catch(e => logger.warn('CALL_RECORD_START_FAILED', { error: e.message }));
        } else {
          logger.info('CALL_RECORD_SKIPPED_NO_OWNER', { callSid });
        }

        logger.info('TWILIO_START_EVENT', {
          callSid,
          streamSid,
          fromTail: callerPhone ? callerPhone.slice(-4) : 'unknown',
          hasCustomParams: Object.keys(params).length > 0,
        });

        if (streamSid) {
          logger.info('STREAM_SID_CAPTURED', {
            callSid,
            streamSidMasked: streamSid.slice(-4),
          });
        }

        scheduleTimer(() => {
          endCallGracefully('Thank you for calling FleetNimble. Please contact us again if you need further help. Goodbye.');
        }, (config.realtime?.maxCallSeconds || 600) * 1000);

        const silenceMs = Math.max(5000, (config.realtime?.silenceTimeoutSeconds || 30) * 1000);
        const silenceInterval = setInterval(() => {
          if (isClosing || !rtmSession) return;
          if (Date.now() - rtmSession.lastActivity > (config.realtime?.silenceTimeoutSeconds || 30) * 1000) {
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
          logger.warn('TWILIO_AUDIO_VALIDATION_FAILED', { callSid, reason: validation.reason });
          if (rtmSession) rtmSession.droppedPackets++;
          break;
        }

        if (!audioBridgeActive) {
          audioBridgeActive = true;
          logger.info('CALLER_AUDIO_RECEIVED', { callSid, streamSid: msg.streamSid });
        }

        if (rtmSession) {
          rtmSession.audioBytesReceived += validation.byteLength;
          rtmSession.packetsReceived++;
        }

        if (openaiWs?.readyState === WebSocket.OPEN && !providerHealth.isAudioForwardingDisabled()) {
          openaiWs.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: payload }));
          if (logger.isLevelEnabled('debug')) {
            logger.info('CALLER_AUDIO_FORWARDED', { callSid, byteLength: validation.byteLength });
          }
          if (!fullDuplexEstablished) {
            fullDuplexEstablished = true;
            logger.info('FULL_DUPLEX_ESTABLISHED', { callSid });
          }
        } else {
          const now = Date.now();
          droppedFrameCount++;
          if (!firstDropLogged) {
            firstDropLogged = true;
            logger.info('CALLER_AUDIO_DROPPED', {
              callSid,
              reason: providerHealth.isAudioForwardingDisabled() ? 'provider_unavailable' : 'openai_socket_not_open',
              openaiWsReadyState: openaiWs?.readyState,
            });
          } else if (now - lastDropLogTime > 5000) {
            lastDropLogTime = now;
            logger.info('CALLER_AUDIO_DROPPED_SUMMARY', {
              callSid,
              reason: providerHealth.isAudioForwardingDisabled() ? 'provider_unavailable' : 'openai_socket_not_open',
              totalDrops: droppedFrameCount,
              intervalMs: 5000,
            });
          }
          if (rtmSession) rtmSession.droppedPackets++;
        }
        break;
      }

      case 'mark':
        break;

      case 'stop':
        logger.info('TWILIO_STOP_EVENT', { callSid });
        gracefulClose();
        break;
    }
  });

  logger.info('TWILIO_WS_CONNECTION_OPEN', { callSid, pathname: req.url });

  ws.on('close', (code, reason) => {
    logger.info('TWILIO_WS_CLOSED', {
      callSid,
      code,
      reason: reason?.toString() || null,
    });
    gracefulClose();
  });

  ws.on('error', (err) => {
    logger.error('TWILIO_WS_CONNECTION_ERROR', {
      callSid,
      error: err.message,
      code: err.code,
    });
    gracefulClose();
  });
}

export async function handleOpenAIMessage(msg, rtmSession, legacySession, openaiWs) {
  if (!rtmSession && !legacySession) return;
  const { callSid } = rtmSession || legacySession || {};
  const io = legacySession?.ws?.app?.get('io');

  switch (msg.type) {
    case 'session.created':
    case 'session.updated':
      // handled in connectToOpenAI message handler
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
          callSid, text: '...', isSpeaking: true,
        });
      }
      break;

    case 'conversation.item.created':
      if (msg.item?.type === 'message' && msg.item?.content) {
        for (const content of msg.item.content) {
          if (content.type === 'text') {
            const role = msg.item.role === 'user' ? 'caller' : 'assistant';
            addTranscriptEntry(callSid, { role, content: content.text });
            if (legacySession?.metadata?.callLogId) {
              bufferTranscriptEntry(legacySession.metadata.callLogId, { role, content: content.text, timestamp: new Date().toISOString() });
            }
          } else if (content.type === 'transcript') {
            const role = msg.item.role === 'user' ? 'caller' : 'assistant';
            addTranscriptEntry(callSid, { role, content: content.transcript });
            if (role === 'caller') {
              logger.info('TRANSCRIPTION_RECEIVED', { callSid, textPreview: content.transcript?.substring(0, 60) });
            }
            if (io) {
              io.to(`user:${legacySession?.metadata?.userId}`).emit('transcript.final', {
                callSid, role, text: content.transcript, timestamp: new Date().toISOString(),
              });
            }
            if (legacySession?.metadata?.callLogId) {
              bufferTranscriptEntry(legacySession.metadata.callLogId, { role, content: content.transcript, timestamp: new Date().toISOString() });
            }

            const transcript = legacySession?.transcript || [];
            if (!transcript.some(t => t.role === role && t.content === content.transcript)) {
              transcript.push({ role, content: content.transcript, timestamp: new Date().toISOString() });
            }
            if (legacySession) legacySession.transcript = transcript.slice(-500);
          }
        }
      }

      if (msg.item?.type === 'function_call' && msg.item?.name) {
        logger.info('FUNCTION_CALL_RECEIVED', { callSid, name: msg.item.name, callId: msg.item.call_id });
      }
      break;

    case 'response.function_call_arguments.done': {
      const { name, arguments: rawArgs, call_id } = msg;
      if (!name || !call_id) {
        logger.warn('FUNCTION_CALL_MISSING_FIELDS', { callSid, name, call_id });
        break;
      }

      logger.info('FUNCTION_CALL_ARGUMENTS_DONE', { callSid, name, call_id });

      let args = {};
      try {
        args = rawArgs ? JSON.parse(rawArgs) : {};
      } catch {
        logger.warn('FUNCTION_CALL_PARSE_ERROR', { callSid, name, rawArgs });
        args = {};
      }

      const result = await handleToolCall(name, args, call_id);

      if (openaiWs?.readyState === WebSocket.OPEN) {
        const functionResponse = {
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id,
            output: JSON.stringify(result),
          },
        };
        openaiWs.send(JSON.stringify(functionResponse));
        logger.info('FUNCTION_CALL_RESPONSE_SENT', { callSid, name, call_id });

        try {
          openaiWs.send(JSON.stringify({ type: 'response.create' }));
        } catch { }
      }
      break;
    }

    case 'response.created':
      logger.info('AI_RESPONSE_STARTED', { callSid });
      break;

    case 'response.audio_transcript.delta':
      if (io) {
        io.to(`user:${legacySession?.metadata?.userId}`).emit('transcript.partial', {
          callSid, text: msg.delta, isSpeaking: false,
        });
      }
      break;

    case 'response.audio.delta': {
      // Only accept msg.delta — the officially documented audio delta field
      const audioDelta = msg.delta;
      if (!audioDelta || typeof audioDelta !== 'string' || audioDelta.length === 0) {
        logger.warn('OPENAI_AUDIO_DELTA_REJECTED', { callSid, reason: 'empty_or_nonstring', receivedFields: Object.keys(msg) });
        if (rtmSession) rtmSession.droppedPackets++;
        break;
      }

      const deltaSize = audioDelta.length;
      logger.info('OPENAI_AUDIO_DELTA_RECEIVED', { callSid, deltaSize });
      const streamSid = rtmSession?.streamSid || legacySession?.streamSid;

      if (!streamSid) {
        logger.warn('TWILIO_AUDIO_FRAME_DROPPED', { callSid, reason: 'missing_streamSid', deltaSize });
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
        // Twilio expects mu-law (g711_ulaw) audio — log format for diagnostics
        const audioFormat = config.realtime.audioOutputFormat || 'g711_ulaw';
        if (audioFormat !== 'g711_ulaw') {
          logger.warn('AUDIO_FORMAT_MISMATCH', { callSid, configuredFormat: audioFormat, expected: 'g711_ulaw', deltaSize });
        }
        twilioSocket.send(JSON.stringify({
          event: 'media',
          streamSid,
          media: { payload: audioDelta },
        }));
        logger.info('TWILIO_AUDIO_FRAME_SENT', { callSid, deltaSize, format: audioFormat });
      } else {
        logger.warn('TWILIO_AUDIO_FRAME_DROPPED', {
          callSid,
          reason: 'twilio_socket_not_open',
          twilioReadyState: twilioSocket?.readyState,
        });
        if (rtmSession) rtmSession.droppedPackets++;
      }
      break;
    }

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
      logger.error('OPENAI_ERROR_EVENT', {
        callSid,
        errorType: msg.error?.type || null,
        errorCode: msg.error?.code || null,
        errorMessage: msg.error?.message ? msg.error.message.substring(0, 200) : null,
      });
      const classification = providerHealth.classifyError(msg.error);
      if (classification.fatal) {
        providerHealth.handleFatalError(msg.error, callSid);
        if (legacySession) legacySession.stopReconnect = true;
        if (rtmSession) rtmSession.stopReconnect = true;
      } else {
        providerHealth.handleTransientError(msg.error, callSid);
      }
      break;

    case 'rate_limits.updated':
      break;
  }
}

function buildMemoryContext(memory) {
  if (!memory || !memory.customer) return '';
  const { customer, recentCalls, recentAppointments, recentTickets, isReturning } = memory;
  const parts = [];

  if (isReturning && customer.name) {
    parts.push(`Returning caller: ${customer.name}`);
    if (customer.companyName) parts.push(`Company: ${customer.companyName}`);
    if (customer.lastSummary) parts.push(`Last conversation summary: ${customer.lastSummary}`);
    if (customer.lastIntent) parts.push(`Last intent: ${customer.lastIntent}`);
  }

  if (customer.fleetSize != null) parts.push(`Fleet size: ${customer.fleetSize} vehicles`);
  if (customer.status) parts.push(`Customer status: ${customer.status}`);
  if (customer.leadScore > 0) parts.push(`Lead score: ${customer.leadScore}`);

  if (recentCalls?.length > 0) {
    const recent = recentCalls.map(c => `- ${c.callType} (${new Date(c.callStartedAt).toLocaleDateString()}): ${c.summary || 'No summary'}`).join('\n');
    parts.push(`Recent calls:\n${recent}`);
  }
  if (recentAppointments?.length > 0) {
    const appts = recentAppointments.map(a => `- ${a.meetingPurpose || 'Meeting'} on ${new Date(a.scheduledDate).toLocaleDateString()} (${a.status})`).join('\n');
    parts.push(`Recent appointments:\n${appts}`);
  }
  if (recentTickets?.length > 0) {
    const tickets = recentTickets.map(t => `- ${t.issueTitle} (${t.status}, ${t.urgency})`).join('\n');
    parts.push(`Recent support tickets:\n${tickets}`);
  }

  return parts.join('\n');
}

export { handleMediaStream };
