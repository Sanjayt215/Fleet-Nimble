import prisma from '../utils/prisma.js';

const DEFAULT_CONFIG = {
  businessName: 'My Business',
  greetingMessage: 'Hello! Thank you for calling FleetNimble. How can I assist you today?',
  timezone: 'UTC',
  language: 'en',
  voiceId: 'alloy',
  escalationPhone: null,
  escalationEmail: null,
  salesHandoffNumber: null,
  supportHandoffNumber: null,
  emergencyHandoffNumber: null,
  afterHoursBehavior: 'voicemail',
  appointmentDuration: 30,
  enabled: true,
};

export async function getConfig(userId) {
  let config = await prisma.aiReceptionistConfig.findUnique({ where: { userId } });
  if (!config) {
    config = await prisma.aiReceptionistConfig.create({
      data: { userId },
    });
  }
  return config;
}

export async function updateConfig(userId, data) {
  const existing = await prisma.aiReceptionistConfig.findUnique({ where: { userId } });
  if (!existing) {
    return prisma.aiReceptionistConfig.create({
      data: { userId, ...DEFAULT_CONFIG, ...data },
    });
  }
  return prisma.aiReceptionistConfig.update({
    where: { userId },
    data,
  });
}

export async function getOrCreateConfig(userId) {
  let config = await prisma.aiReceptionistConfig.findUnique({ where: { userId } });
  if (!config) {
    config = await prisma.aiReceptionistConfig.create({
      data: { userId },
    });
  }
  return config;
}
