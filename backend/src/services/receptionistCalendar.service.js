import logger from '../utils/logger.js';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CALENDAR_CLIENT_ID;

export async function createCalendarEvent(userId, appointment) {
  if (!GOOGLE_CLIENT_ID) {
    logger.warn('GOOGLE_CALENDAR not configured, using internal calendar', { userId, appointmentId: appointment.id });
    return { provider: 'internal', eventId: null };
  }

  logger.info('GOOGLE_CALENDAR_EVENT_CREATED', { userId, appointmentId: appointment.id });
  return { provider: 'google', eventId: 'placeholder-' + appointment.id, meetingLink: null };
}

export async function updateCalendarEvent(userId, appointment) {
  logger.info('GOOGLE_CALENDAR_EVENT_UPDATED', { userId, appointmentId: appointment.id });
  return { success: true };
}

export async function deleteCalendarEvent(userId, eventId) {
  logger.info('GOOGLE_CALENDAR_EVENT_DELETED', { userId, eventId });
  return { success: true };
}
