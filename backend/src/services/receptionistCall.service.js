import prisma from '../utils/prisma.js';

export async function getCallLogs(userId, { page = 1, limit = 20, status, type, startDate, endDate }) {
  const where = { userId };
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
      },
    }),
  ]);

  return { calls, total, page, totalPages: Math.ceil(total / limit) };
}

export async function getCallById(userId, id) {
  return prisma.aiReceptionistCall.findFirst({
    where: { id, userId },
    include: {
      appointment: true,
      supportTicket: true,
    },
  });
}

export async function createCall(userId, data) {
  return prisma.aiReceptionistCall.create({
    data: { userId, ...data },
  });
}

export async function updateCallStatus(userId, id, callStatus) {
  return prisma.aiReceptionistCall.update({
    where: { id },
    data: {
      callStatus,
      callEndedAt: callStatus === 'COMPLETED' || callStatus === 'FAILED' ? new Date() : undefined,
    },
  });
}

export async function updateCall(userId, id, data) {
  const existing = await prisma.aiReceptionistCall.findFirst({ where: { id, userId } });
  if (!existing) return null;
  return prisma.aiReceptionistCall.update({ where: { id }, data });
}

export async function getSummary(userId) {
  const [totalCalls, missedCalls, scheduledMeetings, supportTickets, escalatedCalls] = await Promise.all([
    prisma.aiReceptionistCall.count({ where: { userId } }),
    prisma.aiReceptionistCall.count({ where: { userId, callStatus: 'FAILED' } }),
    prisma.aiReceptionistAppointment.count({ where: { userId, status: { in: ['SCHEDULED', 'CONFIRMED'] } } }),
    prisma.aiReceptionistSupportTicket.count({ where: { userId, status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
    prisma.aiReceptionistCall.count({ where: { userId, callStatus: 'ESCALATED' } }),
  ]);

  return { totalCalls, missedCalls, scheduledMeetings, supportTickets, escalatedCalls };
}

export async function getRecentCalls(userId, limit = 5) {
  return prisma.aiReceptionistCall.findMany({
    where: { userId },
    orderBy: { callStartedAt: 'desc' },
    take: limit,
    include: {
      appointment: { select: { id: true, meetingTitle: true, scheduledDate: true } },
      supportTicket: { select: { id: true, issueTitle: true } },
    },
  });
}
