import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import * as twilioWebhook from '../services/twilioWebhook.service.js';
import * as configService from '../services/receptionistConfig.service.js';
import * as callService from '../services/receptionistCall.service.js';
import * as memoryService from '../services/receptionistMemory.service.js';
import * as transcriptService from '../services/receptionistTranscript.service.js';
import * as handoffService from '../services/receptionistHandoff.service.js';
import * as orchestrator from '../services/receptionistOrchestrator.service.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  registerSession,
  getSession,
  removeSession,
  getActiveSessions,
  getActiveSessionsCount,
  addTranscriptEntry,
} from '../services/receptionistRealtime.service.js';
import { config } from '../config/index.js';

export async function handleIncomingCall(req, res) {
  try {
    const valid = twilioWebhook.validateTwilioRequest(req);
    if (!valid) {
      logger.warn('TWILIO_INVALID_SIGNATURE', { path: req.originalUrl });
      return res.status(403).type('text/xml').send(twilioWebhook.buildFallbackTwiML());
    }

    if (!config.aiReceptionist.enabled) {
      return res.type('text/xml').send(twilioWebhook.buildUnavailableTwiML());
    }

    const { CallSid, From, To, AccountSid, AccountType } = req.body || {};

    logger.info('DIAG_VOICE_WEBHOOK_RECEIVED', {
      CallSid,
      fromTail: From ? From.slice(-4) : 'unknown',
      toTail: To ? To.slice(-4) : 'unknown',
      accountType: AccountType || 'unknown',
      isTrial: !From || From.startsWith('client:'),
    });

    const realtimeReady = config.realtime.configured && config.realtime.mediaStreamEnabled;

    logger.info('DIAG_REALTIME_READINESS', {
      CallSid,
      realtimeConfigured: config.realtime.configured,
      mediaStreamEnabled: config.realtime.mediaStreamEnabled,
      model: config.realtime.model || '(not set)',
      apiKeyPresent: Boolean(config.openai.apiKey),
      aiReceptionistEnabled: config.aiReceptionist.enabled,
      realtimeReady,
      action: realtimeReady ? 'BUILD_MEDIA_STREAM_TWIML' : 'FALLBACK_TO_GREETING',
    });

    if (!realtimeReady) {
      logger.warn('REALTIME_NOT_READY_FALLBACK_TO_GREETING', { CallSid });
      const greetingTwiml = twilioWebhook.buildGreetingTwiML();
      return res.type('text/xml').send(greetingTwiml);
    }

    const twiml = twilioWebhook.buildIncomingTwiML(CallSid, From, To, {
      publicUrl: config.publicUrl,
      AccountSid,
    });

    logger.info('DIAG_TWIML_SENT', {
      CallSid,
      type: 'MEDIA_STREAM_TWIML',
      containsStream: twiml.includes('<Stream'),
    });

    res.type('text/xml').send(twiml);
    logger.info('TWILIO_INCOMING_CALL', { CallSid, From, To });
  } catch (err) {
    logger.error('TWILIO_INCOMING_CALL_ERROR', { error: err.message });
    res.type('text/xml').send(twilioWebhook.buildFallbackTwiML());
  }
}

export async function handleFallbackCall(req, res) {
  try {
    res.type('text/xml').send(twilioWebhook.buildFallbackTwiML());
  } catch (err) {
    logger.error('TWILIO_FALLBACK_ERROR', { error: err.message });
    res.type('text/xml').send(twilioWebhook.buildFallbackTwiML());
  }
}

export async function handleStatusCallback(req, res) {
  try {
    const { CallSid, CallStatus, CallDuration, From, To, AccountSid } = req.body || {};

    const fromTail = From ? From.slice(-4) : 'unknown';
    const toTail = To ? To.slice(-4) : 'unknown';
    logger.info('TWILIO_STATUS_CALLBACK', { CallSid, CallStatus, CallDuration, fromTail, toTail });

    const completedStatuses = ['completed', 'failed', 'busy', 'no-answer', 'canceled'];
    if (completedStatuses.includes(CallStatus?.toLowerCase())) {
      const callRecord = await prisma.aiReceptionistCall.findFirst({
        where: { twilioCallSid: CallSid },
      });

      if (callRecord) {
        const updates = {
          callStatus: CallStatus === 'completed' ? 'COMPLETED' : 'FAILED',
          callEndedAt: new Date(),
        };
        if (CallDuration) {
          updates.durationSeconds = parseInt(CallDuration, 10);
        }

        await prisma.aiReceptionistCall.update({
          where: { id: callRecord.id },
          data: updates,
        }).catch(e => logger.warn('STATUS_CALLBACK_UPDATE_FAILED', { CallSid, error: e.message }));

        await transcriptService.flushPendingTranscripts().catch(() => {});

        logger.info('CALL_STATUS_UPDATED_FROM_CALLBACK', {
          CallSid,
          callId: callRecord.id,
          newStatus: updates.callStatus,
        });
      }
    }

    await new Promise(resolve => setTimeout(resolve, 10));
    res.status(204).send('');
  } catch (err) {
    logger.error('TWILIO_STATUS_ERROR', { error: err.message });
    await new Promise(resolve => setTimeout(resolve, 10));
    res.status(204).send('');
  }
}

export async function handleRecordingCallback(req, res) {
  try {
    const { CallSid, RecordingUrl, RecordingDuration, RecordingSid } = req.body;

    logger.info('TWILIO_RECORDING_CALLBACK', { CallSid, RecordingSid, RecordingDuration });

    const call = await prisma.aiReceptionistCall.findFirst({
      where: { twilioCallSid: CallSid },
    });

    if (call) {
      await prisma.aiReceptionistCall.update({
        where: { id: call.id },
        data: {
          recordingUrl: RecordingUrl || null,
          recordingDuration: RecordingDuration ? parseInt(RecordingDuration, 10) : null,
        },
      });

      const io = req.app.get('io');
      if (io) {
        io.to(`user:${call.userId}`).emit('call.recording', {
          callId: call.id,
          recordingUrl: RecordingUrl,
          recordingDuration: RecordingDuration,
        });
      }
    }

    res.status(200).send('');
  } catch (err) {
    logger.error('TWILIO_RECORDING_ERROR', { error: err.message });
    res.status(200).send('');
  }
}

export async function getLiveCalls(req, res, next) {
  try {
    const sessions = getActiveSessions();

    const enriched = await Promise.all(sessions.map(async (s) => {
      const session = getSession(s.callSid);
      const callLog = session?.metadata?.callLogId
        ? await callService.getCallById(req.userId, session.metadata.callLogId)
        : null;

      return {
        callSid: s.callSid,
        callId: session?.metadata?.callLogId || null,
        callerNumber: session?.metadata?.from || s.metadata?.from,
        detectedName: callLog?.callerName || null,
        language: callLog?.detectedLanguage || 'en',
        currentIntent: callLog?.callType || 'unknown',
        status: callLog?.callStatus || 'IN_PROGRESS',
        duration: s.duration,
        aiConfidence: callLog?.aiConfidence || null,
        startedAt: new Date(s.startedAt).toISOString(),
      };
    }));

    res.json({ success: true, data: { activeCalls: enriched, count: sessions.length } });
  } catch (err) { next(err); }
}

export async function endCall(req, res, next) {
  try {
    const { callSid } = req.params;
    const session = getSession(callSid);

    if (!session) {
      const call = await prisma.aiReceptionistCall.findFirst({
        where: { twilioCallSid: callSid },
      });
      if (call) {
        await prisma.aiReceptionistCall.update({
          where: { id: call.id },
          data: { callStatus: 'COMPLETED', callEndedAt: new Date() },
        });
      }
      return res.json({ success: true, data: { message: 'Call ended' } });
    }

    removeSession(callSid);

    if (session.metadata?.callLogId) {
      await callService.updateCallStatus(req.userId, session.metadata.callLogId, 'COMPLETED');
    }

    res.json({ success: true, data: { message: 'Call terminated' } });
  } catch (err) { next(err); }
}

export async function escalateCall(req, res, next) {
  try {
    const { callSid } = req.params;
    const { reason, department } = req.body;

    const session = getSession(callSid);
    if (!session?.metadata?.callLogId) {
      throw new AppError('Active call session not found', 404, 'NOT_FOUND');
    }

    const result = await handoffService.escalateCall(
      session.metadata.callLogId,
      reason || 'Manual escalation by admin',
      department || 'support'
    );

    if (!result) throw new AppError('Escalation failed', 500, 'ESCALATION_FAILED');

    removeSession(callSid);

    const io = req.app.get('io');
    if (io) {
      io.to(`user:${req.userId}`).emit('call.escalated', {
        callSid,
        callId: session.metadata.callLogId,
        reason,
        department,
        timestamp: new Date().toISOString(),
      });
    }

    res.json({ success: true, data: result.call });
  } catch (err) { next(err); }
}

export async function getAnalytics(req, res, next) {
  try {
    const { getCallAnalytics } = await import('../services/receptionistAnalytics.service.js');
    const analytics = await getCallAnalytics(req.userId);
    res.json({ success: true, data: analytics });
  } catch (err) { next(err); }
}

export async function getCallTranscript(req, res, next) {
  try {
    const { id } = req.params;
    const transcript = await transcriptService.getTranscript(id);
    res.json({ success: true, data: { transcript } });
  } catch (err) { next(err); }
}
