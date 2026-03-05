// Set JWT_SECRET before requiring the module
process.env.JWT_SECRET = 'test-secret-key-that-is-at-least-32-characters-long';

const { signToken, verifyToken, getCookieOptions, COOKIE_NAME } = require('../utils/jwt');

describe('JWT utilities', () => {
  // ============================================
  // signToken + verifyToken round-trip
  // ============================================

  test('sign and verify round-trip', () => {
    const payload = { twitterUsername: 'oakleyalerts', twitterId: '12345' };
    const token = signToken(payload);
    const decoded = verifyToken(token);

    expect(decoded).not.toBeNull();
    expect(decoded.twitterUsername).toBe('oakleyalerts');
    expect(decoded.twitterId).toBe('12345');
  });

  test('token contains expiry claim', () => {
    const token = signToken({ twitterUsername: 'test', twitterId: '1' });
    const decoded = verifyToken(token);
    expect(decoded.exp).toBeDefined();
    expect(decoded.iat).toBeDefined();
  });

  test('does not leak extra payload fields', () => {
    const token = signToken({
      twitterUsername: 'test',
      twitterId: '1',
      password: 'secret123',
      admin: true,
    });
    const decoded = verifyToken(token);
    expect(decoded.password).toBeUndefined();
    expect(decoded.admin).toBeUndefined();
  });

  // ============================================
  // verifyToken failure cases
  // ============================================

  test('rejects tampered token', () => {
    const token = signToken({ twitterUsername: 'test', twitterId: '1' });
    const tampered = token.slice(0, -5) + 'XXXXX';
    expect(verifyToken(tampered)).toBeNull();
  });

  test('rejects empty string', () => {
    expect(verifyToken('')).toBeNull();
  });

  test('rejects null', () => {
    expect(verifyToken(null)).toBeNull();
  });

  test('rejects undefined', () => {
    expect(verifyToken(undefined)).toBeNull();
  });

  test('rejects random string', () => {
    expect(verifyToken('not.a.jwt')).toBeNull();
  });

  test('rejects token signed with different secret', () => {
    const jwt = require('jsonwebtoken');
    const badToken = jwt.sign({ twitterUsername: 'hacker' }, 'wrong-secret', { algorithm: 'HS256' });
    expect(verifyToken(badToken)).toBeNull();
  });

  test('rejects token with none algorithm', () => {
    const jwt = require('jsonwebtoken');
    const noneToken = jwt.sign({ twitterUsername: 'hacker' }, '', { algorithm: 'none' });
    expect(verifyToken(noneToken)).toBeNull();
  });

  // ============================================
  // getCookieOptions
  // ============================================

  test('cookie options in development', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const opts = getCookieOptions();
    expect(opts.httpOnly).toBe(true);
    expect(opts.secure).toBe(false);
    expect(opts.sameSite).toBe('lax');
    expect(opts.path).toBe('/');
    expect(typeof opts.maxAge).toBe('number');

    process.env.NODE_ENV = originalEnv;
  });

  test('cookie options in production', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const opts = getCookieOptions();
    expect(opts.httpOnly).toBe(true);
    expect(opts.secure).toBe(true);
    expect(opts.sameSite).toBe('none');

    process.env.NODE_ENV = originalEnv;
  });

  // ============================================
  // COOKIE_NAME
  // ============================================

  test('cookie name is defined and non-empty', () => {
    expect(COOKIE_NAME).toBeDefined();
    expect(typeof COOKIE_NAME).toBe('string');
    expect(COOKIE_NAME.length).toBeGreaterThan(0);
  });
});
