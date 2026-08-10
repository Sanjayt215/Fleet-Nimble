import prisma from '../utils/prisma.js';
import { emitToUser } from '../utils/socketHub.js';

function tenantWhere(userId, companyId) {
  return companyId ? { OR: [{ userId }, { companyId }] } : { userId };
}

export async function createSupportTicket(userId, data) {
  const { callId, ...ticketData } = data;
  const ticket = await prisma.aiReceptionistSupportTicket.create({
    data: { userId, ...ticketData },
  });

  if (callId) {
    await prisma.aiReceptionistCall.update({
      where: { id: callId },
      data: { supportTicketId: ticket.id },
    });
  }

  // Emit Socket.IO event for real-time frontend update
  emitToUser(userId, 'support.ticket.created', { ticket });

  return ticket;
}

export async function getSupportTickets(userId, { page = 1, limit = 20, status, urgency }, companyId = null) {
  const where = tenantWhere(userId, companyId);
  if (status) where.status = status;
  if (urgency) where.urgency = urgency;

  const [total, tickets] = await Promise.all([
    prisma.aiReceptionistSupportTicket.count({ where }),
    prisma.aiReceptionistSupportTicket.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return { tickets, total, page, totalPages: Math.ceil(total / limit) };
}

export async function updateSupportTicket(userId, id, data) {
  const existing = await prisma.aiReceptionistSupportTicket.findFirst({ where: { id, userId } });
  if (!existing) return null;
  return prisma.aiReceptionistSupportTicket.update({ where: { id }, data });
}

export async function getOpenSupportTickets(userId, limit = 10) {
  return prisma.aiReceptionistSupportTicket.findMany({
    where: {
      userId,
      status: { in: ['OPEN', 'IN_PROGRESS'] },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}
