import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import { isPersistenceAvailable } from './receptionistTenantResolver.service.js';
import { getTranscript } from './receptionistTranscript.service.js';
import { getTimelineByCall, getLiveTimeline } from './conversationTimeline.service.js';

function computeLatencyMarkers(transcriptEntries) {
  const markers = [];
  for (let i = 1; i < transcriptEntries.length; i++) {
    const prev = transcriptEntries[i - 1];
    const cur = transcriptEntries[i];
    if (prev.role !== cur.role) {
      const prevTs = new Date(prev.timestamp).getTime();
      const curTs = new Date(cur.timestamp).getTime();
      if (Number.isFinite(prevTs) && Number.isFinite(curTs) && curTs >= prevTs) {
        markers.push({
          at: cur.timestamp,
          turnIndex: i,
          role: cur.role,
          gapMs: curTs - prevTs,
        });
      }
    }
  }
  const avgResponseLatencyMs = markers.length
    ? Math.round(markers.reduce((s, m) => s + m.gapMs, 0) / markers.length)
    : 0;
  return { markers, avgResponseLatencyMs };
}

export async function replayCall(userId, callId) {
  if (!isPersistenceAvailable()) {
    const live = getLiveTimeline(callId);
    const events = Array.isArray(live) ? live.filter(e => e.userId === userId) : [];
    if (events.length === 0) return null;
    return {
      call: { id: callId, twilioCallSid: callId },
      timeline: events,
      fsmTransitions: events.filter(e => e.eventType === 'FSM_TRANSITION'),
      memoryUpdates: events.filter(e => e.eventType === 'MEMORY_UPDATED'),
      transcript: [],
      agentRuns: [],
      analytics: null,
      conversationSummary: null,
      latency: { markers: [], avgResponseLatencyMs: 0 },
      source: 'live',
    };
  }

  try {
    const [call, timelineEvents, agentRuns, summary, analytics, storedTranscript] = await Promise.all([
      prisma.aiReceptionistCall.findFirst({
        where: { id: callId, userId },
        include: {
          appointment: true,
          supportTicket: true,
          customer: true,
        },
      }),
      getTimelineByCall(userId, callId),
      prisma.agentRun.findMany({
        where: { OR: [{ callId }, { callSid: callId }] },
        include: { tasks: { orderBy: { at: 'asc' } } },
        orderBy: { startedAt: 'asc' },
      }),
      prisma.conversationSummary.findUnique({ where: { callId } }).catch(() => null),
      prisma.conversationAnalytics.findUnique({ where: { callId } }).catch(() => null),
      getTranscript(callId),
    ]);

    if (!call) return null;

    const transcript = Array.isArray(storedTranscript) && storedTranscript.length
      ? storedTranscript
      : (Array.isArray(call.transcript) ? call.transcript : []);
    const latency = computeLatencyMarkers(transcript);

    return {
      call: {
        id: call.id,
        twilioCallSid: call.twilioCallSid,
        callerName: call.callerName,
        callerPhone: call.callerPhone,
        callerEmail: call.callerEmail,
        callType: call.callType,
        callStatus: call.callStatus,
        callStartedAt: call.callStartedAt,
        callEndedAt: call.callEndedAt,
        durationSeconds: call.durationSeconds,
        intent: call.extractedData?.intent || null,
        sentiment: call.sentiment,
        summary: call.summary,
        appointment: call.appointment || null,
        supportTicket: call.supportTicket || null,
        customer: call.customer ? {
          id: call.customer.id,
          name: call.customer.name,
          companyName: call.customer.companyName,
          phone: call.customer.phone,
          email: call.customer.email,
          status: call.customer.status,
        } : null,
      },
      transcript,
      timeline: timelineEvents || [],
      fsmTransitions: (timelineEvents || []).filter(e => e.eventType === 'FSM_TRANSITION'),
      memoryUpdates: (timelineEvents || []).filter(e => e.eventType === 'MEMORY_UPDATED'),
      agentRuns: (agentRuns || []).map(run => ({
        id: run.id,
        runId: run.runId,
        utterance: run.utterance,
        intent: run.intent,
        fsmState: run.fsmState,
        mode: run.mode,
        status: run.status,
        outcome: run.outcome,
        error: run.error,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        tasks: run.tasks || [],
      })),
      summary: summary || null,
      analytics: analytics || null,
      latency,
      source: 'persisted',
    };
  } catch (err) {
    logger.warn('REPLAY_FAILED', { userId, callId, error: err.message });
    return null;
  }
}
