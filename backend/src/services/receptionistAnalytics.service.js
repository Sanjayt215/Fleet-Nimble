import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

export async function getCallAnalytics(userId) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);

    const [
      totalCallsToday,
      activeCalls,
      durationResult,
      missedCalls,
      escalatedCalls,
      appointments,
      supportTickets,
      languageDistribution,
      topReasons,
    ] = await Promise.all([
      prisma.aiReceptionistCall.count({
        where: { userId, callStartedAt: { gte: today, lte: todayEnd } },
      }),
      prisma.aiReceptionistCall.count({
        where: { userId, callStatus: 'IN_PROGRESS' },
      }),
      prisma.aiReceptionistCall.aggregate({
        where: { userId, durationSeconds: { not: null } },
        _avg: { durationSeconds: true },
      }),
      prisma.aiReceptionistCall.count({
        where: { userId, callStatus: 'FAILED' },
      }),
      prisma.aiReceptionistCall.count({
        where: { userId, callStatus: 'ESCALATED' },
      }),
      prisma.aiReceptionistAppointment.count({
        where: { userId },
      }),
      prisma.aiReceptionistSupportTicket.count({
        where: { userId },
      }),
      prisma.aiReceptionistCall.groupBy({
        by: ['detectedLanguage'],
        where: { userId, detectedLanguage: { not: null } },
        _count: { detectedLanguage: true },
      }),
      prisma.aiReceptionistCall.groupBy({
        by: ['callType'],
        where: { userId },
        _count: { callType: true },
        orderBy: { _count: { callType: 'desc' } },
        take: 5,
      }),
    ]);

    const totalCallsAllTime = await prisma.aiReceptionistCall.count({
      where: { userId },
    });

    const totalAppointmentsAllTime = appointments;
    const appointmentConversionRate = totalCallsAllTime > 0
      ? ((totalAppointmentsAllTime / totalCallsAllTime) * 100).toFixed(1)
      : '0';

    const totalTickets = supportTickets;
    const ticketCreationRate = totalCallsAllTime > 0
      ? ((totalTickets / totalCallsAllTime) * 100).toFixed(1)
      : '0';

    const langDist = {};
    languageDistribution.forEach((l) => {
      langDist[l.detectedLanguage] = l._count.detectedLanguage;
    });

    const reasons = {};
    topReasons.forEach((r) => {
      reasons[r.callType] = r._count.callType;
    });

    return {
      totalCallsToday,
      activeCalls,
      averageDuration: Math.round(durationResult._avg.durationSeconds || 0),
      missedCalls,
      escalatedCalls,
      appointmentConversionRate: parseFloat(appointmentConversionRate),
      ticketCreationRate: parseFloat(ticketCreationRate),
      totalAppointments: totalAppointmentsAllTime,
      totalTickets,
      languageDistribution: langDist,
      topCallReasons: reasons,
    };
  } catch (err) {
    logger.error('ANALYTICS_ERROR', { userId, error: err.message });
    return null;
  }
}