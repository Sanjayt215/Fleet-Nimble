import prisma from '../utils/prisma.js';
import { emitToUser } from '../utils/socketHub.js';

function tenantWhere(userId, companyId) {
  return companyId ? { OR: [{ userId }, { companyId }] } : { userId };
}

export async function getCallLogs(userId, { page = 1, limit = 20, status, type, startDate, endDate }, companyId = null) {
  const where = tenantWhere(userId, companyId);
  if (status) where.callStatus = status;
  if (type) where.callType = type;
  if (startDate || endDate) {
    where.callStartedAt = {};
    if (startDate) where.callStartedAt.gte = new Date(startDate);
    if (endDate) where.callStartedAt.lte = new Date(endDate);
  }

  const [total, calls] = await Promise.all([
    prisma.aiReceptionistCall.count({ where }),
    prisma.aiReceptionistCall.findMany({
      where,
      orderBy: { callStartedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        appointment: { select: { id: true, meetingTitle: true, scheduledDate: true, status: true } },
        supportTicket: { select: { id: true, issueTitle: true, status: true, urgency: true } },
        customer: { select: { id: true, name: true, leadScore: true } },
      },
    }),
  ]);

  return { calls, total, page, totalPages: Math.ceil(total / limit) };
}

export async function getCallById(userId, id, companyId = null) {
  return prisma.aiReceptionistCall.findFirst({
    where: { id, ...tenantWhere(userId, companyId) },
    include: {
      appointment: true,
      supportTicket: true,
      customer: { select: { id: true, name: true, leadScore: true, companyName: true, fleetSize: true, status: true } },
    },
  });
}

export async function createCall(userId, data) {
  const call = await prisma.aiReceptionistCall.create({
    data: { userId, ...data },
  });
  
  // Emit Socket.IO event for real-time frontend update
  emitToUser(userId, 'call.created', { call });
  
  return call;
}

export async function updateCallStatus(userId, id, callStatus) {
  const call = await prisma.aiReceptionistCall.update({
    where: { id },
    data: {
      callStatus,
      callEndedAt: callStatus === 'COMPLETED' || callStatus === 'FAILED' ? new Date() : undefined,
    },
  });
  
  // Emit Socket.IO event for real-time frontend update
  if (callStatus === 'COMPLETED') {
    emitToUser(userId, 'call.completed', { call });
  }
  
  return call;
}

export async function updateCall(userId, id, data) {
  const existing = await prisma.aiReceptionistCall.findFirst({ where: { id, userId } });
  if (!existing) return null;
  return prisma.aiReceptionistCall.update({ where: { id }, data });
}

export async function getSummary(userId, companyId = null) {
  const [totalCalls, missedCalls, scheduledMeetings, supportTickets, escalatedCalls] = await Promise.all([
    prisma.aiReceptionistCall.count({ where: tenantWhere(userId, companyId) }),
    prisma.aiReceptionistCall.count({ where: { ...tenantWhere(userId, companyId), callStatus: 'FAILED' } }),
    prisma.aiReceptionistAppointment.count({ where: { ...tenantWhere(userId, companyId), status: { in: ['SCHEDULED', 'CONFIRMED'] } } }),
    prisma.aiReceptionistSupportTicket.count({ where: { ...tenantWhere(userId, companyId), status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
    prisma.aiReceptionistCall.count({ where: { ...tenantWhere(userId, companyId), callStatus: 'ESCALATED' } }),
  ]);

  return { totalCalls, missedCalls, scheduledMeetings, supportTickets, escalatedCalls };
}

export async function getRecentCalls(userId, limit = 5, companyId = null) {
  return prisma.aiReceptionistCall.findMany({
    where: tenantWhere(userId, companyId),
    orderBy: { callStartedAt: 'desc' },
    take: limit,
    include: {
      appointment: { select: { id: true, meetingTitle: true, scheduledDate: true } },
      supportTicket: { select: { id: true, issueTitle: true } },
    },
  });
}
