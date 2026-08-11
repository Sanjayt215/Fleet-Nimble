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
  setProviderWs,
  addTranscriptEntry,
} from './receptionistRealtime.service.js';
import {
  bufferTranscriptEntry,
  flushPendingTranscripts,
} from './receptionistTranscript.service.js';
import { buildSystemPrompt, buildToolDefinitions, buildGreetingMessage, isBookingConfirmationRequest, buildBusinessContext } from './receptionistVoice.service.js';
import * as orchestrator from './receptionistOrchestrator.service.js';
import * as liveTools from './receptionistLiveTools.service.js';
import * as transcriptService from './receptionistTranscript.service.js';
import * as callService from './receptionistCall.service.js';
import { redirectToGreeting, redirectToUnavailable } from './twilioWebhook.service.js';
import * as providerHealth from './receptionistProviderHealth.service.js';
import * as metrics from './receptionistMetrics.service.js';
import { resolveTenant, isPersistenceAvailable } from './receptionistTenantResolver.service.js';
import { getAgentConfig } from './agentConfig.service.js';
import { getBusinessProfile } from './businessProfile.service.js';
import { answerFromTenantKnowledge } from './businessKnowledge.service.js';
import { executeNewTool, getNewToolNames } from './toolRegistry.service.js';
import { logAiInteraction } from './receptionistQA.service.js';
import { createRealtimeVoiceProvider, isRealtimeProviderEnabled } from '../providers/realtime/realtimeVoiceProviderFactory.js';
import { validateTwilioPayload } from './audio/twilioAudioCodec.js';
import { shouldUseMultiAgent } from '../multiagent/index.js';
import { orchestrateConversationTurn } from '../multiagent/integrations/conversationBridge.js';
import {
  recordTimelineEvent,
  TIMELINE_EVENT_TYPES,
} from './conversationTimeline.service.js';
import { logCallStarted, logIntentDetected, logToolStarted, logToolCompleted, logCrmUpdated, logCallCompleted } from '../utils/callAudit.js';
import { qualifyLeadFromText, persistLeadProfile } from './leadQualification.service.js';
import { generateConversationSummaries } from './conversationSummary.service.js';
import { computeConversationAnalytics } from './conversationAnalytics.service.js';
import { supervise } from './callSupervisor.service.js';
import { getFleetBrain } from '../fleetBrain/fleetBrain.service.js';
import { normalizeSchedulingArgs, missingBookingFields, toSafeBookingLog } from '../utils/scheduling.js';

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
  ...getNewToolNames(),
]);

const COMPLETED_TOOL_CALLS = new Set();
const MAX_TOOL_RETRIES = 2;
const TOOL_TIMEOUT_MS = 15000;
const ROLLBACK_ACTIONS = [];

function handleMediaStream(ws, req) {
  const urlParams = new URL(req.url, config.publicUrl).searchParams;
  const urlCallSid = urlParams.get('callSid') || null;

  logger.info('TWILIO_WS_CONNECTION_OPEN', { pathname: req.url, urlCallSid });

  const ioInstance = req.app?.get('io');

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
  let callerPhone = null;
  let collectedData = {};
  let currentIntent = null;
  let currentStage = 'greeting';
  let pendingAction = null;
  let currentToolCallId = null;
  let currentToolCallKey = null;
  let toolCallInterrupted = false;
  let callTranscriptBuffer = [];
  let bookingConfirmationLogged = false;
  // Business knowledge intelligence (tenant-scoped, loaded after resolution)
  let agentGreeting = null;
  let businessContext = null;
  let businessContextLoaded = false;

  // Phase 4 — audio pipeline counters
  let pipelineCounters = {
    incomingFrames: 0,
    outgoingFrames: 0,
    audioBytes: 0,
    speechEvents: 0,
    transcriptionEvents: 0,
  };
  let callStartTs = null;
  // Phase 5 — zero-audio detection
  let responseCreatedSeen = false;
  let responseAudioSeen = false;
  let pipelineFailStage = null;
  let pipelineFailReason = null;
  // Multi-agent runtime — only engaged when AI_RECEPTIONIST_MULTIAGENT_ENABLED=true
  let multiAgentResponding = false;
  // Conversation intelligence — live stages, interruptions and call-end artifacts
  let interruptionCount = 0;
  let silenceMs = 0;
  let lastActivityAt = Date.now();

  function emitCallStage(stage, label, data = {}) {
    emitSocketEvent('call.stage', {
      callSid,
      callId: callRecordId,
      stage,
      label,
      timestamp: new Date().toISOString(),
      ...data,
    });
  }

  async function recordTimeline(eventType, label, data = {}) {
    if (!callRecordId && !callSid) return null;
    try {
      return await recordTimelineEvent({
        userId,
        callId: callRecordId,
        callSid,
        eventType,
        label,
        data,
      });
    } catch (err) {
      logger.warn('TIMELINE_RECORD_FAILED', { callSid, eventType, error: err.message });
      return null;
    }
  }

  function emitSocketEvent(event, data) {
    if (ioInstance && userId) {
      ioInstance.to(`user:${userId}`).emit(event, data);
      logger.debug('SOCKET_EVENT_SENT', { event, userId, callSid });
    }
  }

  async function runMultiAgentTurn(text) {
    if (!provider || !provider.isReady || multiAgentResponding) return;
    emitCallStage('thinking', 'Thinking');
    await recordTimeline(TIMELINE_EVENT_TYPES.AGENT_RUN_STARTED, 'Agent run started', { message: text.substring(0, 120) });
    const result = await orchestrateConversationTurn({
      userId,
      callId: callRecordId,
      callSid,
      message: text,
      context: {
        callerPhone,
        callerName: collectedData.callerName || null,
        callerEmail: collectedData.callerEmail || null,
        companyId,
        callId: callRecordId,
        companyName: collectedData.company || null,
        fleetSize: collectedData.fleetSize ?? null,
      },
    });
    if (result?.intent && result.intent !== currentIntent) {
      currentIntent = result.intent;
      logIntentDetected({ userId, callId: callRecordId, callSid, intent: result.intent, confidence: result.confidence });
      emitSocketEvent('intent.changed', {
        callSid, intent: result.intent, confidence: result.confidence, timestamp: new Date().toISOString(),
      });
    }
    await recordTimeline(TIMELINE_EVENT_TYPES.AGENT_RUN_COMPLETED, 'Agent run completed', {
      runId: result?.runId,
      intent: result?.intent,
      status: result?.status,
      agents: Object.keys(result?.agents || {}),
    });
    if (result?.reply) {
      multiAgentResponding = true;
      try {
        if (provider.cancelResponse) await provider.cancelResponse();
        const ok = await provider.sendText(result.reply);
        if (ok) {
          emitCallStage('ai-speaking', 'AI Speaking', { runId: result.runId, intent: result.intent });
          logger.info('MULTI_AGENT_REPLY_SENT', {
            callSid, runId: result.runId, intent: result.intent, status: result.status,
            reply: result.reply.substring(0, 80),
          });
        } else {
          multiAgentResponding = false;
          logger.warn('MULTI_AGENT_REPLY_SEND_FAILED', { callSid, runId: result.runId });
        }
      } catch (err) {
        multiAgentResponding = false;
        logger.warn('MULTI_AGENT_REPLY_ERROR', { callSid, error: err.message });
      }
    }
  }

  async function runFleetBrainTurn(text) {
    const brain = getFleetBrain();
    if (!brain.isEnabled() || !userId || !text) return;
    const context = await brain.getContext(userId, {
      force: false,
      session: {
        callId: callRecordId,
        intent: currentIntent,
        customer: customerMemory?.customer || null,
        transcriptEntries: callTranscriptBuffer.slice(-6),
      },
    });
    const plan = await brain.buildPlan({
      userId,
      message: text,
      context,
      customer: customerMemory?.customer || null,
    });
    if (!plan) return;
    if (plan.intent && plan.intent !== currentIntent) {
      currentIntent = plan.intent;
      logIntentDetected({ userId, callId: callRecordId, callSid, intent: plan.intent, confidence: null });
      emitSocketEvent('intent.changed', {
        callSid, intent: plan.intent, confidence: null, timestamp: new Date().toISOString(),
      });
    }
    await recordTimeline(TIMELINE_EVENT_TYPES.FLEET_BRAIN_PLAN, 'Fleet Brain plan', {
      intent: plan.intent,
      skill: plan.skill,
      requiredTools: plan.requiredTools,
      missingInformation: plan.missingInformation,
      nextAction: plan.nextAction,
    });
    if (plan.requiredTools?.length > 0) {
      const record = await brain.runWorkflow({
        userId,
        companyId,
        callId: callRecordId,
        trigger: 'turn',
        message: text,
        context,
        skillName: plan.skill || null,
      });
      await recordTimeline(TIMELINE_EVENT_TYPES.FLEET_BRAIN_WORKFLOW, 'Fleet Brain workflow', {
        runId: record?.id,
        status: record?.status,
        workflowType: record?.workflowType,
      });
    }
  }

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
      } catch (err) { logger.warn('TIMER_CLEAR_FAILED', { error: err.message }); }
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
      rtmSession.setGreetingState(RealtimeSessionManager.GREETING_STATES.PLAYING);
      rtmSession.setState(RealtimeSessionManager.STATES.GREETING);
    }
    recordTimeline(TIMELINE_EVENT_TYPES.GREETING_SENT, 'Greeting sent', { personalized: !!customerMemory, custom: !!agentGreeting });
    emitCallStage('ai-speaking', 'AI Speaking', { phase: 'greeting' });
    if (provider && provider.isConnected) {
      // Business knowledge intelligence — admin-configured greeting override
      // (explicitly set via AgentConfig) when available, otherwise the
      // standard professional FleetNimble greeting.
      const greetingText = agentGreeting || buildGreetingMessage(customerMemory);
      provider.sendText(greetingText);
      logger.info('RECEPTIONIST_GREETING_STARTED', { callSid, personalized: !!customerMemory, custom: !!agentGreeting });

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

  /**
   * Business knowledge intelligence — loads the tenant's business profile and
   * agent configuration right after tenant resolution. Non-blocking: the call
   * proceeds with the standard FleetNimble greeting/prompt if this hasn't
   * finished before the provider session is ready.
   */
  async function loadBusinessIntelligence(ownerUserId, ownerCompanyId, calledPhone) {
    if (!ownerUserId || businessContextLoaded) return;
    try {
      const [agentConfig, profile] = await Promise.all([
        getAgentConfig({ userId: ownerUserId, companyId: ownerCompanyId, phoneNumber: calledPhone }),
        getBusinessProfile({ userId: ownerUserId, companyId: ownerCompanyId }),
      ]);

      // Explicitly configured agent config → use its greeting (still a
      // professional FleetNimble greeting by default; greeting_protected
      // prevents empty removal). Default configs keep the standard greeting.
      if (agentConfig?.greetingMessage && !agentConfig.isDefault && !greetingSent) {
        agentGreeting = agentConfig.greetingMessage;
      }

      const contextText = buildBusinessContext(profile, agentConfig);
      if (contextText) businessContext = contextText;
      businessContextLoaded = true;
      logger.info('BUSINESS_INTELLIGENCE_LOADED', { callSid, userId: ownerUserId, hasProfile: !!profile, hasCustomGreeting: !!agentGreeting });
    } catch (err) {
      logger.warn('BUSINESS_INTELLIGENCE_LOAD_FAILED', { callSid, error: err.message });
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
          logger.warn('BOOKING_TOOL_CALLED', { tool: 'create_appointment', callSid, status: 'feature_disabled' });
          return { error: 'feature_disabled', message: 'Business tools are currently disabled' };
        }

        logger.info('BOOKING_TOOL_CALLED', {
          callSid, callId: callRecordId, args: toSafeBookingLog(args),
        });
        logger.info('RECEPTIONIST_INTENT_DETECTED', { callSid, intent: 'demo_booking' });

        const normalized = normalizeSchedulingArgs(args || {});
        collectedData.callerName = collectedData.callerName || normalized.callerName;
        collectedData.company = collectedData.company || normalized.company;
        collectedData.fleetSize = collectedData.fleetSize ?? normalized.fleetSize;
        collectedData.email = collectedData.email || normalized.email;
        collectedData.phone = collectedData.phone || normalized.phone;
        collectedData.industry = collectedData.industry || normalized.industry;
        collectedData.meetingPurpose = collectedData.meetingPurpose || normalized.meetingPurpose;
        collectedData.timezone = collectedData.timezone || normalized.timezone;
        collectedData.durationMinutes = collectedData.durationMinutes || normalized.durationMinutes;
        if (normalized.scheduledDateTime) collectedData.scheduledDateTime = normalized.scheduledDateTime;
        if (normalized.preferredDate) collectedData.preferredDate = normalized.preferredDate;
        if (normalized.preferredTime) collectedData.preferredTime = normalized.preferredTime;
        logger.info('RECEPTIONIST_DETAILS_UPDATED', {
          callSid, callId: callRecordId, details: toSafeBookingLog(collectedData),
        });

        const missing = missingBookingFields(collectedData);
        logger.info('BOOKING_ARGUMENTS_VALIDATED', {
          callSid, callId: callRecordId, missing, collectedData: toSafeBookingLog(collectedData),
        });

        if (missing.length > 0) {
          logger.warn('BOOKING_VALIDATION_INCOMPLETE', {
            callSid, callId: callRecordId, missing,
          });
          logger.info('RECEPTIONIST_DETAILS_COLLECTION_STARTED', { callSid, missing });
          result = {
            success: false,
            retryable: false,
            missing_fields: missing,
            message: `The booking is missing required details: ${missing.join(', ')}. Ask the caller for the missing information before booking.`,
            error: 'missing_required_fields',
          };
          break;
        }

        const session = {
          userId, companyId, callId: callRecordId, customerId, collectedData,
          currentStage, pendingAction, callerPhone,
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
          logger.info('RECEPTIONIST_BOOKING_CREATED', {
            callSid, callId: callRecordId, appointmentId: orchestratorResult.actionResult.id,
            customerId: orchestratorResult.customerId || customerId || null,
          });
          if (orchestratorResult.customerId || customerId) {
            logger.info('RECEPTIONIST_CUSTOMER_PERSISTED', {
              callSid, customerId: orchestratorResult.customerId || customerId,
            });
          }
          result = { success: true, appointmentId: orchestratorResult.actionResult.id, customerId: orchestratorResult.customerId, message: orchestratorResult.reply };
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
          result = {
            success: false,
            retryable: orchestratorResult.retryable === false ? false : undefined,
            message: orchestratorResult.reply || 'Unable to create the appointment.',
            error: orchestratorResult.error || 'creation_failed',
          };
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
          currentStage, pendingAction, callerPhone,
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
        // Business knowledge intelligence — tenant-scoped retrieval first
        // (business profile + approved documents), global KB fallback.
        const query = args?.query || '';
        let answer = null;
        let sources = [];

        if (userId) {
          try {
            const tenantResult = await answerFromTenantKnowledge({
              userId,
              companyId: companyId || null,
              query,
              category: null,
              useProfile: true,
            });
            if (tenantResult?.answer) {
              answer = tenantResult.answer;
              sources = tenantResult.sources || [];
            }
          } catch (err) {
            logger.warn('TENANT_RETRIEVAL_FAILED', { callSid, error: err.message });
          }
        }

        if (!answer) {
          const { queryKnowledgeBase } = await import('./receptionistKnowledgeBase.service.js');
          answer = await queryKnowledgeBase(query, userId);
        }

        result = { found: !!answer, answer: answer || null, query, sources };
        if (answer) {
          collectedData.lastKnowledgeQuery = query;
          if (sources.length > 0) {
            collectedData.knowledgeSourcesUsed = sources;
          }
        }
        break;
      }

      case 'search_knowledge':
      case 'create_lead':
      case 'transfer_call':
      case 'create_follow_up': {
        const toolResult = await executeNewTool(functionName, args, {
          userId,
          companyId: companyId || null,
          callSid,
          callId: callRecordId,
          customerId,
        });
        result = toolResult;
        if (toolResult.success) {
          if (functionName === 'search_knowledge') collectedData.lastKnowledgeQuery = args?.query;
          if (functionName === 'create_lead') {
            collectedData.leadCreated = true;
            logAiInteraction({
              callSid,
              callId: callRecordId,
              userId,
              companyId: companyId || null,
              intent: 'lead_creation',
              question: 'create_lead',
              answer: `Lead created: ${args?.name}`,
              toolCalls: [{ name: 'create_lead' }],
              toolResults: [toolResult],
              channel: 'voice',
              success: true,
              leadCreation: true,
            }).catch(() => {});
          }
          if (functionName === 'transfer_call') {
            logAiInteraction({
              callSid,
              callId: callRecordId,
              userId,
              companyId: companyId || null,
              intent: 'human_handoff',
              question: 'transfer_call',
              answer: `Handoff to ${args?.department}`,
              toolCalls: [{ name: 'transfer_call' }],
              toolResults: [toolResult],
              channel: 'voice',
              success: true,
              handoff: true,
            }).catch(() => {});
          }
        }
        break;
      }

      case 'update_conversation_memory': {
        if (args?.key && args?.value && userId) {
          const { default: prisma } = await import('../utils/prisma.js');
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
        logger.info('RECEPTIONIST_GOODBYE_STARTED', { callSid, reason: args?.reason || 'caller_requested' });
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
    logToolStarted({ userId, callId: callRecordId, callSid, tool: functionName, args });

    const stageForTool = (name) => {
      if (name === 'retrieve_knowledge' || name === 'search_knowledge') return { stage: 'searching', label: 'Searching Knowledge' };
      if (name === 'create_appointment') return { stage: 'booking-demo', label: 'Booking Demo' };
      if (name === 'lookup_customer' || name === 'save_customer_note' || name === 'update_conversation_memory' || name === 'create_lead' || name === 'create_follow_up') return { stage: 'saving-crm', label: 'Saving to CRM' };
      if (name === 'transfer_call' || name === 'request_human_handoff') return { stage: 'handoff', label: 'Transferring to Team' };
      return { stage: 'executing-tool', label: 'Executing Tool' };
    };
    const stageInfo = stageForTool(functionName);
    emitCallStage(stageInfo.stage, stageInfo.label, { tool: functionName });
    if (functionName === 'retrieve_knowledge' || functionName === 'search_knowledge') {
      await recordTimeline(TIMELINE_EVENT_TYPES.KNOWLEDGE_SEARCHED, 'Knowledge search', { query: args?.query });
    }

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

        if (result && result.success === false && result.retryable !== false && attempt < maxRetries) {
          lastError = result.error || 'transient_failure';
          logger.warn('TOOL_RETRY', { callSid, functionName, attempt, error: lastError });
          await recordTimeline(TIMELINE_EVENT_TYPES.SUPERVISOR_RETRY, 'Retrying failed operation', { tool: functionName, attempt: attempt + 1 });
          if (attempt < maxRetries - 1) {
            await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 500));
          }
          continue;
        }

        COMPLETED_TOOL_CALLS.add(toolCallKey);

        if (result && functionName === 'create_appointment' && result.success) {
          emitSocketEvent('appointment.created', {
            appointmentId: result.appointmentId,
            callerName: collectedData.callerName,
            company: collectedData.company,
            preferredDate: collectedData.preferredDate,
            preferredTime: collectedData.preferredTime,
            timestamp: new Date().toISOString(),
          });
          emitSocketEvent('crm.updated', {
            customerId: result.customerId,
            appointmentId: result.appointmentId,
            timestamp: new Date().toISOString(),
          });
          emitSocketEvent('dashboard.refresh', {
            type: 'appointment_created',
            timestamp: new Date().toISOString(),
          });
          emitSocketEvent('analytics.refresh', {
            type: 'appointment_created',
            timestamp: new Date().toISOString(),
          });
          logCrmUpdated({ userId, callId: callRecordId, callSid, customerId: result.customerId, operation: 'appointment_created' });
          logger.info('SOCKET_EVENT_SENT', { events: ['appointment.created', 'crm.updated', 'dashboard.refresh', 'analytics.refresh'], callSid });
        }

        logToolCompleted({
          userId, callId: callRecordId, callSid, tool: functionName,
          success: !result?.error, data: { appointmentId: result?.appointmentId, ticketId: result?.ticketId },
        });

        return result;
      } catch (err) {
        lastError = err.message;
        logger.warn('TOOL_RETRY', { callSid, functionName, attempt, error: err.message });
        await recordTimeline(TIMELINE_EVENT_TYPES.SUPERVISOR_RETRY, 'Retrying failed operation', { tool: functionName, attempt: attempt + 1, error: err.message });

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
        logToolCompleted({ userId, callId: callRecordId, callSid, tool: functionName, success: false, error: err.message });
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
    const primary = config.realtimeProvider?.provider || 'gemini';
    const failoverEnabled = config.realtimeProvider?.failoverEnabled === true && config.realtimeProvider?.fallbackProvider;
    if (index === 0) return primary;
    if (failoverEnabled) {
      return config.realtimeProvider.fallbackProvider;
    }
    return primary;
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
      logger.info('GEMINI_PROVIDER_CREATED', { callSid, providerType: provider.constructor?.name });

      const memoryContext = customerMemory ? buildMemoryContext(customerMemory) : '';
      const businessToolsEnabled = config.realtime?.businessToolsEnabled ?? true;
      if (!businessToolsEnabled) {
        logger.warn('BUSINESS_TOOLS_DISABLED', { callSid, reason: 'config_flag_false', envKey: 'AI_RECEPTIONIST_BUSINESS_TOOLS_ENABLED' });
      }

      if (rtmSession) rtmSession.providerSocket = provider;
      if (legacySession) setProviderWs(callSid, provider);

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
          rtmSession.setGreetingState(RealtimeSessionManager.GREETING_STATES.PLAYING);
          const latencyMs = rtmSession.diagGreetingRequestTime ? Date.now() - rtmSession.diagGreetingRequestTime : null;
          logger.info('RECEPTIONIST_GREETING_AUDIO', { callSid, latencyMs });
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
        callTranscriptBuffer.push({ role: 'caller', content: data.text, timestamp: new Date().toISOString() });
        addTranscriptEntry(callSid, { role: 'caller', content: data.text });
        emitCallStage('customer-speaking', 'Customer Speaking');
        if (legacySession?.metadata?.callLogId) {
          bufferTranscriptEntry(legacySession.metadata.callLogId, { role: 'caller', content: data.text, timestamp: new Date().toISOString() });
        }
        if (ioInstance && userId) {
          ioInstance.to(`user:${userId}`).emit('transcript.final', {
            callSid, role: 'caller', text: data.text, timestamp: new Date().toISOString(),
          });
        }
        const transcript = legacySession?.transcript || [];
        if (!transcript.some(t => t.role === 'caller' && t.content === data.text)) {
          transcript.push({ role: 'caller', content: data.text, timestamp: new Date().toISOString() });
        }
        if (legacySession) legacySession.transcript = transcript.slice(-500);
        if (shouldUseMultiAgent() && !multiAgentResponding) {
          runMultiAgentTurn(data.text).catch((err) => {
            logger.warn('MULTI_AGENT_TURN_FAILED', { callSid, error: err.message });
          });
        }
        if (getFleetBrain().isEnabled() && !shouldUseMultiAgent()) {
          runFleetBrainTurn(data.text).catch((err) => {
            logger.warn('FLEET_BRAIN_TURN_FAILED', { callSid, error: err.message });
          });
        }
      });

      provider.on('assistantTranscript', (data) => {
        if (data.partial) return;
        callTranscriptBuffer.push({ role: 'assistant', content: data.text, timestamp: new Date().toISOString() });
        addTranscriptEntry(callSid, { role: 'assistant', content: data.text });
        if (!bookingConfirmationLogged && isBookingConfirmationRequest(data.text)) {
          bookingConfirmationLogged = true;
          logger.info('RECEPTIONIST_BOOKING_CONFIRMATION_REQUESTED', { callSid, text: data.text.substring(0, 120) });
        }
        if (legacySession?.metadata?.callLogId) {
          bufferTranscriptEntry(legacySession.metadata.callLogId, { role: 'assistant', content: data.text, timestamp: new Date().toISOString() });
        }
        if (ioInstance && userId) {
          ioInstance.to(`user:${userId}`).emit('transcript.final', {
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
        if (rtmSession?.state === RealtimeSessionManager.STATES.RESPONDING) {
          interruptionCount++;
          emitSocketEvent('call.interrupted', { callSid, count: interruptionCount, timestamp: new Date().toISOString() });
        }
        if (rtmSession && rtmSession.state === RealtimeSessionManager.STATES.GREETING &&
            rtmSession.greetingState !== RealtimeSessionManager.GREETING_STATES.COMPLETED) {
          rtmSession.setGreetingState(RealtimeSessionManager.GREETING_STATES.COMPLETED);
          logger.info('RECEPTIONIST_GREETING_COMPLETED', { callSid, reason: 'interrupted' });
          logger.info('RECEPTIONIST_GREETING_INTERRUPTED', { callSid });
        }
        multiAgentResponding = false;
        emitCallStage('customer-speaking', 'Customer Speaking');
        if (rtmSession) rtmSession.updateActivity();
        if (provider) provider.cancelResponse();
        if (currentToolCallId) {
          toolCallInterrupted = true;
          logger.info('TOOL_CALL_INTERRUPTED', { callSid, toolCallId: currentToolCallId });
        }
        if (rtmSession && rtmSession.state !== RealtimeSessionManager.STATES.LISTENING) {
          rtmSession.setState(RealtimeSessionManager.STATES.LISTENING);
        }
        if (ioInstance && userId) {
          ioInstance.to(`user:${userId}`).emit('transcript.partial', {
            callSid, text: '...', isSpeaking: true,
          });
        }
      });

      provider.on('responseStarted', () => {
        logger.info('AI_RESPONSE_STARTED', { callSid });
        responseCreatedSeen = true;
        multiAgentResponding = true;
        emitCallStage('ai-speaking', 'AI Speaking');
      });

      provider.on('responseCompleted', () => {
        multiAgentResponding = false;
        if (rtmSession) {
          if (rtmSession.greetingState !== RealtimeSessionManager.GREETING_STATES.COMPLETED) {
            rtmSession.setGreetingState(RealtimeSessionManager.GREETING_STATES.COMPLETED);
            logger.info('RECEPTIONIST_GREETING_COMPLETED', { callSid });
          }
          rtmSession.greetingSent = true;
          rtmSession.setState(RealtimeSessionManager.STATES.LISTENING);
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

      provider.on('goAway', (data) => {
        logger.warn('PROVIDER_GO_AWAY', {
          callSid,
          provider: providerName,
          timeLeftMs: data.timeLeftMs,
          hasResumptionHandle: !!data.resumptionHandle,
        });
        if (data.resumptionHandle) {
          resumptionHandle = data.resumptionHandle;
          logger.info('PROVIDER_GO_AWAY_HANDLE_SAVED', { callSid });
        }
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

      provider.on('closed', (data) => {
        if (legacySession) setProviderWs(callSid, null);
        if (rtmSession) rtmSession.providerSocket = null;

        if (provider && provider.getResumptionHandle) {
          const handle = provider.getResumptionHandle();
          if (handle) resumptionHandle = handle;
        }

        logger.warn('PROVIDER_CLOSED', {
          callSid,
          provider: providerName,
          code: data?.code,
          reason: data?.reason,
          reconnectAttempts,
          hasResumptionHandle: !!resumptionHandle,
        });

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
        resumptionHandle,
        businessContext,
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
    if (callStartTs) {
      pipelineCounters.duration = Date.now() - callStartTs;
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

        const transcriptJson = JSON.stringify(callTranscriptBuffer.slice(-500));

        let summaryText = null;
        try {
          summaryText = await orchestrator.generateAISummary(callTranscriptBuffer, collectedData);
        } catch (e) {
          logger.warn('AI_SUMMARY_GENERATION_FAILED', { callSid, error: e.message });
        }
        if (!summaryText) {
          const lastMsgs = callTranscriptBuffer
            .filter(t => t.role === 'assistant')
            .slice(-3)
            .map(t => t.content?.substring(0, 100))
            .join(' | ');
          summaryText = lastMsgs || 'Call completed';
        }
        if (summaryText) logger.info('SUMMARY_GENERATED', { callSid, summaryLength: summaryText.length });

        const callName = collectedData.callerName || null;
        const callCompany = collectedData.company || null;
        const callEmail = collectedData.email || null;
        const callPhone = collectedData.phone || callerPhone || null;

        await supervise({
          userId,
          callId: callRecordId,
          callSid,
          operationKey: `${callSid || callRecordId}:end:callRecord`,
          operation: 'updateCallRecordAtEnd',
          fn: () => orchestrator.updateCallRecordAtEnd({
            callId: callRecordId,
            callSid,
            userId,
            intent: currentIntent,
            summary: summaryText,
            transcript: transcriptJson,
            sentiment: collectedData.sentiment || 'neutral',
            customerId,
          }),
          maxRetries: 1,
        }).catch(e => logger.warn('CALL_END_UPDATE_FAILED', { error: e.message }));

        if (customerId) {
          await supervise({
            userId,
            callId: callRecordId,
            callSid,
            operationKey: `${callSid || callRecordId}:end:crm`,
            operation: 'updateCRMAfterCall',
            fn: () => orchestrator.updateCRMAfterCall({
              userId,
              customerId,
              collectedData,
              intent: currentIntent,
              summary: summaryText,
              sentiment: collectedData.sentiment || 'neutral',
            }),
            maxRetries: 1,
          }).catch(e => logger.warn('CRM_END_UPDATE_FAILED', { error: e.message }));
        }

        // ── Conversation Intelligence: lead qualification, summaries, analytics ──
        let leadProfile = null;
        try {
          leadProfile = qualifyLeadFromText({
            text: callTranscriptBuffer.map(t => t.content).join(' '),
            collectedData,
            customer: customerMemory?.customer || null,
          });
          collectedData.leadScore = leadProfile.leadScore;
          if (customerId) {
            const persisted = await persistLeadProfile({ userId, customerId, callId: callRecordId, callSid, profile: leadProfile });
            if (persisted) logCrmUpdated({ userId, callId: callRecordId, callSid, customerId, operation: 'lead_qualified' });
          }
        } catch (err) {
          logger.warn('LEAD_QUALIFICATION_FAILED', { callSid, error: err.message });
        }

        try {
          const summaries = await generateConversationSummaries({
            userId,
            callId: callRecordId,
            callSid,
            customerId,
            transcriptEntries: callTranscriptBuffer,
            collectedData: { ...collectedData, leadScore: collectedData.leadScore ?? leadProfile?.leadScore ?? null },
            callIntent: currentIntent,
            leadProfile,
          });
          collectedData.summaries = summaries;
        } catch (err) {
          logger.warn('CONVERSATION_SUMMARIES_FAILED', { callSid, error: err.message });
        }

        try {
          const { getLiveTimeline } = await import('./conversationTimeline.service.js');
          await computeConversationAnalytics({
            userId,
            callId: callRecordId,
            callSid,
            transcriptEntries: callTranscriptBuffer,
            timelineEvents: getLiveTimeline(callRecordId),
            collectedData: { ...collectedData, leadScore: collectedData.leadScore ?? leadProfile?.leadScore ?? null },
            intent: currentIntent,
            sentiment: collectedData.summaries?.sentiment || collectedData.sentiment || 'neutral',
            sessionMetrics: { interruptions: interruptionCount },
          });
        } catch (err) {
          logger.warn('CONVERSATION_ANALYTICS_FAILED', { callSid, error: err.message });
        }

        // ── Fleet Brain: post-call learning (fire-and-forget — never delays cleanup) ──
        try {
          const brain = getFleetBrain();
          if (brain.isEnabled()) {
            const { getLiveTimeline } = await import('./conversationTimeline.service.js');
            const learnCall = brain.learnFromCall({
              userId,
              companyId,
              callId: callRecordId,
              callSid,
              transcriptEntries: callTranscriptBuffer,
              collectedData: {
                ...collectedData,
                intent: currentIntent,
                appointmentCreated: !!collectedData.appointmentCreated,
                supportTicketCreated: !!collectedData.supportTicketCreated,
                answered: collectedData.lastKnowledgeQuery ? true : null,
              },
              timelineEvents: callRecordId ? getLiveTimeline(callRecordId) : [],
              analytics: collectedData.summaries?.analytics || null,
            });
            learnCall.then((learned) => {
              if (learned) {
                recordTimeline(TIMELINE_EVENT_TYPES.FLEET_BRAIN_LEARNED, 'Fleet Brain learned', {
                  learnings: learned?.learnings?.length || 0,
                  recommendations: learned?.recommendations?.length || 0,
                });
              }
            }).catch((err) => {
              logger.warn('FLEET_BRAIN_LEARN_FAILED', { callSid, error: err.message });
            });
          }
        } catch (err) {
          logger.warn('FLEET_BRAIN_LEARN_FAILED', { callSid, error: err.message });
        }

        await recordTimeline(TIMELINE_EVENT_TYPES.CALL_COMPLETED, 'Call completed', {
          duration: pipelineCounters.duration,
          intent: currentIntent,
          leadScore: collectedData.leadScore ?? null,
        });
        logCallCompleted({ userId, callId: callRecordId, callSid, data: { intent: currentIntent, duration: pipelineCounters.duration } });
        emitCallStage('completed', 'Completed', {});

        emitSocketEvent('summary.created', {
          callId: callRecordId,
          callSid,
          summary: collectedData.summaries,
          leadScore: collectedData.leadScore ?? null,
          timestamp: new Date().toISOString(),
        });

        emitSocketEvent('call.completed', {
          callId: callRecordId,
          callSid,
          callerName: callName,
          company: callCompany,
          email: callEmail,
          phone: callPhone,
          summary: summaryText,
          duration: pipelineCounters.duration,
          appointmentCreated: !!collectedData.appointmentCreated,
          timestamp: new Date().toISOString(),
        });
        emitSocketEvent('contact.updated', {
          customerId,
          name: callName,
          company: callCompany,
          email: callEmail,
          phone: callPhone,
          timestamp: new Date().toISOString(),
        });
        emitSocketEvent('dashboard.refresh', {
          type: 'call_completed',
          callId: callRecordId,
          timestamp: new Date().toISOString(),
        });
        emitSocketEvent('analytics.refresh', {
          type: 'call_completed',
          timestamp: new Date().toISOString(),
        });
        if (customerId) {
          emitSocketEvent('crm.updated', {
            customerId,
            callId: callRecordId,
            timestamp: new Date().toISOString(),
          });
        }
        logger.info('SOCKET_EVENT_SENT', {
          events: ['call.completed', 'contact.updated', 'dashboard.refresh', 'analytics.refresh', 'crm.updated'],
          callSid, callRecordId,
        });
      }
    } catch (err) {
      logger.warn('CALL_END_CLEANUP_ERROR', { callSid, error: err.message });
    }

    try {
      if (provider) await provider.close('call_ended');
    } catch (err) { logger.warn('PROVIDER_CLOSE_FAILED', { callSid, error: err.message }); }
    if (legacySession) setProviderWs(callSid, null);
    if (rtmSession) rtmSession.providerSocket = null;

    try {
      if (ws && ws.readyState !== WebSocket.CLOSED) ws.close();
    } catch (err) { logger.warn('WS_CLOSE_FAILED', { callSid, error: err.message }); }

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
        callRecordId,
        callerName: collectedData.callerName || null,
        companyName: collectedData.company || null,
        customerId,
        appointmentCreated: !!collectedData.appointmentCreated,
        ticketCreated: !!collectedData.supportTicketCreated,
        duration: pipelineCounters.duration,
        greetingSent,
        greetingState: rtmSession?.greetingState || null,
        greetingAudioReceived: rtmSession?.greetingAudioReceived,
        totalDroppedAudioFrames: droppedFrameCount,
        providerError: providerErrorCode,
        incomingFrames: pipelineCounters.incomingFrames,
        outgoingFrames: pipelineCounters.outgoingFrames,
        audioBytes: pipelineCounters.audioBytes,
        speechEvents: pipelineCounters.speechEvents,
        transcriptionEvents: pipelineCounters.transcriptionEvents,
      });
      logger.info('RECEPTIONIST_CALL_COMPLETED', {
        callSid,
        callRecordId,
        duration: pipelineCounters.duration,
        intent: currentIntent,
        appointmentCreated: !!collectedData.appointmentCreated,
      });
    }
    providerHealth.enableAudioForwarding();
  }

  let resumptionHandle = null;
  let endCallInitiated = false;

  function endCallGracefully(message) {
    if (isClosing || endCallInitiated) return;
    endCallInitiated = true;
    logger.info('RECEPTIONIST_GOODBYE_STARTED', { callSid, reason: 'end_call_flow' });
    if (!provider || !provider.isConnected) {
      gracefulClose();
      return;
    }
    try {
      provider.sendText(message);
    } catch (err) { logger.warn('SEND_TEXT_FAILED', { callSid, error: err.message }); }
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
          try { ws.close(4000, 'Missing callSid'); } catch (err) { logger.warn('WS_CLOSE_FAILED', { error: err.message }); }
          return;
        }

        const streamSid = start.streamSid || null;
        if (!streamSid) {
          logger.warn('TWILIO_MEDIA_STARTED', { callSid, warning: 'missing_streamSid' });
        }

        // Resolve tenant owner for this call — trusted server-side only.
        // The owner is kept in the call-local closure; never read from the
        // module-global resolved owner afterwards (concurrent calls would race).
        callerPhone = params.from || start.from || null;
        const calledNumber = params.to || start.to || null;
        const twilioAccountSid = params.AccountSid || null;
        callStartTs = Date.now();

        resolveTenant({ calledNumber, twilioAccountSid, callSid }).then(owner => {
          const ownerUserId = owner?.userId;
          const ownerCompanyId = owner?.companyId;
          if (ownerUserId) {
            userId = ownerUserId;
            companyId = ownerCompanyId;
            logger.info('TENANT_RESOLVED_FOR_CALL', { callSid, source: owner.source });
            // Business knowledge intelligence — load profile + agent config
            loadBusinessIntelligence(ownerUserId, ownerCompanyId, calledNumber).catch(err =>
              logger.warn('BUSINESS_INTELLIGENCE_LOAD_FAILED', { callSid, error: err.message })
            );
          } else {
            logger.warn('TENANT_NOT_RESOLVED', { callSid });
          }

          // Customer lookup uses trusted owner id — never accept from caller input
          if (callerPhone && ownerUserId) {
            const normalized = callerPhone.replace(/[^\d+]/g, '');
            orchestrator.lookupCustomerByPhone(ownerUserId, normalized).then(memory => {
              if (memory && memory.customer) {
                customerMemory = memory;
                customerId = memory.customer?.id;
                logger.info('CUSTOMER_IDENTIFIED', { callSid, name: memory.customer?.name });
              }
            }).catch(err => logger.warn('CUSTOMER_LOOKUP_FAILED', { callSid, error: err.message }));
          }

          // Upsert call record with trusted ownership — never from caller input
          if (ownerUserId && ownerCompanyId && isPersistenceAvailable()) {
            orchestrator.createCallRecord({
              userId: ownerUserId,
              companyId: ownerCompanyId,
              callSid,
              from: callerPhone,
              to: calledNumber,
              twilioAccountSid,
            }).then(record => {
              if (record) {
                callRecordId = record.id;
                if (legacySession) legacySession.metadata.callLogId = record.id;
                lastActivityAt = Date.now();
                logCallStarted({ userId: ownerUserId, callId: record.id, callSid, data: { from: callerPhone } });
                emitSocketEvent('call.started', {
                  callId: record.id,
                  callSid,
                  callerPhone,
                  calledNumber,
                  timestamp: new Date().toISOString(),
                });
                emitCallStage('greeting', 'Connecting', {});
              }
            }).catch(e => logger.warn('CALL_RECORD_START_FAILED', { error: e.message }));
          } else {
            logger.info('CALL_RECORD_SKIPPED_NO_OWNER', { callSid });
          }
        }).catch(err => logger.warn('TENANT_RESOLVE_FAILED', { callSid, error: err.message }));

        rtmSession = RealtimeSessionManager.create(callSid, ws, {
          from: params.from || start.from || null,
          to: params.to || start.to || null,
          caller: params.from || start.from || null,
          calledNumber: params.to || start.to || null,
          sessionId: start.callSid || callSid,
        }, ({ from, to }) => {
          recordTimeline(TIMELINE_EVENT_TYPES.FSM_TRANSITION, 'Call state transition', { from, to }).then(() => {
            emitSocketEvent('call.fsm', {
              callSid,
              callId: callRecordId,
              from,
              to,
              timestamp: new Date().toISOString(),
            });
          }).catch(err => logger.warn('TIMELINE_RECORD_FAILED', { callSid, error: err.message }));
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

        logger.info('RECEPTIONIST_CALL_STARTED', {
          callSid,
          streamSid,
          fromTail: callerPhone ? callerPhone.slice(-4) : 'unknown',
        });

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
