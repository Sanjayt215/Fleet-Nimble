import logger from '../utils/logger.js';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CALENDAR_CLIENT_ID;

export async function createCalendarEvent(userId, appointment) {
  if (!GOOGLE_CLIENT_ID) {
    logger.warn('GOOGLE_CALENDAR not configured, using internal calendar', { userId, appointmentId: appointment.id });
    return { provider: 'internal', eventId: null };
  }

  // Google Calendar API integration is not implemented — never claim an event
  // was created or fabricate an eventId.
  logger.warn('GOOGLE_CALENDAR_API_NOT_IMPLEMENTED', { userId, appointmentId: appointment.id });
  return { provider: 'google', eventId: null, meetingLink: null, created: false };
}

export async function updateCalendarEvent(userId, appointment) {
  logger.warn('GOOGLE_CALENDAR_API_NOT_IMPLEMENTED', { op: 'update', userId, appointmentId: appointment?.id });
  return { success: false, reason: 'google_calendar_api_not_implemented' };
}

export async function deleteCalendarEvent(userId, eventId) {
  logger.warn('GOOGLE_CALENDAR_API_NOT_IMPLEMENTED', { op: 'delete', userId, eventId });
  return { success: false, reason: 'google_calendar_api_not_implemented' };
}
