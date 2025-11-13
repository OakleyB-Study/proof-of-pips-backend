// backend/middleware/rateLimiter.js
// Rate limiting to prevent API abuse

const rateLimit = require('express-rate-limit');

// ============================================
// GENERAL API RATE LIMITER
// ============================================
// Limits: 100 requests per 15 minutes per IP
// Applies to all routes
// ============================================

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  // Skip rate limiting for health check
  skip: (req) => req.path === '/health'
});

// ============================================
// SYNC ENDPOINT RATE LIMITER
// ============================================
// Limits: 10 syncs per hour per IP
// More restrictive since syncing is expensive
// ============================================

const syncLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit each IP to 10 sync requests per hour
  message: {
    error: 'Too many sync requests. You can sync up to 10 times per hour.',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false, // Count even successful requests
});

// ============================================
// TRADER CREATION RATE LIMITER
// ============================================
// Limits: 5 new traders per hour per IP
// Prevents spam/fake accounts
// ============================================

const createTraderLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Limit each IP to 5 trader creations per hour
  message: {
    error: 'Too many trader creation attempts. Please try again later.',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  generalLimiter,
  syncLimiter,
  createTraderLimiter
};
