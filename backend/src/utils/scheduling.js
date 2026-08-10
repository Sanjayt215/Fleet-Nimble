import logger from './logger.js';

const SUPPORTED_FALLBACK_OFFSETS_MS = {
  'America/New_York': -5 * 3600000,
  'America/Chicago': -6 * 3600000,
  'America/Denver': -7 * 3600000,
  'America/Los_Angeles': -8 * 3600000,
  'Europe/London': 0,
  'Europe/Paris': 1 * 3600000,
  'Asia/Kolkata': 5.5 * 3600000,
  'Asia/Tokyo': 9 * 3600000,
  'Asia/Shanghai': 8 * 3600000,
  'Australia/Sydney': 11 * 3600000,
  'UTC': 0,
};

export function normalizePhone(value) {
  if (value == null) return null;
  const normalized = String(value).trim().replace(/[^\d+]/g, '');
  return normalized || null;
}

export function normalizeEmail(value) {
  if (value == null) return null;
  const normalized = String(value).trim().toLowerCase();
  return normalized || null;
}

export function normalizeInteger(value) {
  if (value == null) return null;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) return null;
  return parsed;
}

export function getTimezoneOffsetMs(date, timeZone) {
  if (!timeZone || timeZone === 'UTC') return 0;
  try {
    const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
    const tzDate = new Date(date.toLocaleString('en-US', { timeZone }));
    return tzDate.getTime() - utcDate.getTime();
  } catch (err) {
    const fallback = SUPPORTED_FALLBACK_OFFSETS_MS[timeZone];
    if (fallback !== undefined) return fallback;
    logger.warn('TIMEZONE_UNKNOWN', { timeZone, error: err.message });
    return 0;
  }
}

export function parseWallClock(dateStr, timeStr) {
  if (!dateStr) return null;
  const match = String(dateStr).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10) - 1;
  const day = parseInt(match[3], 10);

  let hours = 0;
  let minutes = 0;
  if (timeStr) {
    const t = String(timeStr).match(/^(\d{1,2})(?::(\d{2}))?/);
    if (t) {
      hours = parseInt(t[1], 10);
      minutes = t[2] ? parseInt(t[2], 10) : 0;
    }
  }

  const utc = new Date(Date.UTC(year, month, day, hours, minutes, 0, 0));
  if (isNaN(utc.getTime())) return null;
  return utc;
}

export function wallClockToUtc({ preferredDate, preferredTime, timezone }) {
  const naive = parseWallClock(preferredDate, preferredTime);
  if (!naive) return null;
  const tz = timezone || 'UTC';
  const offsetMs = getTimezoneOffsetMs(naive, tz);
  return new Date(naive.getTime() - offsetMs);
}

export function normalizeSchedulingArgs(args = {}) {
  const callerName = typeof args.callerName === 'string' && args.callerName.trim() ? args.callerName.trim() : null;
  const company = typeof args.companyName === 'string' && args.companyName.trim() ? args.companyName.trim() : null;
  const phone = normalizePhone(args.phone);
  const email = normalizeEmail(args.email);
  const industry = typeof args.industry === 'string' && args.industry.trim() ? args.industry.trim() : null;
  const fleetSize = normalizeInteger(args.fleetSize);
  const meetingPurpose = typeof args.meetingPurpose === 'string' && args.meetingPurpose.trim() ? args.meetingPurpose.trim() : null;
  const timezone = typeof args.timezone === 'string' && args.timezone.trim() ? args.timezone.trim() : null;
  const durationMinutes = normalizeInteger(args.durationMinutes) || 30;

  let scheduledDateTime = null;
  let preferredDate = null;
  let preferredTime = null;

  if (args.scheduledDateTime) {
    const parsed = new Date(args.scheduledDateTime);
    if (!isNaN(parsed.getTime())) {
      scheduledDateTime = parsed;
    }
  }

  if (args.preferredDate || args.preferredTime) {
    const parsedDate = parseWallClock(args.preferredDate, args.preferredTime);
    if (parsedDate) {
      preferredDate = String(args.preferredDate).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)?.[0] || args.preferredDate;
      const t = String(args.preferredTime || '').match(/^(\d{1,2})(?::(\d{2}))?/);
      preferredTime = t ? `${String(parseInt(t[1], 10)).padStart(2, '0')}:${String(t[2] ? parseInt(t[2], 10) : 0).padStart(2, '0')}` : null;
    }
  }

  return {
    callerName,
    company,
    phone,
    email,
    industry,
    fleetSize,
    meetingPurpose,
    timezone,
    durationMinutes,
    scheduledDateTime,
    preferredDate,
    preferredTime,
  };
}

export function resolveScheduledDate(collectedData = {}) {
  const raw = collectedData.scheduledDateTime;
  if (raw) {
    const parsed = raw instanceof Date ? raw : new Date(raw);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  const { preferredDate, preferredTime, timezone } = collectedData;
  const utc = wallClockToUtc({ preferredDate, preferredTime, timezone });
  if (utc) return utc;
  return null;
}

export function missingBookingFields(collectedData = {}) {
  const missing = [];
  if (!collectedData.callerName) missing.push('callerName');
  if (!collectedData.meetingPurpose) missing.push('meetingPurpose');
  const hasDateTime = Boolean(
    collectedData.scheduledDateTime
    || (collectedData.preferredDate && collectedData.preferredTime)
  );
  if (!hasDateTime) missing.push('scheduledDateTime');
  return missing;
}

export function toSafeBookingLog(data = {}) {
  const allowed = [
    'callerName', 'company', 'companyName', 'fleetSize', 'industry',
    'meetingPurpose', 'timezone', 'preferredDate', 'preferredTime',
    'durationMinutes', 'scheduledDateTime', 'currentStage', 'appointmentCreated',
  ];
  const out = {};
  for (const key of allowed) {
    if (data[key] !== undefined && data[key] !== null) out[key] = data[key];
  }
  if (data.phone) out.phone = String(data.phone).replace(/\d/g, '*');
  if (data.email) {
    const m = String(data.email).match(/^(.)(.*)@(.*)$/);
    out.email = m ? `${m[1]}***@${m[3]}` : '***';
  }
  return out;
}
