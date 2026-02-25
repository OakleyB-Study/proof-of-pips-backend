// middleware/syncAuth.js
// CJIS 5.5 - Access Control
// STIG V-222425 - Authentication for privileged functions

/**
 * Protects sync endpoints with a shared secret.
 * The SYNC_API_KEY must be set in environment variables.
 * Cron jobs and admin tools must include this key in the Authorization header.
 */
function syncAuth(req, res, next) {
  const syncApiKey = process.env.SYNC_API_KEY;

  // If no SYNC_API_KEY is configured, deny all sync requests (fail-closed)
  if (!syncApiKey) {
    console.error('SYNC_API_KEY not configured - sync endpoints are disabled');
    return res.status(503).json({ error: 'Sync service not configured' });
  }

  const authHeader = req.headers['authorization'] || req.headers['x-sync-key'];

  if (!authHeader) {
    return res.status(401).json({ error: 'Authentication required for sync operations' });
  }

  // Support both "Bearer <key>" and raw key formats
  const providedKey = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : authHeader;

  // Constant-time comparison to prevent timing attacks
  const crypto = require('crypto');
  const expected = Buffer.from(syncApiKey, 'utf8');
  const provided = Buffer.from(providedKey, 'utf8');

  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
    return res.status(403).json({ error: 'Invalid sync credentials' });
  }

  next();
}

module.exports = { syncAuth };
