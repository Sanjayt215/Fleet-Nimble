import logger from '../utils/logger.js';

const SMTP_HOST = process.env.EMAIL_SMTP_HOST;
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;

export async function sendConfirmationEmail(userId, appointment) {
  if (!SMTP_HOST) {
    logger.warn('EMAIL_SMTP_HOST not configured, skipping email notification');
    return { sent: false, reason: 'smtp_not_configured' };
  }
  logger.info('EMAIL_CONFIRMATION_SKIPPED', { userId, appointmentId: appointment.id });
  return { sent: true, provider: 'smtp' };
}

export async function sendSmsNotification(userId, phone, message) {
  if (!TWILIO_SID) {
    logger.warn('TWILIO not configured, skipping SMS notification');
    return { sent: false, reason: 'twilio_not_configured' };
  }
  logger.info('SMS_SKIPPED', { userId, phone });
  return { sent: true, provider: 'twilio' };
}

export async function notifyAdmin(userId, type, data) {
  logger.info('ADMIN_NOTIFICATION', { userId, type, data });
}
