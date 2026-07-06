import logger from '../utils/logger.js';

const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous/i,
  /ignore\s+(all\s+)?(instructions|commands|directives)/i,
  /you\s+are\s+(not\s+)?(an?\s+)?(ai|bot|assistant)/i,
  /system\s+(prompt|instruction|message)/i,
  /forget\s+(all\s+)?(previous|instructions)/i,
  /disregard\s+(all\s+)?(previous|instructions)/i,
  /you\s+must\s+(obey|follow)\s+only/i,
  /new\s+(instructions|prompt|directive)/i,
  /act\s+as\s+(if\s+you\s+are|an?\s+)?/i,
  /do\s+(not\s+)?follow\s+(your\s+)?(rules|guidelines)/i,
  /you\s+are\s+required\s+to\s+ignore/i,
  /override\s+(mode|system|instructions)/i,
  /simulate\s+(mode|bypass|override)/i,
  /pretend\s+(you\s+are|to\s+be)/i,
  /\[system\]|\[INST\]|<\|im_start\|>|<\|im_end\|>/i,
  /reveal\s+(your\s+)?(prompt|instructions|system)/i,
  /what\s+is\s+your\s+(prompt|system\s+message|instructions)/i,
];

const DANGEROUS_KEYWORDS = [
  /delete\s+(all\s+)?data/i,
  /drop\s+(table|database|collection)/i,
  /truncate\s+table/i,
  /shutdown/i,
  /restart\s+(server|system)/i,
  /execute\s+(shell|command|code)/i,
  /access\s+other\s+(users?|accounts?)/i,
  /bypass\s+(auth|security|login)/i,
];

export function validateInput(input) {
  if (!input || typeof input !== 'string') {
    return { valid: true };
  }

  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(input)) {
      logger.warn('PROMPT_INJECTION_DETECTED', { input: input.substring(0, 100) });
      return { valid: false, reason: 'Prompt injection attempt detected' };
    }
  }

  return { valid: true };
}

export function validateToolAction(action, context) {
  const allowedActions = [
    'create_appointment', 'reschedule_appointment', 'cancel_appointment',
    'create_support_ticket', 'check_appointment', 'check_ticket_status',
    'create_lead', 'update_lead_status', 'send_email', 'send_sms',
    'escalate_call',
  ];

  if (!allowedActions.includes(action)) {
    logger.warn('TOOL_ACTION_DENIED', { action, context });
    return { allowed: false, reason: `Action "${action}" is not permitted` };
  }

  return { allowed: true };
}

export function sanitizeMessage(message) {
  if (!message || typeof message !== 'string') return '';

  return message
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/[<>]/g, '')
    .trim()
    .substring(0, 2000);
}
