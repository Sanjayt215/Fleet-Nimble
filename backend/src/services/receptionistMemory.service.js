import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

export async function findOrCreateCustomer(userId, extracted) {
  const { callerName, phone, email, company, fleetSize } = extracted;
  if (!phone && !email && !callerName) return null;

  const where = { userId };
  const orClauses = [];
  if (phone) orClauses.push({ phone });
  if (email) orClauses.push({ email });
  if (orClauses.length === 0) return null;
  where.OR = orClauses;

  let customer = await prisma.receptionistCustomer.findFirst({ where });

  if (!customer) {
    customer = await prisma.receptionistCustomer.create({
      data: {
        userId,
        phone: phone || null,
        email: email || null,
        name: callerName || 'Unknown',
        companyName: company || null,
        fleetSize: fleetSize || null,
        status: 'LEAD',
        leadScore: calculateLeadScore({ fleetSize, company }),
        lastContactAt: new Date(),
      },
    });
    logger.info('CUSTOMER_CREATED', { userId, customerId: customer.id, name: callerName });
  } else {
    const updates = { lastContactAt: new Date() };
    if (callerName && !customer.name) updates.name = callerName;
    if (company && customer.companyName !== company) updates.companyName = company;
    if (fleetSize != null && customer.fleetSize !== fleetSize) updates.fleetSize = fleetSize;
    if (phone && !customer.phone) updates.phone = phone;
    if (email && !customer.email) updates.email = email;

    customer = await prisma.receptionistCustomer.update({
      where: { id: customer.id },
      data: {
        ...updates,
        totalCalls: { increment: 1 },
      },
    });
    logger.info('CUSTOMER_UPDATED', { userId, customerId: customer.id });
  }

  return customer;
}

export async function getCustomerMemory(customerId) {
  if (!customerId) return {};

  const customer = await prisma.receptionistCustomer.findUnique({
    where: { id: customerId },
    include: {
      notes: { orderBy: { createdAt: 'desc' }, take: 5 },
    },
  });

  if (!customer) return {};

  const [recentCalls, recentAppointments, recentTickets] = await Promise.all([
    prisma.aiReceptionistCall.findMany({
      where: { userId: customer.userId },
      take: 3,
      orderBy: { callStartedAt: 'desc' },
      select: { callerName: true, callType: true, summary: true, callStartedAt: true, sentiment: true },
    }).then(calls => calls.filter(c =>
      c.callerName?.toLowerCase() === customer.name?.toLowerCase()
    )),
    prisma.aiReceptionistAppointment.findMany({
      where: { userId: customer.userId },
      take: 3,
      orderBy: { scheduledDate: 'desc' },
      select: { callerName: true, meetingPurpose: true, scheduledDate: true, status: true },
    }).then(appts => appts.filter(a =>
      a.callerName?.toLowerCase() === customer.name?.toLowerCase()
    )),
    prisma.aiReceptionistSupportTicket.findMany({
      where: { userId: customer.userId },
      take: 3,
      orderBy: { createdAt: 'desc' },
      select: { callerName: true, issueTitle: true, status: true, urgency: true },
    }).then(tickets => tickets.filter(t =>
      t.callerName?.toLowerCase() === customer.name?.toLowerCase()
    )),
  ]);

  return {
    customer,
    recentCalls,
    recentAppointments,
    recentTickets,
    isReturning: customer.totalCalls > 1,
    lastVisit: customer.lastContactAt,
    totalVisits: customer.totalCalls,
  };
}

export async function updateCustomerAfterCall(customerId, { callId, appointmentId, ticketId, intent, summary, sentiment }) {
  const updates = { lastIntent: intent };

  if (summary) updates.lastSummary = summary;
  if (sentiment) {
    const customer = await prisma.receptionistCustomer.findUnique({ where: { id: customerId }, select: { sentimentHistory: true } });
    if (customer) {
      const history = Array.isArray(customer.sentimentHistory) ? customer.sentimentHistory : [];
      history.push({ sentiment, date: new Date().toISOString(), callId });
      updates.sentimentHistory = history.slice(-20);
    }
  }

  if (appointmentId) updates.totalAppointments = { increment: 1 };
  if (ticketId) updates.totalTickets = { increment: 1 };

  const leadScoreIncrease = 0;
  if (intent === 'schedule_meeting' || intent === 'book_demo') {
    updates.leadScore = { increment: 10 };
  } else if (intent === 'support_request') {
    updates.leadScore = { increment: 5 };
  } else if (intent === 'pricing') {
    updates.leadScore = { increment: 15 };
  }

  return prisma.receptionistCustomer.update({ where: { id: customerId }, data: updates });
}

export function buildMemoryPrompt(memory) {
  if (!memory || !memory.customer) return '';

  const { customer, recentCalls, recentAppointments, recentTickets, isReturning } = memory;
  const parts = [];

  if (isReturning) {
    parts.push(`Returning caller: ${customer.name}`);
    if (customer.lastSummary) parts.push(`Last conversation summary: ${customer.lastSummary}`);
    if (customer.lastIntent) parts.push(`Last intent: ${customer.lastIntent}`);
  } else {
    parts.push(`New caller: ${customer.name}`);
  }

  if (customer.companyName) parts.push(`Company: ${customer.companyName}`);
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

function calculateLeadScore(data) {
  let score = 0;
  if (data.fleetSize) {
    if (data.fleetSize >= 100) score += 40;
    else if (data.fleetSize >= 20) score += 25;
    else if (data.fleetSize >= 5) score += 10;
    else score += 5;
  }
  if (data.company) score += 15;
  return Math.min(score, 100);
}
