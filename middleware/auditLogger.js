// middleware/auditLogger.js
// CJIS 5.4 - Auditing and Accountability
// STIG V-222529 - Application audit logging

/**
 * Structured audit logger for CJIS compliance.
 * Logs: timestamp, source IP, method, path, status code, user agent, response time.
 * Sensitive data (passwords, tokens, keys) is NEVER logged.
 */

const SENSITIVE_FIELDS = [
  'password', 'secretKey', 'apiKey', 'tradeSyncerApiKey',
  'tradovatePassword', 'tradovateClientId', 'tradovateSecretKey',
  'tradovateAccessToken',
  'authToken', 'access_token', 'accessToken', 'auth_token',
];

/**
 * Redact sensitive fields from an object for safe logging.
 * @param {Object} obj
 * @returns {Object} - Copy with sensitive values replaced by '[REDACTED]'
 */
function redactSensitive(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const redacted = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_FIELDS.includes(key)) {
      redacted[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      redacted[key] = redactSensitive(value);
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

/**
 * Formats a structured audit log entry (JSON).
 * CJIS requires: who, what, when, where, outcome.
 */
function formatAuditEntry(req, res, durationMs) {
  return {
    timestamp: new Date().toISOString(),
    level: res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARN' : 'INFO',
    event: 'HTTP_REQUEST',
    method: req.method,
    path: req.originalUrl || req.url,
    statusCode: res.statusCode,
    durationMs: durationMs,
    sourceIp: req.ip || req.connection?.remoteAddress || 'unknown',
    userAgent: req.get('User-Agent') || 'unknown',
    contentLength: res.get('Content-Length') || 0,
  };
}

/**
 * Express middleware that logs every request in structured JSON format.
 */
function auditLogger(req, res, next) {
  const startTime = Date.now();

  // Capture the original end function
  const originalEnd = res.end;
  res.end = function (...args) {
    const duration = Date.now() - startTime;
    const entry = formatAuditEntry(req, res, duration);

    // Use structured JSON logging
    if (entry.level === 'ERROR') {
      console.error(JSON.stringify(entry));
    } else if (entry.level === 'WARN') {
      console.warn(JSON.stringify(entry));
    } else {
      console.log(JSON.stringify(entry));
    }

    originalEnd.apply(res, args);
  };

  next();
}

/**
 * Log specific security events (auth attempts, data access, modifications).
 * Call this directly in route handlers for high-value events.
 */
function logSecurityEvent(eventType, details) {
  const entry = {
    timestamp: new Date().toISOString(),
    level: 'SECURITY',
    event: eventType,
    ...redactSensitive(details),
  };
  console.log(JSON.stringify(entry));
}

module.exports = { auditLogger, logSecurityEvent, redactSensitive };
