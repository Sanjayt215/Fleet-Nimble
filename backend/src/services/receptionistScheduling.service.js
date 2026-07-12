import logger from '../utils/logger.js';

const DAY_NAMES = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
const MONTH_NAMES = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const DEFAULT_TIMEZONE = 'Asia/Kolkata';

function resolveTimezone(text) {
  const tzMap = {
    'ist': 'Asia/Kolkata',
    'india': 'Asia/Kolkata',
    'indian': 'Asia/Kolkata',
    'et': 'America/New_York',
    'est': 'America/New_York',
    'eastern': 'America/New_York',
    'ct': 'America/Chicago',
    'cst': 'America/Chicago',
    'central': 'America/Chicago',
    'mt': 'America/Denver',
    'mst': 'America/Denver',
    'mountain': 'America/Denver',
    'pt': 'America/Los_Angeles',
    'pst': 'America/Los_Angeles',
    'pacific': 'America/Los_Angeles',
    'gmt': 'Europe/London',
    'uk': 'Europe/London',
    'cet': 'Europe/Berlin',
    'gst': 'Asia/Dubai',
    'uae': 'Asia/Dubai',
    'aest': 'Australia/Sydney',
    'sydney': 'Australia/Sydney',
  };
  const lower = text.toLowerCase();
  for (const [key, tz] of Object.entries(tzMap)) {
    if (lower.includes(key)) return tz;
  }
  return null;
}

function toLocalDateString(date) {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseRelativeDate(text) {
  const lower = text.toLowerCase().trim();
  const now = new Date();
  const today = now.getDay();

  // Detect ISO 8601 date strings (YYYY-MM-DD) and pass them through
  const isoMatch = lower.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) {
    return isoMatch[0];
  }

  if (lower.startsWith('today') || lower.includes('today')) return toLocalDateString(now);
  if (lower.includes('tomorrow') && !lower.includes('day after')) {
    const t = new Date(now);
    t.setDate(now.getDate() + 1);
    return toLocalDateString(t);
  }
  if (lower.includes('day after tomorrow') || lower.includes('overmorrow')) {
    const t = new Date(now);
    t.setDate(now.getDate() + 2);
    return toLocalDateString(t);
  }

  const dayMatch = lower.match(/(?:next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
  if (dayMatch) {
    const targetDay = DAY_NAMES[dayMatch[1].toLowerCase()];
    if (targetDay !== undefined) {
      let diff = targetDay - today;
      if (diff <= 0) diff += 7;
      if (dayMatch[0].toLowerCase().startsWith('next')) diff += 7;
      const t = new Date(now);
      t.setDate(now.getDate() + diff);
      return toLocalDateString(t);
    }
  }

  const monthDayMatch = lower.match(/(?:this\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i);
  if (monthDayMatch) {
    const monthKey = monthDayMatch[1].toLowerCase().substring(0, 3);
    const month = MONTH_NAMES[monthKey];
    if (month !== undefined) {
      const day = parseInt(monthDayMatch[2], 10);
      let year = now.getFullYear();
      const d = new Date(year, month, day);
      if (d < now) year++;
      return toLocalDateString(new Date(year, month, day));
    }
  }

  const numDateMatch = lower.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (numDateMatch) {
    const month = parseInt(numDateMatch[1], 10) - 1;
    const day = parseInt(numDateMatch[2], 10);
    let year = numDateMatch[3] ? parseInt(numDateMatch[3], 10) : now.getFullYear();
    if (year < 100) year += 2000;
    const d = new Date(year, month, day);
    if (d < now && !numDateMatch[3]) year++;
    return toLocalDateString(new Date(year, month, day));
  }

  return null;
}

function parseTime(text) {
  const lower = text.toLowerCase().trim();

  const explicitMatch = lower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (explicitMatch) {
    let hours = parseInt(explicitMatch[1], 10);
    const mins = explicitMatch[2] ? parseInt(explicitMatch[2], 10) : 0;
    if (explicitMatch[3].toLowerCase() === 'pm' && hours < 12) hours += 12;
    if (explicitMatch[3].toLowerCase() === 'am' && hours === 12) hours = 0;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }

  const hourOnlyMatch = lower.match(/(?:at\s+)?(\d{1,2})\s*(am|pm)/i);
  if (hourOnlyMatch) {
    let hours = parseInt(hourOnlyMatch[1], 10);
    const mins = 0;
    if (hourOnlyMatch[2].toLowerCase() === 'pm' && hours < 12) hours += 12;
    if (hourOnlyMatch[2].toLowerCase() === 'am' && hours === 12) hours = 0;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }

  const hour24Match = lower.match(/(\d{1,2}):(\d{2})\s*(hours?)?/);
  if (hour24Match) {
    const hours = parseInt(hour24Match[1], 10);
    const mins = parseInt(hour24Match[2], 10);
    if (hours >= 0 && hours <= 24 && mins >= 0 && mins <= 59) {
      return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    }
  }

  const nakedHourMatch = lower.match(/(?:at\s+)?(\d{1,2})(?![\d:])\s*(?:o'clock|o'?clock)?\s*$/i);
  if (nakedHourMatch) {
    let hours = parseInt(nakedHourMatch[1], 10);
    const mins = 0;
    if (hours >= 0 && hours <= 11) {
      if (hours >= 1 && hours <= 5) {
        hours += 12;
      } else if (hours === 0) {
        hours = 12;
      }
    }
    if (hours >= 24) hours = 12;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }

  if (lower.includes('morning')) return '09:00';
  if (lower.includes('afternoon')) return '14:00';
  if (lower.includes('evening')) return '17:00';
  if (lower.includes('night') || lower.includes('late')) return '19:00';
  if (lower.includes('noon') || lower.includes('midday')) return '12:00';
  if (lower.includes('midnight')) return '23:59';
  if (lower.includes('end of day') || lower.includes('eod')) return '17:00';
  if (lower.includes('start of day') || lower.includes('sod') || lower.includes('first thing')) return '08:00';

  return null;
}

export function parseDateTime(text, timezoneHint = null) {
  const lower = text.toLowerCase().trim();
  const resolvedTz = resolveTimezone(text) || timezoneHint || DEFAULT_TIMEZONE;

  const date = parseRelativeDate(text);
  const time = parseTime(text);

  let confidence = 0.5;
  let requiresClarification = false;

  if (date && time) {
    confidence = 0.9;
  } else if (date) {
    confidence = 0.6;
    requiresClarification = true;
  } else if (time) {
    confidence = 0.3;
    requiresClarification = true;
  }

  let scheduledDateTimeLocal = null;
  let scheduledDateTimeUtc = null;

  if (date && time) {
    try {
      const localDate = new Date(`${date}T${time}:00`);
      if (!isNaN(localDate.getTime())) {
        scheduledDateTimeLocal = localDate.toISOString();
        scheduledDateTimeUtc = localDate.toISOString();
        if (resolvedTz) {
          try {
            const utcDate = new Date(localDate.toLocaleString('en-US', { timeZone: resolvedTz }));
            scheduledDateTimeUtc = utcDate.toISOString();
          } catch {
            scheduledDateTimeUtc = localDate.toISOString();
          }
        }
      }
    } catch {
      requiresClarification = true;
      confidence = 0.1;
    }
  }

  if (scheduledDateTimeLocal) {
    const now = new Date();
    const parsedDate = new Date(scheduledDateTimeLocal);
    if (parsedDate < now) {
      confidence = Math.max(confidence - 0.3, 0.1);
      requiresClarification = true;
    }
  }

  return {
    originalText: text,
    scheduledDateTimeUtc,
    scheduledDateTimeLocal,
    timezone: resolvedTz,
    preferredDate: date,
    preferredTime: time,
    confidence,
    requiresClarification,
  };
}

export function formatSchedulingSummary(parsed, callerName) {
  if (!parsed) return null;
  const dateStr = parsed.preferredDate ? new Date(parsed.preferredDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'to be confirmed';
  const timeStr = parsed.preferredTime || 'to be confirmed';
  const tzStr = parsed.timezone || DEFAULT_TIMEZONE;
  const displayName = parsed.timezone ? `${tzStr}` : 'your local time';
  return `You requested ${dateStr} at ${timeStr} ${displayName}. Is that correct?`;
}

export function resolveSchedulingText(details, parsed) {
  const date = details.preferredDate || parsed?.preferredDate || 'the requested date';
  const time = details.preferredTime || parsed?.preferredTime || 'the requested time';
  const tz = details.timezone || parsed?.timezone || DEFAULT_TIMEZONE;

  let dateStr = date;
  try {
    const d = new Date(date + 'T12:00:00');
    if (!isNaN(d.getTime())) {
      dateStr = d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    }
  } catch {}

  let timeStr = time;
  try {
    const parts = time.split(':');
    if (parts.length === 2) {
      const h = parseInt(parts[0], 10);
      const m = parts[1];
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      timeStr = `${h12}:${m} ${ampm}`;
    }
  } catch {}

  return { resolvedDate: dateStr, resolvedTime: timeStr, timezone: tz };
}

export function assembleSchedulingPayload(collectedData, parsed) {
  const date = parsed?.preferredDate || collectedData.preferredDate;
  const time = parsed?.preferredTime || collectedData.preferredTime || '10:00';
  if (!date) {
    return { scheduledDate: new Date(Date.now() + 86400000).toISOString(), dateSource: 'default' };
  }
  try {
    const dt = new Date(`${date}T${time}:00`);
    if (!isNaN(dt.getTime())) {
      return { scheduledDate: dt.toISOString(), dateSource: 'parsed' };
    }
  } catch {}
  return { scheduledDate: new Date(Date.now() + 86400000).toISOString(), dateSource: 'fallback' };
}

export { resolveTimezone, parseRelativeDate, parseTime };
