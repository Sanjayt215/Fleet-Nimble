import twilio from 'twilio';
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
      // No SMTP transport library is installed, so email cannot actually be
      // delivered. Report unavailable instead of claiming a successful send.
      logger.warn('EMAIL_PROVIDER_TRANSPORT_UNAVAILABLE', {
        host: smtpHost,
        reason: 'No SMTP transport installed (nodemailer missing). Install nodemailer and set EMAIL_SMTP_* to enable email.',
      });
    } else {
      logger.warn('EMAIL_PROVIDER_UNAVAILABLE', { reason: 'EMAIL_SMTP_HOST not configured', fix: 'Set EMAIL_SMTP_HOST, EMAIL_SMTP_PORT, EMAIL_SMTP_USER, EMAIL_SMTP_PASS in environment' });
      logger.info('EMAIL_SKIPPED_SMTP_NOT_CONFIGURED', {
        reason: 'EMAIL_SMTP_HOST not set; confirmation emails will not be sent. Set EMAIL_SMTP_* to enable.',
      });
    }
  }

  async send(options) {
    logger.warn('EMAIL_SKIPPED_SMTP_NOT_CONFIGURED', {
      reason: 'email_transport_unavailable',
      recipientDomain: options?.to ? String(options.to).split('@')[1] : null,
    });
    return { sent: false, provider: this.name, reason: 'email_transport_unavailable' };
  }
}

class SmsProvider {
  constructor() {
    this.name = 'sms';
    this.available = false;
    this._from = null;
    this._client = null;
    this._init();
  }

  _init() {
    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioAuth = process.env.TWILIO_AUTH_TOKEN;
    const twilioPhone = process.env.TWILIO_PHONE_NUMBER;
    if (twilioSid && twilioAuth && twilioPhone) {
      this._client = twilio(twilioSid, twilioAuth);
      this._from = twilioPhone;
      this.available = true;
      logger.info('SMS_PROVIDER_AVAILABLE', { from: twilioPhone });
    } else {
      logger.warn('SMS_PROVIDER_UNAVAILABLE', { reason: 'TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_PHONE_NUMBER must all be configured' });
    }
  }

  async send(options) {
    if (!this.available || !this._client) {
      return { sent: false, provider: this.name, reason: 'provider_unavailable' };
    }
    try {
      const message = await this._client.messages.create({
        to: options.to,
        from: this._from,
        body: options.message,
      });
      logger.info('SMS_SENT', { to: options.to, sid: message.sid, status: message.status });
      return { sent: true, provider: this.name, sid: message.sid, status: message.status };
    } catch (err) {
      logger.error('SMS_SEND_FAILED', { to: options.to, error: err.message });
      return { sent: false, provider: this.name, reason: err.message };
    }
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
