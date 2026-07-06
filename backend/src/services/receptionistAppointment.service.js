import prisma from '../utils/prisma.js';

export async function createAppointment(userId, data) {
  const { callId, ...apptData } = data;
  const appointment = await prisma.aiReceptionistAppointment.create({
    data: {
      userId,
      ...apptData,
      scheduledDate: new Date(data.scheduledDate),
    },
  });

  if (callId) {
    await prisma.aiReceptionistCall.update({
      where: { id: callId },
      data: { appointmentId: appointment.id },
    });
  }

  return appointment;
}

export async function getAppointments(userId, { page = 1, limit = 20, status, startDate, endDate }) {
  const where = { userId };
  if (status) where.status = status;
  if (startDate || endDate) {
    where.scheduledDate = {};
    if (startDate) where.scheduledDate.gte = new Date(startDate);
    if (endDate) where.scheduledDate.lte = new Date(endDate);
  }

  const [total, appointments] = await Promise.all([
    prisma.aiReceptionistAppointment.count({ where }),
    prisma.aiReceptionistAppointment.findMany({
      where,
      orderBy: { scheduledDate: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return { appointments, total, page, totalPages: Math.ceil(total / limit) };
}

export async function updateAppointment(userId, id, data) {
  const existing = await prisma.aiReceptionistAppointment.findFirst({ where: { id, userId } });
  if (!existing) return null;

  const updateData = { ...data };
  if (data.scheduledDate) updateData.scheduledDate = new Date(data.scheduledDate);

  return prisma.aiReceptionistAppointment.update({ where: { id }, data: updateData });
}

export async function getUpcomingAppointments(userId, limit = 10) {
  return prisma.aiReceptionistAppointment.findMany({
    where: {
      userId,
      scheduledDate: { gte: new Date() },
      status: { in: ['SCHEDULED', 'CONFIRMED'] },
    },
    orderBy: { scheduledDate: 'asc' },
    take: limit,
  });
}
