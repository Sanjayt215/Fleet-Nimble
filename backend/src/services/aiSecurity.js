/**
 * AI Security Service
 * Provides prompt injection protection and security measures for AI interactions
 */

import logger from '../utils/logger.js';

/**
 * Known prompt injection patterns
 */
const INJECTION_PATTERNS = [
  // System prompt overrides
  /ignore (all )?(previous )?(instructions|commands)/i,
  /forget (all )?(previous )?(instructions|commands)/i,
  /disregard (all )?(previous )?(instructions|commands)/i,
  /override (system )?prompt/i,
  /bypass (system )?prompt/i,
  /new (system )?prompt/i,
  /change (system )?prompt/i,
  /replace (system )?prompt/i,
  
  // Role manipulation
  /you are now/i,
  /act as/i,
  /pretend to be/i,
  /roleplay as/i,
  /simulate being/i,
  
  // Data extraction attempts
  /show (me )?(your )?(system )?prompt/i,
  /print (your )?(system )?prompt/i,
  /display (your )?(system )?prompt/i,
  /reveal (your )?(system )?prompt/i,
  /what (is )?your (system )?prompt/i,
  /dump (your )?(system )?prompt/i,
  /output (your )?(system )?prompt/i,
  
  // Instruction leakage
  /repeat (all )?(your )?instructions/i,
  /echo (your )?instructions/i,
  /return (your )?instructions/i,
  /list (your )?instructions/i,
  
  // Jailbreak attempts
  /jailbreak/i,
  /dan/i,
  /developer mode/i,
  /unrestricted mode/i,
  /admin mode/i,
  /god mode/i,
  
  // Token manipulation
  /ignore token/i,
  /bypass token/i,
  /skip token/i,
  
  // Context manipulation
  /clear context/i,
  /reset context/i,
  /new context/i,
  
  // Encoding attempts
  /base64/i,
  /hex/i,
  /unicode/i,
  /rot13/i,
  
  // Code execution attempts
  /execute code/i,
  /run code/i,
  /eval/i,
  /exec/i,
];

/**
 * Suspicious keywords that may indicate injection
 */
const SUSPICIOUS_KEYWORDS = [
  'prompt',
  'instruction',
  'command',
  'override',
  'bypass',
  'ignore',
  'forget',
  'disregard',
  'system',
  'admin',
  'developer',
  'token',
  'secret',
  'password',
  'api_key',
  'apikey',
  'credential',
];

/**
 * Check for prompt injection
 */
export function checkPromptInjection(message) {
  const lowerMessage = message.toLowerCase();
  const detectedPatterns = [];
  const detectedKeywords = [];

  // Check for injection patterns
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(message)) {
      detectedPatterns.push(pattern.source);
    }
  }

  // Check for suspicious keywords
  for (const keyword of SUSPICIOUS_KEYWORDS) {
    if (lowerMessage.includes(keyword)) {
      detectedKeywords.push(keyword);
    }
  }

  // Calculate risk score
  const patternScore = detectedPatterns.length * 10;
  const keywordScore = detectedKeywords.length * 2;
  const totalScore = patternScore + keywordScore;

  let riskLevel = 'LOW';
  if (totalScore >= 30) riskLevel = 'CRITICAL';
  else if (totalScore >= 20) riskLevel = 'HIGH';
  else if (totalScore >= 10) riskLevel = 'MEDIUM';

  const isInjection = totalScore >= 10;

  if (isInjection) {
    logger.warn('Potential prompt injection detected', {
      message: message.substring(0, 100),
      riskLevel,
      detectedPatterns,
      detectedKeywords,
      score: totalScore,
    });
  }

  return {
    isInjection,
    riskLevel,
    score: totalScore,
    detectedPatterns,
    detectedKeywords,
    shouldBlock: riskLevel === 'CRITICAL',
  };
}

/**
 * Sanitize user message
 */
export function sanitizeMessage(message) {
  let sanitized = message;

  // Remove potentially harmful patterns
  for (const pattern of INJECTION_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }

  return sanitized;
}

/**
 * Validate message length
 */
export function validateMessageLength(message, maxLength = 5000) {
  if (message.length > maxLength) {
    return {
      valid: false,
      reason: `Message exceeds maximum length of ${maxLength} characters`,
      actualLength: message.length,
      maxLength,
    };
  }

  return {
    valid: true,
    length: message.length,
  };
}

/**
 * Check for rate limit abuse
 */
export function checkRateLimitAbuse(userId, requestCount, timeWindowMinutes, maxRequests) {
  const requestsPerMinute = requestCount / timeWindowMinutes;
  const isAbuse = requestsPerMinute > maxRequests / timeWindowMinutes;

  if (isAbuse) {
    logger.warn('Rate limit abuse detected', {
      userId,
      requestCount,
      timeWindowMinutes,
      maxRequests,
      requestsPerMinute,
    });
  }

  return {
    isAbuse,
    requestsPerMinute: requestsPerMinute.toFixed(2),
    maxAllowed: maxRequests,
  };
}

/**
 * Check for suspicious activity patterns
 */
export function checkSuspiciousActivity(userId, recentRequests) {
  const suspiciousPatterns = [];

  // Check for rapid successive requests
  if (recentRequests.length > 10) {
    const timeSpan = recentRequests[recentRequests.length - 1].timestamp - recentRequests[0].timestamp;
    const requestsPerSecond = recentRequests.length / (timeSpan / 1000);
    
    if (requestsPerSecond > 5) {
      suspiciousPatterns.push('Rapid request rate');
    }
  }

  // Check for repetitive messages
  if (recentRequests.length >= 3) {
    const lastThree = recentRequests.slice(-3);
    const messages = lastThree.map(r => r.message);
    
    if (messages[0] === messages[1] && messages[1] === messages[2]) {
      suspiciousPatterns.push('Repetitive messages');
    }
  }

  // Check for message length anomalies
  const avgLength = recentRequests.reduce((sum, r) => sum + r.message.length, 0) / recentRequests.length;
  const maxLength = Math.max(...recentRequests.map(r => r.message.length));
  
  if (maxLength > avgLength * 5) {
    suspiciousPatterns.push('Unusual message length');
  }

  const isSuspicious = suspiciousPatterns.length > 0;

  if (isSuspicious) {
    logger.warn('Suspicious activity detected', {
      userId,
      suspiciousPatterns,
      recentRequestCount: recentRequests.length,
    });
  }

  return {
    isSuspicious,
    suspiciousPatterns,
  };
}

/**
 * Generate security report
 */
export function generateSecurityReport(securityChecks) {
  const {
    injectionCheck,
    lengthCheck,
    rateLimitCheck,
    activityCheck,
  } = securityChecks;

  const overallRisk = calculateOverallRisk([
    injectionCheck.riskLevel,
    rateLimitCheck.isAbuse ? 'HIGH' : 'LOW',
    activityCheck.isSuspicious ? 'MEDIUM' : 'LOW',
  ]);

  return {
    overallRisk,
    checks: {
      promptInjection: {
        detected: injectionCheck.isInjection,
        riskLevel: injectionCheck.riskLevel,
        score: injectionCheck.score,
      },
      messageLength: {
        valid: lengthCheck.valid,
        length: lengthCheck.length,
      },
      rateLimit: {
        isAbuse: rateLimitCheck.isAbuse,
        requestsPerMinute: rateLimitCheck.requestsPerMinute,
      },
      suspiciousActivity: {
        isSuspicious: activityCheck.isSuspicious,
        patterns: activityCheck.suspiciousPatterns,
      },
    },
    recommendation: getSecurityRecommendation(overallRisk),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Calculate overall risk level
 */
function calculateOverallRisk(riskLevels) {
  const riskScores = {
    CRITICAL: 4,
    HIGH: 3,
    MEDIUM: 2,
    LOW: 1,
  };

  const maxScore = Math.max(...riskLevels.map(level => riskScores[level] || 1));

  if (maxScore >= 4) return 'CRITICAL';
  if (maxScore >= 3) return 'HIGH';
  if (maxScore >= 2) return 'MEDIUM';
  return 'LOW';
}

/**
 * Get security recommendation
 */
function getSecurityRecommendation(riskLevel) {
  switch (riskLevel) {
    case 'CRITICAL':
      return 'Block request immediately and investigate user account';
    case 'HIGH':
      return 'Review request carefully, consider blocking';
    case 'MEDIUM':
      return 'Monitor user activity, proceed with caution';
    case 'LOW':
      return 'Request appears safe, proceed normally';
    default:
      return 'Unable to determine risk level';
  }
}

/**
 * Log security event
 */
export function logSecurityEvent(userId, eventType, details) {
  logger.warn('Security event logged', {
    userId,
    eventType,
    details,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Check if user is authorized for AI access
 */
export function checkAIAuthorization(userRole) {
  const authorizedRoles = ['ADMIN', 'MANAGER', 'TECHNICIAN', 'DRIVER', 'VIEWER'];
  
  return authorizedRoles.includes(userRole);
}

/**
 * Validate AI provider configuration
 */
export function validateAIProviderConfig(provider, model, apiKey) {
  const errors = [];

  if (!provider) {
    errors.push('AI provider is not configured');
  }

  if (!model) {
    errors.push('AI model is not configured');
  }

  if (!apiKey && provider !== 'local') {
    errors.push('API key is missing for configured provider');
  }

  const isValid = errors.length === 0;

  return {
    isValid,
    errors,
    provider,
    model,
  };
}

/**
 * Get security headers for AI responses
 */
export function getSecurityHeaders() {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Content-Security-Policy': "default-src 'self'",
  };
}

/**
 * Encrypt sensitive data in logs
 */
export function encryptSensitiveData(data) {
  // In production, use proper encryption
  // For now, redact common sensitive patterns
  const sensitivePatterns = [
    { pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, replacement: '[REDACTED_CREDIT_CARD]' },
    { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: '[REDACTED_EMAIL]' },
    { pattern: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g, replacement: '[REDACTED_PHONE]' },
    { pattern: /\b(sk_|pk_|api_key_|secret_|token_)[a-zA-Z0-9_]{20,}\b/gi, replacement: '[REDACTED_API_KEY]' },
  ];

  let encrypted = data;

  for (const { pattern, replacement } of sensitivePatterns) {
    encrypted = encrypted.replace(pattern, replacement);
  }

  return encrypted;
}
