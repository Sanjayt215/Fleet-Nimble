import { INTENTS } from './protocol.js';

const EMERGENCY_PATTERNS = [
  /emergency/i, /\baccent\b/i, /\bcrash\b/i, /\baccident\b/i, /\b(vehicle|truck|fleet)\s+down\b/i,
  /\bstolen\b/i, /\bfire\b/i, /\bbroken\s+down\b/i, /\bstranded\b/i, /\b(immediate|urgent)\s+(help|assistance)\b/i,
];

const SCHEDULE_PATTERNS = [
  /book\s+(a\s+)?(demo|meeting|call|appointment|walkthrough|session)/i,
  /schedule\s+(a\s+)?(demo|meeting|call|appointment|walkthrough|session)/i,
  /set\s+up\s+(a\s+)?(demo|meeting|call|appointment)/i,
  /want\s+(a\s+)?(demo|meeting|call|appointment)/i,
  /need\s+(a\s+)?(demo|meeting|call|appointment)/i,
  /\bwhen\s+(can|are)\s+you\s+available\b/i,
  /\b(available|free)\s+on\s+/i,
  /\btomorrow\b.*\b(book|schedule|meet)\b/i,
];

const SUPPORT_PATTERNS = [
  /\b(ticket|support|help desk|customer care|complaint|refund)\b/i,
  /\b(i\s+have|there\s+is|there\s+are|getting|facing|experiencing)\s+(a\s+)?(problem|issue|bug|error|trouble)\b/i,
  /\bnot\s+working\b/i,
  /\b(is|are)\s+not\s+(working|loading|responding|connecting)\b/i,
  /\b(login|billing|invoice|subscription)\s+(problem|issue|error|trouble)\b/i,
];

const TECHNICAL_PATTERNS = [
  /\b(install|setup|configur|connect|pair|sync|update|upgrade|uninstall|restart|reset)\b/i,
  /\b(error|bug|crash|glitch|fail|broken|not\s+working|won'?t\s+(start|connect|load|work))\b/i,
  /\b(is|are|it'?s)\s+not\s+(loading|responding|connecting|starting|working)\b/i,
  /\b(dtc|obd|code|fault|check\s+engine|diagnostic)\b/i,
];

const PRICING_PATTERNS = [
  /\b(price|pricing|cost|rate|plan|package|subscription|quote|how\s+much|charges?|fee|billing)\b/i,
];

const FLEET_PATTERNS = [
  /\b(gps|tracking|telematics|maintenance|fuel|diagnostics|drivers?|vehicles?|fleet|dashcam|alerts?|reports?|compliance)\b/i,
];

const SALES_PATTERNS = [
  /\b(demo|purchase|buying|trial|upgrade|discount|proposal|roi|features?|compared?|competitor)\b/i,
];

const GREETING_PATTERNS = [
  /^(hi|hello|hey|good\s*(morning|afternoon|evening)|greetings|yo|namaste|hola)[\s,.!?]*$/i,
  /^hello\b/i,
  /^hi\b/i,
];

const PRODUCT_PATTERNS = [
  /\b(what\s+is|what\s+are|how\s+does|does\s+it|can\s+it|does\s+fleetnimble|tell\s+me\s+about)\b/i,
];

function matchesAny(text, patterns) {
  return patterns.some(pattern => pattern.test(text));
}

export function classifyIntent(text) {
  const message = String(text || '').trim();
  if (!message) return { intent: INTENTS.UNKNOWN, confidence: 0 };

  const scores = {};

  const emergency = matchesAny(message, EMERGENCY_PATTERNS);
  if (emergency) scores[INTENTS.EMERGENCY] = (scores[INTENTS.EMERGENCY] || 0) + 0.98;

  const scheduling = matchesAny(message, SCHEDULE_PATTERNS);
  if (scheduling) scores[INTENTS.SCHEDULE_MEETING] = (scores[INTENTS.SCHEDULE_MEETING] || 0) + 0.95;

  const support = matchesAny(message, SUPPORT_PATTERNS);
  if (support) scores[INTENTS.SUPPORT_REQUEST] = (scores[INTENTS.SUPPORT_REQUEST] || 0) + 0.9;

  const technical = matchesAny(message, TECHNICAL_PATTERNS);
  if (technical) scores[INTENTS.TECHNICAL_ISSUE] = (scores[INTENTS.TECHNICAL_ISSUE] || 0) + 0.85;

  const pricing = matchesAny(message, PRICING_PATTERNS);
  if (pricing) scores[INTENTS.PRICING_QUESTION] = (scores[INTENTS.PRICING_QUESTION] || 0) + 0.85;

  const fleet = matchesAny(message, FLEET_PATTERNS);
  if (fleet) scores[INTENTS.FLEET_QUESTION] = (scores[INTENTS.FLEET_QUESTION] || 0) + 0.6;

  const product = matchesAny(message, PRODUCT_PATTERNS);
  if (product) scores[INTENTS.PRODUCT_QUESTION] = (scores[INTENTS.PRODUCT_QUESTION] || 0) + 0.55;

  const sales = matchesAny(message, SALES_PATTERNS);
  if (sales) scores[INTENTS.SALES_INTEREST] = (scores[INTENTS.SALES_INTEREST] || 0) + 0.7;

  const greeting = GREETING_PATTERNS.some(pattern => pattern.test(message));
  if (greeting) scores[INTENTS.GREETING] = 0.99;

  if (Object.keys(scores).length === 0) {
    if (message.endsWith('?')) {
      return { intent: INTENTS.GENERAL_QUESTION, confidence: 0.5 };
    }
    return { intent: INTENTS.UNKNOWN, confidence: 0.2 };
  }

  const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [intent, confidence] = entries[0];

  return {
    intent,
    confidence: Math.min(1, confidence),
    alternatives: entries.slice(1).map(([altIntent, altConfidence]) => ({ intent: altIntent, confidence: altConfidence })),
    matched: Object.keys(scores).length > 1,
  };
}

export function isActionableIntent(intent) {
  return [
    INTENTS.SCHEDULE_MEETING,
    INTENTS.SUPPORT_REQUEST,
    INTENTS.TECHNICAL_ISSUE,
    INTENTS.PRICING_QUESTION,
    INTENTS.SALES_INTEREST,
  ].includes(intent);
}
