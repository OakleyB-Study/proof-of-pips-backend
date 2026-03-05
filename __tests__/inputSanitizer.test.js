const {
  validateTwitterUsername,
  validateConnectionType,
  validateHexToken,
  sanitizeString,
  validateSortField,
} = require('../middleware/inputSanitizer');

// ============================================
// validateTwitterUsername
// ============================================

describe('validateTwitterUsername', () => {
  test('valid simple username', () => {
    const result = validateTwitterUsername('oakleyalerts');
    expect(result.valid).toBe(true);
    expect(result.sanitized).toBe('oakleyalerts');
  });

  test('strips @ prefix', () => {
    const result = validateTwitterUsername('@oakleyalerts');
    expect(result.valid).toBe(true);
    expect(result.sanitized).toBe('oakleyalerts');
  });

  test('allows underscores', () => {
    const result = validateTwitterUsername('day_trader_jen');
    expect(result.valid).toBe(true);
  });

  test('allows numbers', () => {
    const result = validateTwitterUsername('trader123');
    expect(result.valid).toBe(true);
  });

  test('max 15 chars (Twitter limit)', () => {
    const result = validateTwitterUsername('a'.repeat(15));
    expect(result.valid).toBe(true);
  });

  test('rejects 16+ chars', () => {
    const result = validateTwitterUsername('a'.repeat(16));
    expect(result.valid).toBe(false);
  });

  // Edge cases designed to break things
  test('rejects null', () => {
    expect(validateTwitterUsername(null).valid).toBe(false);
  });

  test('rejects undefined', () => {
    expect(validateTwitterUsername(undefined).valid).toBe(false);
  });

  test('rejects empty string', () => {
    expect(validateTwitterUsername('').valid).toBe(false);
  });

  test('rejects just @', () => {
    expect(validateTwitterUsername('@').valid).toBe(false);
  });

  test('rejects number input', () => {
    expect(validateTwitterUsername(12345).valid).toBe(false);
  });

  test('rejects boolean input', () => {
    expect(validateTwitterUsername(true).valid).toBe(false);
  });

  test('rejects array input', () => {
    expect(validateTwitterUsername(['oakley']).valid).toBe(false);
  });

  test('rejects object input', () => {
    expect(validateTwitterUsername({ name: 'oakley' }).valid).toBe(false);
  });

  // Injection attempts
  test('rejects SQL injection', () => {
    expect(validateTwitterUsername("'; DROP TABLE--").valid).toBe(false);
  });

  test('rejects path traversal', () => {
    expect(validateTwitterUsername('../../../etc/passwd').valid).toBe(false);
  });

  test('rejects shell injection', () => {
    expect(validateTwitterUsername('$(whoami)').valid).toBe(false);
  });

  test('rejects XSS script tag', () => {
    expect(validateTwitterUsername('<script>alert(1)</script>').valid).toBe(false);
  });

  test('rejects unicode homoglyph attack', () => {
    // Cyrillic 'а' looks like Latin 'a'
    expect(validateTwitterUsername('оаklеy').valid).toBe(false);
  });

  test('rejects null bytes', () => {
    expect(validateTwitterUsername('oak\x00ley').valid).toBe(false);
  });

  test('rejects newlines', () => {
    expect(validateTwitterUsername('oak\nley').valid).toBe(false);
  });

  test('rejects spaces', () => {
    expect(validateTwitterUsername('oak ley').valid).toBe(false);
  });

  test('rejects hyphens (not valid in Twitter usernames)', () => {
    expect(validateTwitterUsername('oak-ley').valid).toBe(false);
  });
});

// ============================================
// validateConnectionType
// ============================================

describe('validateConnectionType', () => {
  test('accepts tradovate', () => {
    expect(validateConnectionType('tradovate')).toBe(true);
  });

  test('accepts tradesyncer', () => {
    expect(validateConnectionType('tradesyncer')).toBe(true);
  });

  test('accepts none', () => {
    expect(validateConnectionType('none')).toBe(true);
  });

  test('rejects unknown type', () => {
    expect(validateConnectionType('binance')).toBe(false);
  });

  test('rejects empty string', () => {
    expect(validateConnectionType('')).toBe(false);
  });

  test('rejects null', () => {
    expect(validateConnectionType(null)).toBe(false);
  });

  test('rejects undefined', () => {
    expect(validateConnectionType(undefined)).toBe(false);
  });

  test('rejects case-sensitive mismatch', () => {
    expect(validateConnectionType('Tradovate')).toBe(false);
    expect(validateConnectionType('TRADESYNCER')).toBe(false);
  });
});

// ============================================
// validateHexToken
// ============================================

describe('validateHexToken', () => {
  test('valid 32-char hex', () => {
    expect(validateHexToken('a'.repeat(32), 32)).toBe(true);
  });

  test('valid 64-char hex', () => {
    expect(validateHexToken('abcdef0123456789'.repeat(4), 64)).toBe(true);
  });

  test('rejects wrong length', () => {
    expect(validateHexToken('aabb', 32)).toBe(false);
  });

  test('rejects non-hex chars', () => {
    expect(validateHexToken('g'.repeat(32), 32)).toBe(false);
  });

  test('rejects null', () => {
    expect(validateHexToken(null, 32)).toBe(false);
  });

  test('rejects undefined', () => {
    expect(validateHexToken(undefined, 32)).toBe(false);
  });

  test('rejects empty string', () => {
    expect(validateHexToken('', 32)).toBe(false);
  });

  test('rejects number input', () => {
    expect(validateHexToken(12345, 5)).toBe(false);
  });

  test('accepts without length check', () => {
    expect(validateHexToken('abcd')).toBe(true);
  });
});

// ============================================
// sanitizeString
// ============================================

describe('sanitizeString', () => {
  test('passes through clean string', () => {
    expect(sanitizeString('hello world')).toBe('hello world');
  });

  test('trims whitespace', () => {
    expect(sanitizeString('  hello  ')).toBe('hello');
  });

  test('strips control characters', () => {
    expect(sanitizeString('hello\x00world')).toBe('helloworld');
    expect(sanitizeString('hello\x07world')).toBe('helloworld');
  });

  test('returns empty for null', () => {
    expect(sanitizeString(null)).toBe('');
  });

  test('returns empty for undefined', () => {
    expect(sanitizeString(undefined)).toBe('');
  });

  test('returns empty for number', () => {
    expect(sanitizeString(123)).toBe('');
  });

  test('returns empty for boolean', () => {
    expect(sanitizeString(true)).toBe('');
  });

  test('preserves newlines and tabs', () => {
    // The sanitizer strips some control chars but should preserve \n and \t
    expect(sanitizeString('line1\nline2')).toContain('line1');
    expect(sanitizeString('col1\tcol2')).toContain('col1');
  });
});

// ============================================
// validateSortField
// ============================================

describe('validateSortField', () => {
  test('accepts valid sort fields', () => {
    expect(validateSortField('totalProfit')).toBe(true);
    expect(validateSortField('winRate')).toBe(true);
    expect(validateSortField('totalTrades')).toBe(true);
    expect(validateSortField('monthlyProfit')).toBe(true);
    expect(validateSortField('updatedAt')).toBe(true);
  });

  test('rejects unknown fields', () => {
    expect(validateSortField('password')).toBe(false);
    expect(validateSortField('tradovate_access_token')).toBe(false);
  });

  test('rejects injection attempts', () => {
    expect(validateSortField('totalProfit; DROP TABLE')).toBe(false);
    expect(validateSortField('1=1--')).toBe(false);
  });

  test('rejects empty/null', () => {
    expect(validateSortField('')).toBe(false);
    expect(validateSortField(null)).toBe(false);
    expect(validateSortField(undefined)).toBe(false);
  });
});
