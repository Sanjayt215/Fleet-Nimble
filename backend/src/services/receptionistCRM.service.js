import prisma from '../utils/prisma.js';

function tenantWhere(userId, companyId) {
  return companyId ? { OR: [{ userId }, { companyId }] } : { userId };
}

export async function getCustomers(userId, { page = 1, limit = 20, status, search, sortBy = 'leadScore', sortOrder = 'desc' }, companyId = null) {
  const where = tenantWhere(userId, companyId);
  if (status) where.status = status;
  if (search) {
    where.AND = where.AND || [];
    where.AND.push({
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { companyName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { email: { contains: search, mode: 'insensitive' } },
      ],
    });
  }

  const orderBy = {};
  if (sortBy === 'leadScore') orderBy.leadScore = sortOrder;
  else if (sortBy === 'name') orderBy.name = sortOrder;
  else if (sortBy === 'lastContactAt') orderBy.lastContactAt = sortOrder;
  else if (sortBy === 'createdAt') orderBy.createdAt = sortOrder;
  else orderBy.leadScore = 'desc';

  const [total, customers] = await Promise.all([
    prisma.receptionistCustomer.count({ where }),
    prisma.receptionistCustomer.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      include: {
        notes: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    }),
  ]);

  return { customers, total, page, totalPages: Math.ceil(total / limit) };
}

export async function getCustomerById(userId, id, companyId = null) {
  return prisma.receptionistCustomer.findFirst({
    where: { id, ...tenantWhere(userId, companyId) },
    include: {
      notes: { orderBy: { createdAt: 'desc' } },
    },
  });
}

export async function updateCustomerStatus(userId, id, data) {
  const existing = await prisma.receptionistCustomer.findFirst({ where: { id, userId } });
  if (!existing) return null;
  return prisma.receptionistCustomer.update({ where: { id }, data });
}

export async function addCustomerNote(userId, customerId, content, type = 'GENERAL') {
  const customer = await prisma.receptionistCustomer.findFirst({ where: { id: customerId, userId } });
  if (!customer) return null;
  return prisma.receptionistCustomerNote.create({
    data: { customerId, userId, content, type },
  });
}

export async function getLeadPipelineSummary(userId, companyId = null) {
  const [leads, prospects, customers, partners, enterprise] = await Promise.all([
    prisma.receptionistCustomer.count({ where: { ...tenantWhere(userId, companyId), status: 'LEAD' } }),
    prisma.receptionistCustomer.count({ where: { ...tenantWhere(userId, companyId), status: 'PROSPECT' } }),
    prisma.receptionistCustomer.count({ where: { ...tenantWhere(userId, companyId), status: 'CUSTOMER' } }),
    prisma.receptionistCustomer.count({ where: { ...tenantWhere(userId, companyId), status: 'PARTNER' } }),
    prisma.receptionistCustomer.count({ where: { ...tenantWhere(userId, companyId), status: 'ENTERPRISE' } }),
  ]);

  return { leads, prospects, customers, partners, enterprise, total: leads + prospects + customers + partners + enterprise };
}

export async function getHighPriorityLeads(userId, limit = 10, companyId = null) {
  return prisma.receptionistCustomer.findMany({
    where: { ...tenantWhere(userId, companyId), leadScore: { gte: 50 } },
    orderBy: { leadScore: 'desc' },
    take: limit,
  });
}

export async function recalculateLeadScore(userId, customerId) {
  const customer = await prisma.receptionistCustomer.findFirst({ where: { id: customerId, userId } });
  if (!customer) return null;

  let score = 0;

  if (customer.fleetSize) {
    if (customer.fleetSize >= 100) score += 30;
    else if (customer.fleetSize >= 20) score += 20;
    else if (customer.fleetSize >= 5) score += 10;
    else score += 5;
  }

  if (customer.companyName) score += 10;
  if (customer.email) score += 5;
  if (customer.phone) score += 5;

  if (customer.status === 'CUSTOMER' || customer.status === 'ENTERPRISE') score += 20;
  else if (customer.status === 'PROSPECT') score += 10;
  else if (customer.status === 'PARTNER') score += 15;

  score += Math.min(customer.totalAppointments * 5, 20);
  score += Math.min(customer.totalCalls, 10);

  score = Math.min(score, 100);

  return prisma.receptionistCustomer.update({
    where: { id: customerId },
    data: { leadScore: score },
  });
}
