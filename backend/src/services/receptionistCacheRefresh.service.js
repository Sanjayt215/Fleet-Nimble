import logger from '../utils/logger.js';
import { clearCache as clearLiveDataCache } from './liveData.service.js';

const CACHE_EVENT_PREFIX = 'receptionist_cache_refresh';
const RECENT_REFRESHES = new Map();
const DEDUP_MS = 5000;

function shouldDedupe(userId, eventType) {
  const key = `${userId}_${eventType}`;
  const last = RECENT_REFRESHES.get(key);
  const now = Date.now();
  if (last && now - last < DEDUP_MS) return true;
  RECENT_REFRESHES.set(key, now);
  return false;
}

export async function refreshAllCaches(userId) {
  if (!userId) return;
  try {
    clearLiveDataCache();
    logger.info('DASHBOARD_CACHE_REFRESHED', { userId, event: 'receptionist_action' });
  } catch (err) {
    logger.warn('DASHBOARD_CACHE_REFRESH_FAILED', { userId, error: err.message });
  }
}

export async function refreshOnLeadCreated(userId, customerId) {
  if (shouldDedupe(userId, 'lead_created')) return;
  logger.info('DASHBOARD_REFRESH_LEAD_CREATED', { userId, customerId });
  await refreshAllCaches(userId);
}

export async function refreshOnAppointmentCreated(userId, appointmentId) {
  if (shouldDedupe(userId, 'appointment_created')) return;
  logger.info('DASHBOARD_REFRESH_APPOINTMENT_CREATED', { userId, appointmentId });
  await refreshAllCaches(userId);
}

export async function refreshOnTicketCreated(userId, ticketId) {
  if (shouldDedupe(userId, 'ticket_created')) return;
  logger.info('DASHBOARD_REFRESH_TICKET_CREATED', { userId, ticketId });
  await refreshAllCaches(userId);
}

export async function refreshOnNoteCreated(userId, customerId) {
  if (shouldDedupe(userId, 'note_created')) return;
  logger.info('DASHBOARD_REFRESH_NOTE_CREATED', { userId, customerId });
  await refreshAllCaches(userId);
}
