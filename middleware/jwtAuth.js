// middleware/jwtAuth.js
// JWT cookie-based authentication middleware
// STIG V-222596 - Session token protection
// CJIS 5.6.2 - Authentication mechanisms

const { verifyToken, COOKIE_NAME } = require('../utils/jwt');
const { logSecurityEvent } = require('./auditLogger');

/**
 * Express middleware: authenticates via JWT httpOnly cookie.
 * Sets req.user = { twitterUsername, twitterId } on success.
 * Returns 401 if no valid cookie.
 */
function jwtAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];

  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    logSecurityEvent('JWT_AUTH_FAILED', { sourceIp: req.ip, path: req.originalUrl });
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }

  req.user = {
    twitterUsername: decoded.twitterUsername,
    twitterId: decoded.twitterId,
  };

  next();
}

module.exports = { jwtAuth };
