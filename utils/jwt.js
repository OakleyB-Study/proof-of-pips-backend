// utils/jwt.js
// JWT token utilities for stateless cookie-based sessions
// STIG V-222596 - Session tokens must be protected
// CJIS 5.6.2 - Authentication mechanisms

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.warn('WARNING: JWT_SECRET not set or too short. Cookie sessions disabled.');
}

const COOKIE_NAME = 'pop_session';
const COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const JWT_EXPIRES_IN = '30d';

/**
 * Sign a JWT containing user identity claims.
 * @param {{ twitterUsername: string, twitterId: string }} payload
 * @returns {string}
 */
function signToken(payload) {
  return jwt.sign(
    { twitterUsername: payload.twitterUsername, twitterId: payload.twitterId },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN, algorithm: 'HS256' }
  );
}

/**
 * Verify and decode a JWT.
 * @param {string} token
 * @returns {{ twitterUsername: string, twitterId: string } | null}
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    return null;
  }
}

/**
 * Cookie options for httpOnly, secure, sameSite cookies.
 * httpOnly prevents XSS token theft. secure ensures HTTPS-only.
 * sameSite:'none' required for cross-origin (Railway backend ↔ proofofpips.com frontend).
 */
function getCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: COOKIE_MAX_AGE_MS,
    path: '/',
  };
}

module.exports = { signToken, verifyToken, getCookieOptions, COOKIE_NAME };
