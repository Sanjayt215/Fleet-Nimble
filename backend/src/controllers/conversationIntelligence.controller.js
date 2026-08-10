import * as timelineService from '../services/conversationTimeline.service.js';
import * as summaryService from '../services/conversationSummary.service.js';
import * as analyticsService from '../services/conversationAnalytics.service.js';
import * as followUpService from '../services/followUp.service.js';
import * as leadService from '../services/leadQualification.service.js';
import { getSupervisorStatus } from '../services/callSupervisor.service.js';
import { replayCall } from '../services/conversationReplay.service.js';
import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

export async function getTimeline(req, res) {
  const { callId } = req.params;
  const events = await timelineService.getTimelineByCall(req.user.id, callId);
  res.json({ success: true, data: { callId, events } });
}

export async function getTimelineStats(req, res) {
  res.json({ success: true, data: await timelineService.getTimelineStats(req.user.id) });
}

export async function getRecentTimelines(req, res) {
  const { limit = 50 } = req.query;
  const events = await timelineService.getTimelinesByUser(req.user.id, { limit: parseInt(limit, 10) || 50 });
  res.json({ success: true, data: events });
}

export async function getSummaries(req, res) {
  const { limit = 50, intent } = req.query;
  const summaries = await summaryService.getConversationSummaries(req.user.id, {
    limit: parseInt(limit, 10) || 50,
    intent: intent || null,
  });
  res.json({ success: true, data: summaries });
}

export async function getSummaryByCall(req, res) {
  const { callId } = req.params;
  const summary = await summaryService.getConversationSummaryByCall(req.user.id, callId);
  if (!summary) {
    return res.status(404).json({ success: false, message: 'No conversation summary found for this call' });
  }
  res.json({ success: true, data: summary });
}

export async function getConversationAnalytics(req, res) {
  const { days = 30 } = req.query;
  const overview = await analyticsService.getConversationAnalyticsOverview(req.user.id, { days: parseInt(days, 10) || 30 });
  res.json({ success: true, data: overview });
}

export async function getConversationAnalyticsByCall(req, res) {
  const { callId } = req.params;
  const analytics = await analyticsService.getConversationAnalyticsByCall(req.user.id, callId);
  if (!analytics) {
    return res.status(404).json({ success: false, message: 'No conversation analytics found for this call' });
  }
  res.json({ success: true, data: analytics });
}

export async function getFollowUps(req, res) {
  const { status, limit = 50 } = req.query;
  const followUps = await followUpService.getFollowUps(req.user.id, {
    status: status || null,
    limit: parseInt(limit, 10) || 50,
  });
  res.json({ success: true, data: followUps });
}

export async function getFollowUpsByAppointment(req, res) {
  const { appointmentId } = req.params;
  const followUps = await followUpService.getFollowUpsByAppointment(req.user.id, appointmentId);
  res.json({ success: true, data: followUps });
}

export async function completeFollowUp(req, res) {
  const { id } = req.params;
  const reminder = await followUpService.completeFollowUp(req.user.id, id);
  if (!reminder) {
    return res.status(404).json({ success: false, message: 'Follow-up not found' });
  }
  res.json({ success: true, data: reminder });
}

export async function getLeads(req, res) {
  const { minScore = 0, status, limit = 50 } = req.query;
  const leads = await leadService.getLeadProfiles(req.user.id, {
    minScore: parseInt(minScore, 10) || 0,
    status: status || null,
    limit: parseInt(limit, 10) || 50,
  });
  res.json({ success: true, data: leads });
}

export async function getLeadByCustomer(req, res) {
  const { customerId } = req.params;
  if (!req.user.id || !customerId) {
    return res.status(400).json({ success: false, message: 'Missing customerId' });
  }
  const customer = await prisma.receptionistCustomer.findFirst({
    where: { id: customerId, userId: req.user.id },
    select: {
      id: true, name: true, companyName: true, phone: true, email: true, fleetSize: true,
      status: true, salesStage: true, leadScore: true, metadata: true, tags: true,
      lastIntent: true, lastSummary: true, lastContactAt: true,
    },
  });
  if (!customer) {
    return res.status(404).json({ success: false, message: 'Customer not found' });
  }
  res.json({ success: true, data: { ...customer, leadProfile: customer.metadata?.leadProfile || {} } });
}

export async function getSupervisor(_req, res) {
  res.json({ success: true, data: await getSupervisorStatus() });
}

export async function getReplay(req, res) {
  const { callId } = req.params;
  const replay = await replayCall(req.user.id, callId);
  if (!replay) {
    return res.status(404).json({ success: false, message: 'Replay data not found for this call' });
  }
  res.json({ success: true, data: replay });
}

export async function getLiveDashboard(_req, res) {
  const timelines = timelineService.getAllLiveTimelines();
  const calls = await prisma.aiReceptionistCall.findMany({
    where: { callStatus: 'IN_PROGRESS' },
    orderBy: { callStartedAt: 'desc' },
    take: 25,
    select: {
      id: true, twilioCallSid: true, callerName: true, callerPhone: true, callStartedAt: true,
      userId: true, callType: true,
    },
  }).catch(() => []);
  res.json({
    success: true,
    data: {
      activeCalls: calls,
      liveTimelines: timelines,
    },
  });
}
