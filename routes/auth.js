// backend/routes/auth.js
// Twitter OAuth 2.0 Authentication Routes
// STIG V-222596 - Session tokens must not be transmitted in URL parameters
// CJIS 5.6.2 - Authentication mechanisms

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { logSecurityEvent } = require('../middleware/auditLogger');
const { validateHexToken } = require('../middleware/inputSanitizer');

// In-memory session storage (for demo - use Redis in production)
const sessions = new Map();

// Session limits - CJIS 5.6.2.2
const SESSION_TIMEOUT_MS = 600000; // 10 minutes
const MAX_SESSIONS = 1000; // Prevent memory exhaustion

// OAuth 2.0 Configuration
const TWITTER_CLIENT_ID = process.env.TWITTER_CLIENT_ID;
const TWITTER_CLIENT_SECRET = process.env.TWITTER_CLIENT_SECRET;
const TWITTER_CALLBACK_URL = process.env.TWITTER_CALLBACK_URL ||
  'https://proof-of-pips-backend-production.up.railway.app/api/auth/twitter/callback';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://proofofpips.com';

// Generate PKCE challenge
function generateCodeChallenge() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

/**
 * Prune expired sessions to prevent memory exhaustion.
 * STIG: Session management must include cleanup of expired sessions.
 */
function pruneExpiredSessions() {
  const now = Date.now();
  for (const [key, value] of sessions.entries()) {
    if (now - value.timestamp > SESSION_TIMEOUT_MS) {
      sessions.delete(key);
    }
  }
}

// ============================================
// INITIATE OAUTH FLOW
// GET /api/auth/twitter/login
// ============================================

router.get('/twitter/login', (req, res) => {
  try {
    const state = crypto.randomBytes(16).toString('hex');
    const { verifier, challenge } = generateCodeChallenge();

    // Enforce session limit
    pruneExpiredSessions();
    if (sessions.size >= MAX_SESSIONS) {
      logSecurityEvent('SESSION_LIMIT_REACHED', { sessionCount: sessions.size });
      return res.status(503).json({ error: 'Service temporarily unavailable' });
    }

    sessions.set(state, {
      codeVerifier: verifier,
      timestamp: Date.now(),
    });

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: TWITTER_CLIENT_ID,
      redirect_uri: TWITTER_CALLBACK_URL,
      scope: 'users.read tweet.read',
      state: state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });

    const authUrl = `https://twitter.com/i/oauth2/authorize?${params.toString()}`;

    logSecurityEvent('OAUTH_INITIATE', { state: state.slice(0, 8) + '...' });
    res.redirect(authUrl);
  } catch (error) {
    logSecurityEvent('OAUTH_INITIATE_FAILED', { error: error.message });
    res.redirect(`${FRONTEND_URL}?error=oauth_init_failed`);
  }
});

// ============================================
// OAUTH CALLBACK
// GET /api/auth/twitter/callback
// STIG: Auth token is delivered via a short-lived intermediary code,
// NOT passed directly in URL query params to the frontend.
// ============================================

router.get('/twitter/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      logSecurityEvent('OAUTH_DENIED', { error });
      return res.redirect(`${FRONTEND_URL}?error=oauth_denied`);
    }

    if (!code || !state) {
      logSecurityEvent('OAUTH_INVALID_CALLBACK', {});
      return res.redirect(`${FRONTEND_URL}?error=invalid_callback`);
    }

    const session = sessions.get(state);
    if (!session) {
      logSecurityEvent('OAUTH_SESSION_EXPIRED', { state: state.slice(0, 8) + '...' });
      return res.redirect(`${FRONTEND_URL}?error=session_expired`);
    }

    // Exchange code for access token
    const tokenParams = new URLSearchParams({
      code: code,
      grant_type: 'authorization_code',
      client_id: TWITTER_CLIENT_ID,
      redirect_uri: TWITTER_CALLBACK_URL,
      code_verifier: session.codeVerifier,
    });

    const tokenResponse = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${TWITTER_CLIENT_ID}:${TWITTER_CLIENT_SECRET}`).toString('base64')}`,
      },
      body: tokenParams.toString(),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenData.access_token) {
      logSecurityEvent('OAUTH_TOKEN_EXCHANGE_FAILED', { status: tokenResponse.status });
      return res.redirect(`${FRONTEND_URL}?error=token_exchange_failed`);
    }

    // Get user info from Twitter
    const userResponse = await fetch('https://api.twitter.com/2/users/me', {
      headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
    });

    const userData = await userResponse.json();

    if (!userResponse.ok || !userData.data) {
      logSecurityEvent('OAUTH_USER_DATA_FAILED', { status: userResponse.status });
      return res.redirect(`${FRONTEND_URL}?error=user_data_failed`);
    }

    const twitterUsername = userData.data.username;

    // Clean up OAuth state session
    sessions.delete(state);

    // STIG FIX: Instead of passing the auth token in the URL, use a short-lived
    // intermediary code. The frontend exchanges this code for the auth token
    // via a POST request (token never appears in URL/logs/referrer).
    const exchangeCode = crypto.randomBytes(16).toString('hex');
    const authToken = crypto.randomBytes(32).toString('hex');

    sessions.set(`exchange:${exchangeCode}`, {
      authToken,
      timestamp: Date.now(),
    });

    sessions.set(authToken, {
      twitterUsername: twitterUsername,
      twitterId: userData.data.id,
      timestamp: Date.now(),
    });

    logSecurityEvent('OAUTH_SUCCESS', { username: twitterUsername });

    // Redirect with short-lived exchange code (not the actual auth token)
    res.redirect(`${FRONTEND_URL}?code=${exchangeCode}&twitter_username=${encodeURIComponent(twitterUsername)}`);
  } catch (error) {
    logSecurityEvent('OAUTH_CALLBACK_ERROR', { error: error.message });
    res.redirect(`${FRONTEND_URL}?error=oauth_failed`);
  }
});

// ============================================
// EXCHANGE CODE FOR AUTH TOKEN
// POST /api/auth/exchange
// STIG: Token exchange via POST body (not URL params)
// ============================================

router.post('/exchange', express.json(), (req, res) => {
  try {
    const { code } = req.body;

    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Exchange code required' });
    }

    if (!validateHexToken(code, 32)) {
      return res.status(400).json({ error: 'Invalid exchange code format' });
    }

    const exchangeSession = sessions.get(`exchange:${code}`);
    if (!exchangeSession) {
      logSecurityEvent('TOKEN_EXCHANGE_INVALID', { sourceIp: req.ip });
      return res.status(401).json({ error: 'Invalid or expired exchange code' });
    }

    // Check expiry (60 seconds for exchange codes - very short lived)
    if (Date.now() - exchangeSession.timestamp > 60000) {
      sessions.delete(`exchange:${code}`);
      return res.status(401).json({ error: 'Exchange code expired' });
    }

    // Delete the exchange code (single use)
    sessions.delete(`exchange:${code}`);

    // Return the actual auth token in the response body (not URL)
    res.json({ authToken: exchangeSession.authToken });
  } catch (error) {
    logSecurityEvent('TOKEN_EXCHANGE_ERROR', { error: error.message });
    res.status(500).json({ error: 'Exchange failed' });
  }
});

// ============================================
// VERIFY AUTH TOKEN
// POST /api/auth/verify
// ============================================

router.post('/verify', express.json(), (req, res) => {
  try {
    const { authToken } = req.body;

    if (!authToken || typeof authToken !== 'string') {
      return res.status(400).json({ error: 'Auth token required' });
    }

    if (!validateHexToken(authToken, 64)) {
      return res.status(400).json({ error: 'Invalid token format' });
    }

    const session = sessions.get(authToken);

    if (!session) {
      logSecurityEvent('AUTH_VERIFY_INVALID', { sourceIp: req.ip });
      return res.status(401).json({ error: 'Invalid or expired auth token' });
    }

    // CJIS 5.6.2.2: Session timeout
    if (Date.now() - session.timestamp > SESSION_TIMEOUT_MS) {
      sessions.delete(authToken);
      logSecurityEvent('AUTH_TOKEN_EXPIRED', { username: session.twitterUsername });
      return res.status(401).json({ error: 'Auth token expired' });
    }

    res.json({
      verified: true,
      twitterUsername: session.twitterUsername,
      twitterId: session.twitterId,
    });
  } catch (error) {
    logSecurityEvent('AUTH_VERIFY_ERROR', { error: error.message });
    res.status(500).json({ error: 'Verification failed' });
  }
});

module.exports = router;
