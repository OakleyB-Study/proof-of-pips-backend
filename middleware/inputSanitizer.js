// middleware/inputSanitizer.js
// STIG V-222609 - Input Validation
// CJIS 5.10.1 - Data Protection

/**
 * Input validation and sanitization utilities for STIG/CJIS compliance.
 * Prevents injection attacks, enforces data type constraints.
 */

// Twitter username: alphanumeric + underscores, 1-15 chars (Twitter's actual rules)
const TWITTER_USERNAME_REGEX = /^[A-Za-z0-9_]{1,15}$/;

// Alphanumeric with limited special chars for general text fields
const SAFE_TEXT_REGEX = /^[A-Za-z0-9\s\-_.@]{1,255}$/;

// Hex string validation (for tokens, encryption keys, etc.)
const HEX_REGEX = /^[0-9a-fA-F]+$/;

/**
 * Validate a Twitter username.
 * @param {string} username
 * @returns {{ valid: boolean, sanitized: string, error?: string }}
 */
function validateTwitterUsername(username) {
  if (!username || typeof username !== 'string') {
    return { valid: false, sanitized: '', error: 'Username is required' };
  }

  const cleaned = username.replace('@', '').trim();

  if (cleaned.length === 0) {
    return { valid: false, sanitized: '', error: 'Username cannot be empty' };
  }

  if (!TWITTER_USERNAME_REGEX.test(cleaned)) {
    return {
      valid: false,
      sanitized: '',
      error: 'Username must be 1-15 characters: letters, numbers, and underscores only',
    };
  }

  return { valid: true, sanitized: cleaned };
}

/**
 * Validate a connection type.
 * @param {string} type
 * @returns {boolean}
 */
function validateConnectionType(type) {
  return type === 'tradovate' || type === 'tradesyncer';
}

/**
 * Validate a hex token string.
 * @param {string} token
 * @param {number} expectedLength
 * @returns {boolean}
 */
function validateHexToken(token, expectedLength) {
  if (!token || typeof token !== 'string') return false;
  if (expectedLength && token.length !== expectedLength) return false;
  return HEX_REGEX.test(token);
}

/**
 * Sanitize a string by removing control characters and trimming.
 * @param {string} str
 * @returns {string}
 */
function sanitizeString(str) {
  if (!str || typeof str !== 'string') return '';
  // Remove control characters (except newline, tab) and trim
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
}

/**
 * Validate sort parameters to prevent injection via query strings.
 */
const ALLOWED_SORT_FIELDS = [
  'totalProfit', 'winRate', 'totalTrades', 'monthlyProfit',
  'verifiedPayouts', 'profitFactor', 'updatedAt',
];

function validateSortField(field) {
  return ALLOWED_SORT_FIELDS.includes(field);
}

module.exports = {
  validateTwitterUsername,
  validateConnectionType,
  validateHexToken,
  sanitizeString,
  validateSortField,
  TWITTER_USERNAME_REGEX,
};
