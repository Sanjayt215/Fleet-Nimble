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
import * as liveTools from './receptionistLiveTools.service.js';
import * as transcriptService from './receptionistTranscript.service.js';
import * as callService from './receptionistCall.service.js';
import { redirectToGreeting, redirectToUnavailable } from './twilioWebhook.service.js';
import * as providerHealth from './receptionistProviderHealth.service.js';
import * as metrics from './receptionistMetrics.service.js';
import { resolveTenant, isPersistenceAvailable, getResolvedOwner } from './receptionistTenantResolver.service.js';
import { createRealtimeVoiceProvider, isRealtimeProviderEnabled } from '../providers/realtime/realtimeVoiceProviderFactory.js';
import { validateTwilioPayload } from './audio/twilioAudioCodec.js';

const MAX_RECONNECT_ATTEMPTS = 2; // Phase 3 — max 2 retries, then redirect to greeting
const GREETING_AUDIO_TIMEOUT_MS = 10000;

const BUSINESS_TOOLS_ENABLED = config.realtime?.businessToolsEnabled ?? true;

const ALLOWED_TOOLS = new Set([
  'lookup_customer',
  'create_appointment',
  'create_support_ticket',
  'save_customer_note',
  'request_human_handoff',
  'end_call',
  'retrieve_knowledge',
  'update_conversation_memory',
  ...liveTools.getLiveToolNames(),
]);

const COMPLETED_TOOL_CALLS = new Set();
const MAX_TOOL_RETRIES = 2;
const TOOL_TIMEOUT_MS = 15000;
const ROLLBACK_ACTIONS = [];

function handleMediaStream(ws, req) {
  const urlParams = new URL(req.url, config.publicUrl).searchParams;
  const urlCallSid = urlParams.get('callSid') || null;

  logger.info('TWILIO_WS_CONNECTION_OPEN', { pathname: req.url, urlCallSid });

  let callSid = urlCallSid;
  let rtmSession = null;
  let legacySession = null;
  let provider = null;
  let reconnectAttempts = 0;
  let providerIndex = 0;
  let isClosing = false;
  let audioBridgeActive = false;
  let greetingSent = false;
  let greetingTimeoutMs = GREETING_AUDIO_TIMEOUT_MS;
  let greetingTimeoutTimer = null;
  let fullDuplexEstablished = false;
  let lastDropLogTime = 0;
  let droppedFrameCount = 0;
  let firstDropLogged = false;
  const earlyAudioQueue = [];
  let earlyAudioBytes = 0;
  const MAX_EARLY_AUDIO_BYTES = 64000;
  const MAX_EARLY_AUDIO_FRAMES = 100;
  const timers = [];

  let callRecordId = null;
  let userId = null;
  let companyId = null;
  let customerMemory = null;
  let customerId = null;
  let collectedData = {};
  let currentIntent = null;
  let currentStage = 'greeting';
  let pendingAction = null;
  let currentToolCallId = null;
  let currentToolCallKey = null;
  let toolCallInterrupted = false;
  let callTranscriptBuffer = [];

  // Phase 4 — audio pipeline counters
  let pipelineCounters = {
    incomingFrames: 0,
    outgoingFrames: 0,
    audioBytes: 0,
    speechEvents: 0,
    transcriptionEvents: 0,
  };
  // Phase 5 — zero-audio detection
  let responseCreatedSeen = false;
  let responseAudioSeen = false;
  let pipelineFailStage = null;
  let pipelineFailReason = null;

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
    if (provider && provider.isConnected) {
      const greetingText = customerMemory?.isReturning && customerMemory?.customer?.name
        ? `Welcome back, ${customerMemory.customer.name}. Last time we discussed FleetNimble. How may I help you today?`
        : "Hello. Thank you for calling FleetNimble. I'm the FleetNimble AI Receptionist. How may I help you today?";
      provider.sendText(greetingText);
      logger.info('GREETING_REQUEST_STARTED', { callSid, personalized: !!customerMemory });

      if (greetingTimeoutTimer) clearTimeout(greetingTimeoutTimer);
      greetingTimeoutTimer = setTimeout(() => {
        if (isClosing || !callSid) return;
        logger.error('GREETING_TIMEOUT', { callSid, timeoutMs: greetingTimeoutMs });
        endCallGracefully('Thank you for calling FleetNimble. Our system is experiencing a delay. Please try again later. Goodbye.');
      }, greetingTimeoutMs);
      timers.push(greetingTimeoutTimer);
    } else {
      logger.warn('GREETING_SKIPPED_PROVIDER_NOT_READY', { callSid, providerReady: provider?.isConnected });
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
          userId, companyId, callId: callRecordId, customerId, collectedData,
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
          userId, companyId, callId: callRecordId, customerId, collectedData,
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
        if (customerId && args?.content && userId) {
          const { default: crmService } = await import('./receptionistCRM.service.js');
          await crmService.addCustomerNote(userId, customerId, args.content, args.noteType || 'CALL');
          result = { success: true, noteSaved: true };
        } else {
          result = { success: false, reason: 'missing_customer_or_content_or_owner' };
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

      case 'retrieve_knowledge': {
        const { queryKnowledgeBase } = await import('./receptionistKnowledgeBase.service.js');
        const answer = await queryKnowledgeBase(args?.query || '', userId);
        result = { found: !!answer, answer: answer || null, query: args?.query };
        if (answer) {
          collectedData.lastKnowledgeQuery = args?.query;
        }
        break;
      }

      case 'update_conversation_memory': {
        if (args?.key && args?.value && userId) {
          const { default: prisma } = await import('../prisma/index.js');
          await prisma.aiUserPreference.upsert({
            where: { userId_key: { userId, key: `call_memory_${args.key}` } },
            create: { userId, key: `call_memory_${args.key}`, value: args.value },
            update: { value: args.value },
          });
          result = { success: true, memorySaved: args.key };
        } else {
          result = { success: false, reason: 'missing_key_value_or_user' };
        }
        break;
      }

      case 'end_call': {
        result = { success: true, message: 'Ending call' };
        scheduleTimer(() => {
          endCallGracefully('Thank you for calling FleetNimble. Have a great day! Goodbye.');
        }, 1000);
        break;
      }

      default: {
        if (liveTools.isLiveTool(functionName)) {
          const liveResult = await liveTools.executeLiveTool(userId, functionName, args);
          result = liveResult;
          if (liveResult.success) {
            const summary = liveTools.buildVoiceSummary(liveResult.data);
            if (summary) result.voiceSummary = summary;
          }
        } else {
          result = { error: 'not_implemented', message: `Tool ${functionName} not implemented` };
        }
        break;
      }
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

  function getProviderNameForIndex(index) {
    const primary = config.realtimeProvider?.provider || 'openai';
    const fallback = config.realtimeProvider?.fallbackProvider || (primary === 'openai' ? 'gemini' : 'openai');
    if (index === 0) return primary;
    return fallback;
  }

  function connectProvider() {
    if (isClosing || !callSid) return;

    if (!isRealtimeProviderEnabled() || !config.realtime.configured) {
      logger.error('REALTIME_CALL_FAILED', { callSid, reason: 'realtime_not_configured' });
      logger.error('PIPELINE_FAILURE', {
        callSid, stage: 'provider_connect', reason: 'realtime_not_configured',
      });
      gracefulClose();
      return;
    }

    if (rtmSession) rtmSession.setState(RealtimeSessionManager.STATES.CONNECTING);

    const providerName = getProviderNameForIndex(providerIndex);
    logger.info('PROVIDER_CONNECTING', { callSid, provider: providerName, attempt: reconnectAttempts, providerIndex });

    try {
      provider = createRealtimeVoiceProvider();
      if (!provider) {
        logger.error('REALTIME_CALL_FAILED', { callSid, reason: 'provider_creation_failed' });
        gracefulClose();
        return;
      }

      const memoryContext = customerMemory ? buildMemoryContext(customerMemory) : '';
      const businessToolsEnabled = config.realtime?.businessToolsEnabled ?? true;
      if (!businessToolsEnabled) {
        logger.warn('BUSINESS_TOOLS_DISABLED', { callSid, reason: 'config_flag_false', envKey: 'AI_RECEPTIONIST_BUSINESS_TOOLS_ENABLED' });
      }

      if (rtmSession) rtmSession.openAiSocket = provider;
      if (legacySession) setOpenaiWs(callSid, provider);

      provider.on('connected', () => {
        logger.info('PROVIDER_SOCKET_OPEN', { callSid, provider: providerName });
        reconnectAttempts = 0;
        metrics.recordProviderEvent({ type: 'connected' });
      });

      provider.on('ready', () => {
        logger.info('PROVIDER_SESSION_READY', { callSid, provider: providerName });
        if (rtmSession) rtmSession.setState(RealtimeSessionManager.STATES.CONNECTED);
        providerHealth.markVerified();
        if (!greetingSent) sendGreeting();
      });

      provider.on('audio', (data) => {
        if (data.format !== 'g711_ulaw') return;
        const audioDelta = data.audio;

        if (!audioDelta || typeof audioDelta !== 'string' || audioDelta.length === 0) {
          logger.warn('PROVIDER_AUDIO_DELTA_REJECTED', { callSid, reason: 'empty_or_nonstring', provider: providerName });
          if (rtmSession) rtmSession.droppedPackets++;
          return;
        }

        pipelineCounters.outgoingFrames++;
        pipelineCounters.audioBytes += (audioDelta?.length || 0);
        responseAudioSeen = true;

        // Track greeting first audio
        if (rtmSession && !rtmSession.greetingAudioReceived && rtmSession.state === RealtimeSessionManager.STATES.GREETING) {
          rtmSession.greetingAudioReceived = true;
          rtmSession.diagGreetingFirstAudioTime = Date.now();
          const latencyMs = rtmSession.diagGreetingRequestTime ? Date.now() - rtmSession.diagGreetingRequestTime : null;
          logger.info('GREETING_FIRST_AUDIO', { callSid, latencyMs });
          if (greetingTimeoutTimer) {
            clearTimeout(greetingTimeoutTimer);
            greetingTimeoutTimer = null;
          }
        }

        const streamSid = rtmSession?.streamSid || legacySession?.streamSid;
        if (!streamSid) {
          logger.warn('TWILIO_AUDIO_FRAME_DROPPED', { callSid, reason: 'missing_streamSid', deltaSize: audioDelta.length });
          if (rtmSession) rtmSession.droppedPackets++;
          return;
        }

        if (rtmSession) {
          if (rtmSession.state === RealtimeSessionManager.STATES.GREETING ||
              rtmSession.state === RealtimeSessionManager.STATES.LISTENING) {
            rtmSession.setState(RealtimeSessionManager.STATES.RESPONDING);
          }
          rtmSession.audioBytesSent += audioDelta.length;
          rtmSession.packetsSent++;
        }

        const twilioSocket = legacySession?.ws || rtmSession?.twilioSocket;
        if (twilioSocket && twilioSocket.readyState === WebSocket.OPEN) {
          twilioSocket.send(JSON.stringify({
            event: 'media',
            streamSid,
            media: { payload: audioDelta },
          }));
          logger.info('TWILIO_AUDIO_FRAME_SENT', { callSid, deltaSize: audioDelta.length, format: 'g711_ulaw' });
        } else {
          logger.warn('TWILIO_AUDIO_FRAME_DROPPED', {
            callSid,
            reason: 'twilio_socket_not_open',
            twilioReadyState: twilioSocket?.readyState,
          });
          if (rtmSession) rtmSession.droppedPackets++;
        }
      });

      provider.on('callerTranscript', (data) => {
        logger.info('CALLER_TRANSCRIPTION', { callSid, text: data.text?.substring(0, 60) });
        pipelineCounters.transcriptionEvents++;
        addTranscriptEntry(callSid, { role: 'caller', content: data.text });
        if (legacySession?.metadata?.callLogId) {
          bufferTranscriptEntry(legacySession.metadata.callLogId, { role: 'caller', content: data.text, timestamp: new Date().toISOString() });
        }
        const io = legacySession?.ws?.app?.get('io');
        if (io) {
          io.to(`user:${legacySession?.metadata?.userId}`).emit('transcript.final', {
            callSid, role: 'caller', text: data.text, timestamp: new Date().toISOString(),
          });
        }
        const transcript = legacySession?.transcript || [];
        if (!transcript.some(t => t.role === 'caller' && t.content === data.text)) {
          transcript.push({ role: 'caller', content: data.text, timestamp: new Date().toISOString() });
        }
        if (legacySession) legacySession.transcript = transcript.slice(-500);
      });

      provider.on('assistantTranscript', (data) => {
        if (data.partial) return;
        addTranscriptEntry(callSid, { role: 'assistant', content: data.text });
        if (legacySession?.metadata?.callLogId) {
          bufferTranscriptEntry(legacySession.metadata.callLogId, { role: 'assistant', content: data.text, timestamp: new Date().toISOString() });
        }
        const io = legacySession?.ws?.app?.get('io');
        if (io) {
          io.to(`user:${legacySession?.metadata?.userId}`).emit('transcript.final', {
            callSid, role: 'assistant', text: data.text, timestamp: new Date().toISOString(),
          });
        }
        const transcript = legacySession?.transcript || [];
        if (!transcript.some(t => t.role === 'assistant' && t.content === data.text)) {
          transcript.push({ role: 'assistant', content: data.text, timestamp: new Date().toISOString() });
        }
        if (legacySession) legacySession.transcript = transcript.slice(-500);
      });

      provider.on('speechStarted', () => {
        pipelineCounters.speechEvents++;
        if (rtmSession) rtmSession.updateActivity();
        if (provider) provider.cancelResponse();
        if (currentToolCallId) {
          toolCallInterrupted = true;
          logger.info('TOOL_CALL_INTERRUPTED', { callSid, toolCallId: currentToolCallId });
        }
        if (rtmSession && rtmSession.state !== RealtimeSessionManager.STATES.LISTENING) {
          rtmSession.setState(RealtimeSessionManager.STATES.LISTENING);
        }
        const io = legacySession?.ws?.app?.get('io');
        if (io) {
          io.to(`user:${legacySession?.metadata?.userId}`).emit('transcript.partial', {
            callSid, text: '...', isSpeaking: true,
          });
        }
      });

      provider.on('responseStarted', () => {
        logger.info('AI_RESPONSE_STARTED', { callSid });
        responseCreatedSeen = true;
      });

      provider.on('responseCompleted', () => {
        if (rtmSession) {
          if (rtmSession.state === RealtimeSessionManager.STATES.RESPONDING ||
              rtmSession.state === RealtimeSessionManager.STATES.GREETING) {
            rtmSession.greetingSent = true;
            rtmSession.setState(RealtimeSessionManager.STATES.LISTENING);
          }
        }
      });

      provider.on('toolCall', async (data) => {
        currentToolCallId = data.callId;
        currentToolCallKey = `${data.name}_${data.callId}`;
        toolCallInterrupted = false;
        const result = await handleToolCall(data.name, data.arguments || {}, data.callId);
        if (toolCallInterrupted) {
          logger.info('TOOL_RESULT_DISCARDED_INTERRUPTED', { callSid, tool: data.name, callId: data.callId });
          currentToolCallId = null;
          currentToolCallKey = null;
          return;
        }
        currentToolCallId = null;
        currentToolCallKey = null;
        if (provider) provider.sendToolResult(data.callId, result);
      });

      provider.on('error', (err) => {
        logger.error('PROVIDER_ERROR', {
          callSid,
          provider: err.provider,
          code: err.code,
          message: err.message?.substring(0, 200),
        });
        const fakeErr = { code: err.code, message: err.message };
        if (err.fatal) {
          providerHealth.handleFatalError(fakeErr, callSid);
          metrics.recordProviderEvent({ type: 'fatal', code: err.code });
          if (legacySession) legacySession.stopReconnect = true;
          if (rtmSession) rtmSession.stopReconnect = true;
          gracefulClose();
        } else {
          providerHealth.handleTransientError(fakeErr, callSid);
          metrics.recordProviderEvent({ type: 'transient', code: err.code });
          if (rtmSession) {
            rtmSession.lastError = { message: err.message, code: err.code, time: Date.now() };
          }
        }
      });

      provider.on('closed', () => {
        if (legacySession) setOpenaiWs(callSid, null);
        if (rtmSession) rtmSession.openAiSocket = null;

        if (isClosing) return;
        if (!providerHealth.getInternalState().available || legacySession?.stopReconnect || rtmSession?.stopReconnect) {
          gracefulClose();
          return;
        }
        const totalProviders = 2;
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts++;
          if (rtmSession) rtmSession.reconnectCount = reconnectAttempts;
          logger.info('PROVIDER_RECONNECT_ATTEMPT', {
            callSid, attempt: reconnectAttempts, maxRetries: MAX_RECONNECT_ATTEMPTS, provider: providerName, providerIndex,
          });
          scheduleTimer(connectProvider, 2000 * reconnectAttempts);
        } else if (providerIndex < totalProviders - 1) {
          providerIndex++;
          reconnectAttempts = 0;
          providerHealth.markVerified();
          logger.info('PROVIDER_FAILOVER', {
            callSid, fromProvider: providerName, toProvider: getProviderNameForIndex(providerIndex),
          });
          scheduleTimer(connectProvider, 1000);
        } else {
          logger.info('PIPELINE_FAILURE', {
            callSid,
            stage: 'provider_connection',
            reason: 'all_providers_exhausted',
            reconnectAttempt: reconnectAttempts,
            maxRetries: MAX_RECONNECT_ATTEMPTS,
            providerError: providerHealth.getInternalState().lastErrorCode,
          });
          gracefulClose();
        }
      });

      provider.connect({
        callSid,
        rtmSession,
        memoryContext,
        businessToolsEnabled,
        providerName,
      }).catch(err => {
        logger.error('REALTIME_CALL_FAILED', { callSid, reason: 'provider_connect_error', error: err.message });
        logger.error('PIPELINE_FAILURE', {
          callSid, stage: 'provider_connect', reason: 'construct_failed',
          providerError: err.message, reconnectAttempt: reconnectAttempts + 1,
        });
        gracefulClose();
      });
    } catch (err) {
      logger.error('REALTIME_CALL_FAILED', { callSid, reason: 'provider_connect_error', error: err.message });
      logger.error('PIPELINE_FAILURE', {
        callSid, stage: 'provider_connect', reason: 'construct_failed',
        providerError: err.message, reconnectAttempt: reconnectAttempts + 1,
      });
      gracefulClose();
    }
  }

  async function gracefulClose() {
    if (isClosing) return;
    isClosing = true;
    if (rtmSession) rtmSession.setState(RealtimeSessionManager.STATES.CLOSING);
    clearTimers();
    if (greetingTimeoutTimer) {
      clearTimeout(greetingTimeoutTimer);
      greetingTimeoutTimer = null;
    }

    // Discard any buffered early audio
    if (earlyAudioQueue.length > 0) {
      logger.info('EARLY_AUDIO_DISCARDED', { callSid, frames: earlyAudioQueue.length, bytes: earlyAudioBytes });
      earlyAudioQueue.length = 0;
      earlyAudioBytes = 0;
    }

    const greetingNotDelivered = !greetingSent || (rtmSession && !rtmSession.greetingAudioReceived && greetingSent);
    const providerFailed = responseCreatedSeen && !responseAudioSeen;

    if (callSid && (greetingNotDelivered || providerFailed)) {
      logger.info('FALLBACK_REDIRECT_TO_UNAVAILABLE', {
        callSid,
        greetingSent,
        greetingAudioReceived: rtmSession?.greetingAudioReceived,
        providerFailed,
      });
      try {
        await redirectToUnavailable(callSid);
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
      if (provider) await provider.close('call_ended');
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

      // Phase 5 — report zero audio if response.created had no audio delta
      if (responseCreatedSeen && !responseAudioSeen) {
        logger.warn('ZERO_AUDIO_DETECTED', {
          callSid,
          stage: 'response.audio.delta',
          reason: 'session.update rejected or unsupported model or quota exceeded',
          providerError: providerHealth.getInternalState().lastErrorCode,
          model: config.realtime.model,
          voice: config.realtime.voice,
        });
      }

      const providerErrorCode = providerHealth.getInternalState().lastErrorCode;
      metrics.recordCallEvent({
        status: providerErrorCode ? 'failed' : 'completed',
        error: !!providerErrorCode,
        errorCode: providerErrorCode,
      });

      logger.info('CALL_ENDED', {
        callSid,
        greetingSent,
        greetingAudioReceived: rtmSession?.greetingAudioReceived,
        totalDroppedAudioFrames: droppedFrameCount,
        providerError: providerErrorCode,
        // Phase 4 — pipeline counters
        incomingFrames: pipelineCounters.incomingFrames,
        outgoingFrames: pipelineCounters.outgoingFrames,
        audioBytes: pipelineCounters.audioBytes,
        speechEvents: pipelineCounters.speechEvents,
        transcriptionEvents: pipelineCounters.transcriptionEvents,
      });
    }
    providerHealth.enableAudioForwarding();
  }

  let endCallInitiated = false;

  function endCallGracefully(message) {
    if (isClosing || endCallInitiated) return;
    endCallInitiated = true;
    if (!provider || !provider.isConnected) {
      gracefulClose();
      return;
    }
    try {
      provider.sendText(message);
    } catch { }
    scheduleTimer(gracefulClose, 3000);
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

        // Resolve tenant owner for this call — trusted server-side only
        const callerPhone = params.from || start.from || null;
        const calledNumber = params.to || start.to || null;
        const twilioAccountSid = params.AccountSid || null;

        resolveTenant({ calledNumber, twilioAccountSid, callSid }).then(owner => {
          if (owner?.userId) {
            userId = owner.userId;
            companyId = owner.companyId;
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

        // Customer lookup uses trusted userId from resolver — never accept from caller input
        if (callerPhone) {
          const normalized = callerPhone.replace(/[^\d+]/g, '');
          const lookupUserId = userId || getResolvedOwner()?.userId;
          if (lookupUserId) {
            orchestrator.lookupCustomerByPhone(lookupUserId, normalized).then(memory => {
              if (memory && memory.customer) {
                customerMemory = memory;
                customerId = memory.customer?.id;
                logger.info('CUSTOMER_IDENTIFIED', { callSid, name: memory.customer?.name });
              }
            }).catch(() => {});
          }
        }

        // Upsert call record with trusted ownership — never from caller input
        const recordUserId = userId || getResolvedOwner()?.userId;
        const recordCompanyId = companyId || getResolvedOwner()?.companyId;
        if (recordUserId && recordCompanyId && isPersistenceAvailable()) {
          orchestrator.createCallRecord({
            userId: recordUserId,
            companyId: recordCompanyId,
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

        logger.info('TWILIO_START_RECEIVED', {
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

        const silenceTimeoutMs = (config.realtime?.silenceTimeoutSeconds || 60) * 1000;
        const silenceCheckMs = Math.min(silenceTimeoutMs / 2, 15000);
        let lastActivitySnapshot = Date.now();
        const silenceInterval = setInterval(() => {
          if (isClosing || !rtmSession) return;
          const now = Date.now();
          const inactiveTime = now - rtmSession.lastActivity;
          if (inactiveTime > silenceTimeoutMs) {
            const silenceAfterQuestion = currentStage !== 'greeting' && inactiveTime > 90000;
            if (silenceAfterQuestion || inactiveTime > 120000) {
              endCallGracefully('Thank you for calling FleetNimble. Please contact us again if you need further help. Goodbye.');
            }
          }
          lastActivitySnapshot = rtmSession.lastActivity;
        }, silenceCheckMs);
        timers.push(silenceInterval);

        connectProvider();
        break;
      }

      case 'media': {
        const payload = msg?.media?.payload;
        if (typeof payload !== 'string') {
          logger.warn('TWILIO_MEDIA_MESSAGE_ERROR', { callSid, error: 'missing_audio_payload' });
          if (rtmSession) rtmSession.droppedPackets++;
          break;
        }

        if (rtmSession) {
          rtmSession.updateActivity();
          rtmSession.audioBytesReceived += (payload?.length || 0);
          rtmSession.packetsReceived++;
        }

        const validation = validateTwilioPayload(payload);
        if (!validation.valid) {
          logger.warn('TWILIO_AUDIO_VALIDATION_FAILED', { callSid, reason: validation.reason });
          if (rtmSession) rtmSession.droppedPackets++;
          break;
        }

        if (!audioBridgeActive) {
          audioBridgeActive = true;
          logger.info('CALLER_AUDIO_RECEIVED', { callSid, streamSid: msg.streamSid });
        }

        pipelineCounters.incomingFrames++;

        if (rtmSession) {
          rtmSession.audioBytesReceived += validation.byteLength;
          rtmSession.packetsReceived++;
        }

        const providerReady = provider && provider.isConnected && !providerHealth.isAudioForwardingDisabled();

        if (providerReady) {
          // If we have buffered early audio, flush it first
          if (earlyAudioQueue.length > 0) {
            for (const frame of earlyAudioQueue) {
              provider.sendAudio(frame);
            }
            logger.info('EARLY_AUDIO_FLUSHED', { callSid, frames: earlyAudioQueue.length, bytes: earlyAudioBytes });
            earlyAudioQueue.length = 0;
            earlyAudioBytes = 0;
          }
          provider.sendAudio(payload);
          if (logger.isLevelEnabled('debug')) {
            logger.info('CALLER_AUDIO_FORWARDED', { callSid, byteLength: validation.byteLength });
          }
          if (!fullDuplexEstablished) {
            fullDuplexEstablished = true;
            logger.info('FULL_DUPLEX_ESTABLISHED', { callSid });
          }
        } else if (provider && !provider.isConnected && !providerHealth.isAudioForwardingDisabled()) {
          // Buffer early audio while provider is connecting
          if (earlyAudioQueue.length < MAX_EARLY_AUDIO_FRAMES && earlyAudioBytes < MAX_EARLY_AUDIO_BYTES) {
            earlyAudioQueue.push(payload);
            earlyAudioBytes += validation.byteLength;
            if (earlyAudioQueue.length === 1) {
              logger.info('EARLY_AUDIO_BUFFERING_STARTED', { callSid });
            }
          } else {
            if (earlyAudioQueue.length === MAX_EARLY_AUDIO_FRAMES || earlyAudioBytes >= MAX_EARLY_AUDIO_BYTES) {
              logger.info('EARLY_AUDIO_BUFFER_FULL', { callSid, frames: earlyAudioQueue.length, bytes: earlyAudioBytes });
            }
            droppedFrameCount++;
            if (rtmSession) rtmSession.droppedPackets++;
          }
        } else {
          // Provider is unavailable — throttle drop logging
          const now = Date.now();
          droppedFrameCount++;
          if (!firstDropLogged) {
            firstDropLogged = true;
            const dropReason = providerHealth.isAudioForwardingDisabled() ? 'provider_unavailable' : 'provider_not_ready';
            logger.info('CALLER_AUDIO_DROPPED', {
              callSid,
              reason: dropReason,
            });
          } else if (now - lastDropLogTime > 5000) {
            lastDropLogTime = now;
            const dropReason = providerHealth.isAudioForwardingDisabled() ? 'provider_unavailable' : 'provider_not_ready';
            logger.info('CALLER_AUDIO_DROPPED_SUMMARY', {
              callSid,
              reason: dropReason,
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
