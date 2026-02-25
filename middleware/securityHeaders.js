// middleware/securityHeaders.js
// STIG V-222602, V-222603, V-222604 - Security Response Headers
// CJIS 5.10.1 - Data Protection

/**
 * Adds security headers required by STIG and CJIS compliance.
 * Covers: HSTS, Content-Type sniffing, clickjacking, XSS, CSP, referrer policy.
 */
function securityHeaders(req, res, next) {
  // STIG: Enforce HTTPS via Strict-Transport-Security
  // max-age=31536000 (1 year), includeSubDomains
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

  // STIG: Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // STIG: Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');

  // STIG: Content Security Policy - restrict resource loading
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");

  // STIG: Control referrer information leakage
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // STIG: Disable browser features not needed by API
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');

  // STIG: Prevent caching of sensitive responses
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  // Remove server identification header
  res.removeHeader('X-Powered-By');

  next();
}

module.exports = { securityHeaders };
