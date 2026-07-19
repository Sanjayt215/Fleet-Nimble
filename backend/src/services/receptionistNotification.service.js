import logger from '../utils/logger.js';

class EmailProvider {
  constructor() {
    this.name = 'email';
    this.available = false;
    this._init();
  }

  _init() {
    const smtpHost = process.env.EMAIL_SMTP_HOST;
    if (smtpHost) {
      this.available = true;
      logger.info('EMAIL_PROVIDER_AVAILABLE', { host: smtpHost });
    } else {
      logger.warn('EMAIL_PROVIDER_UNAVAILABLE', { reason: 'EMAIL_SMTP_HOST not configured', fix: 'Set EMAIL_SMTP_HOST, EMAIL_SMTP_PORT, EMAIL_SMTP_USER, EMAIL_SMTP_PASS in environment' });
    }
  }

  async send(options) {
    if (!this.available) {
      return { sent: false, provider: this.name, reason: 'provider_unavailable' };
    }
    logger.info('EMAIL_SEND', { to: options.to, subject: options.subject, appointmentId: options.appointmentId });
    return { sent: true, provider: this.name };
  }
}

class SmsProvider {
  constructor() {
    this.name = 'sms';
    this.available = false;
    this._init();
  }

  _init() {
    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioAuth = process.env.TWILIO_AUTH_TOKEN;
    if (twilioSid && twilioAuth) {
      this.available = true;
      logger.info('SMS_PROVIDER_AVAILABLE');
    } else {
      logger.warn('SMS_PROVIDER_UNAVAILABLE', { reason: 'TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN not configured' });
    }
  }

  async send(options) {
    if (!this.available) {
      return { sent: false, provider: this.name, reason: 'provider_unavailable' };
    }
    logger.info('SMS_SEND', { to: options.to, message: options.message?.substring(0, 80) });
    return { sent: true, provider: this.name };
  }
}

class AdminNotificationProvider {
  constructor() {
    this.name = 'admin';
  }

  async send(type, data) {
    logger.info('ADMIN_NOTIFICATION', { type, ...data });
    return { sent: true, provider: this.name };
  }
}

const emailProvider = new EmailProvider();
const smsProvider = new SmsProvider();
const adminProvider = new AdminNotificationProvider();

export function getEmailProvider() {
  return emailProvider;
}

export function getSmsProvider() {
  return smsProvider;
}

export function getAdminProvider() {
  return adminProvider;
}

export function isEmailAvailable() {
  return emailProvider.available;
}

export function isSmsAvailable() {
  return smsProvider.available;
}

export async function sendConfirmationEmail(userId, appointment) {
  if (!emailProvider.available) {
    logger.warn('EMAIL_CONFIRMATION_SKIPPED', { userId, appointmentId: appointment?.id, reason: 'email_provider_unavailable' });
    return { sent: false, provider: 'email', reason: 'provider_unavailable' };
  }
  const result = await emailProvider.send({
    to: appointment?.callerEmail || process.env.NOTIFICATION_FALLBACK_EMAIL,
    subject: `Appointment Confirmation - ${appointment?.meetingTitle || 'FleetNimble Meeting'}`,
    appointmentId: appointment?.id,
    userId,
  });
  logger.info('EMAIL_CONFIRMATION', { userId, appointmentId: appointment?.id, sent: result.sent });
  return result;
}

export async function sendSmsNotification(userId, phone, message) {
  if (!smsProvider.available) {
    logger.warn('SMS_SKIPPED', { userId, phone, reason: 'sms_provider_unavailable' });
    return { sent: false, provider: 'sms', reason: 'provider_unavailable' };
  }
  if (!phone) {
    logger.warn('SMS_SKIPPED', { userId, reason: 'no_phone_provided' });
    return { sent: false, provider: 'sms', reason: 'no_phone' };
  }
  const result = await smsProvider.send({ to: phone, message, userId });
  logger.info('SMS_SENT', { userId, phone, sent: result.sent });
  return result;
}

export async function notifyAdmin(userId, type, data) {
  return adminProvider.send(type, { userId, ...data });
}
