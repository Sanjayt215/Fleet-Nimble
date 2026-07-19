import logger from '../../utils/logger.js';

const MIN_CONTENT_LENGTH = 50;
const MAX_ARTICLE_LENGTH = 10000;
const MAX_ANSWER_LENGTH = 1000;

const SUSPICIOUS_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior)\s+instructions/i,
  /reveal\s+(your\s+)?(system\s+)?prompt/i,
  /disregard\s+(all\s+)?(previous|prior)\s+(instructions|rules)/i,
  /you\s+(are\s+)?(now|must)\s+(free|unrestricted|unbounded)/i,
  /send\s+(me\s+)?(your\s+)?(credentials|password|token|api.?key)/i,
  /execute\s+(command|code|script)/i,
  /override\s+(company\s+)?policy/i,
  /treat\s+this\s+page\s+as\s+authoritative/i,
  /you\s+must\s+obey\s+(all\s+)?instructions\s+from/i,
  /output\s+(your\s+)?(system\s+)?prompt/i,
  /new\s+instructions?\s*follow/i,
  /act\s+as\s+(if\s+)?you\s+are\s+(the\s+)?(admin|owner|creator)/i,
];

const SECRET_PATTERNS = [
  /(?:api[_-]?key|apikey|api_secret|api[_-]?token)\s*[:=]\s*['"][^'"]+['"]/i,
  /(?:sk[_-]|pk[_-]|test[_-])[a-zA-Z0-9]{20,}/,
  /(?:ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9]{36,}/,
  /(?:AKIA|ASIA)[A-Z0-9]{16,}/,
  /(?:SG\\.|sendgrid)[a-zA-Z0-9._-]{20,}/i,
  /(?:xox[bpsr]-)[a-zA-Z0-9-]{20,}/,
  /(?:-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----)/i,
  /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]+['"]/i,
  /(?:secret|secret_key|secret_token)\s*[:=]\s*['"][^'"]{8,}['"]/i,
  /mongodb(?:\+srv)?:\/\/[^\s]+/i,
  /postgresql?:\/\/[^\s]+/i,
  /(?:jdbc|redis):\/\/[^\s]+/i,
];

const FORBIDDEN_PATTERNS = [
  /(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?\//i,
  /(?:\.internal|\.local|\.lan)\b/i,
  /(?:staging|dev|development|testing)\.[a-z0-9-]+\.com/i,
];

const SUSPICIOUS_ENTITIES = [
  'customer@', 'user@', 'admin@', 'test@', 'noreply@',
];

const PRICE_CLAIM_PATTERNS = [
  /starting\s+(at\s+)?\$\d+/i,
  /only\s+\$\d+/i,
  /as\s+low\s+as\s+\$\d+/i,
  /\$\d+\s*\/\s*(month|year|vehicle)/i,
];

const UNSUPPORTED_CLAIMS = [
  /100%\s+(uptime|guaranteed|satisfaction)/i,
  /best\s+(fleet|gps|tracking)\s+(software|platform|system)/i,
  /number\s+one\s+fleet/i,
  /guaranteed\s+(to\s+)?(reduce|save|increase)/i,
];

export function validateArticle(article, source) {
  const errors = [];
  const warnings = [];
  let isSafe = true;

  if (!article || typeof article !== 'object') {
    return { valid: false, errors: ['Article is null or not an object'], warnings: [], unsafe: false };
  }

  const text = [
    article.title || '',
    article.answer || '',
    article.details || '',
    ...(article.keywords || []),
  ].join(' ');

  // Length checks
  if (!article.title || article.title.trim().length < 3) {
    errors.push('Title is too short or missing');
  }

  if (!article.answer || article.answer.trim().length < MIN_CONTENT_LENGTH) {
    errors.push(`Answer too short (min ${MIN_CONTENT_LENGTH} chars)`);
  }

  if (article.answer && article.answer.length > MAX_ANSWER_LENGTH) {
    errors.push(`Answer exceeds max length (${MAX_ANSWER_LENGTH} chars)`);
  }

  const totalLength = (article.answer || '').length + (article.details || '').length;
  if (totalLength > MAX_ARTICLE_LENGTH) {
    errors.push(`Total content exceeds max length (${MAX_ARTICLE_LENGTH} chars)`);
  }

  // Category validation
  const validCategories = ['Company', 'Fleet Management', 'GPS Tracking', 'Live Diagnostics', 'OBD Devices', 'Digital Twin', 'Maintenance', 'Fuel Analytics', 'Driver Management', 'Alerts', 'Reports', 'CRM', 'AI Assistant', 'AI Receptionist', 'Pricing', 'Demo Booking', 'Support', 'Integrations', 'Security', 'Deployment', 'FAQs', 'Web', 'Help Center', 'Documentation'];
  if (!validCategories.includes(article.category)) {
    warnings.push(`Unknown category: ${article.category}`);
  }

  // Mode validation
  if (!['both', 'sales', 'support'].includes(article.mode)) {
    errors.push(`Invalid mode: ${article.mode}`);
  }

  // Priority validation
  if (typeof article.priority !== 'number' || article.priority < 1 || article.priority > 10) {
    errors.push(`Invalid priority: ${article.priority} (must be 1-10)`);
  }

  // Prompt injection detection
  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(text)) {
      isSafe = false;
      errors.push(`Suspicious instruction pattern detected: ${pattern}`);
    }
  }

  // Secret detection
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(text)) {
      isSafe = false;
      errors.push(`Potential secret/credential detected`);
    }
  }

  // Forbidden entities
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(text)) {
      errors.push(`Contains forbidden reference to internal system`);
    }
  }

  // Suspicious email addresses
  for (const entity of SUSPICIOUS_ENTITIES) {
    if (text.includes(entity)) {
      warnings.push(`Contains suspicious email reference`);
    }
  }

  // Price claim detection
  for (const pattern of PRICE_CLAIM_PATTERNS) {
    if (pattern.test(text)) {
      warnings.push(`Contains price claim that may not be current: ${text.match(pattern)?.[0]}`);
    }
  }

  // Unsupported claims
  for (const pattern of UNSUPPORTED_CLAIMS) {
    if (pattern.test(text)) {
      warnings.push(`Contains unsupported marketing claim: ${text.match(pattern)?.[0]}`);
    }
  }

  // Placeholder detection
  if (/lorem\s+ipsum/i.test(text)) {
    errors.push('Contains placeholder text (lorem ipsum)');
  }

  // HTML injection
  if (/<script\b/i.test(text)) {
    isSafe = false;
    errors.push('Contains script tags');
  }

  if (/<iframe\b/i.test(text)) {
    isSafe = false;
    errors.push('Contains iframe tags');
  }

  if (/on\w+\s*=\s*"/i.test(text)) {
    isSafe = false;
    errors.push('Contains inline event handlers');
  }

  // Source validation
  if (article.sourceUrl && article.sourceUrl.startsWith('http://')) {
    warnings.push('Source URL uses HTTP instead of HTTPS');
  }

  return {
    valid: errors.length === 0,
    safe: isSafe,
    errors: errors.length > 0 ? errors : undefined,
    warnings: warnings.length > 0 ? warnings : undefined,
    errorCount: errors.length,
    warningCount: warnings.length,
  };
}

export function validateSourceUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return { valid: false, error: 'Only HTTP(S) URLs are supported' };
    }
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '0.0.0.0') {
      return { valid: false, error: 'Localhost URLs are not allowed' };
    }
    if (parsed.hostname.startsWith('10.') || parsed.hostname.startsWith('192.168.') || /^172\.(1[6-9]|2\d|3[01])\./.test(parsed.hostname)) {
      return { valid: false, error: 'Private IP URLs are not allowed' };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}
