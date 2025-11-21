// backend/routes/auth.js
// Twitter OAuth 2.0 Authentication Routes

const express = require('express');
const router = express.Router();
const crypto = require('crypto');

// In-memory session storage (for demo - use Redis in production)
const sessions = new Map();

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

// ============================================
// INITIATE OAUTH FLOW
// ============================================
// GET /api/auth/twitter/login
// Frontend redirects user here to start OAuth
// ============================================

router.get('/twitter/login', (req, res) => {
  try {
    // Generate state and PKCE challenge
    const state = crypto.randomBytes(16).toString('hex');
    const { verifier, challenge } = generateCodeChallenge();
    
    // Store session data
    sessions.set(state, {
      codeVerifier: verifier,
      timestamp: Date.now()
    });

    // Clean up old sessions (older than 10 minutes)
    for (const [key, value] of sessions.entries()) {
      if (Date.now() - value.timestamp > 600000) {
        sessions.delete(key);
      }
    }

    // Build Twitter authorization URL
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: TWITTER_CLIENT_ID,
      redirect_uri: TWITTER_CALLBACK_URL,
      scope: 'users.read tweet.read',
      state: state,
      code_challenge: challenge,
      code_challenge_method: 'S256'
    });

    const authUrl = `https://twitter.com/i/oauth2/authorize?${params.toString()}`;
    
    console.log('🔐 Redirecting to Twitter OAuth...');
    res.redirect(authUrl);
  } catch (error) {
    console.error('Error initiating OAuth:', error);
    res.redirect(`${FRONTEND_URL}?error=oauth_init_failed`);
  }
});

// ============================================
// OAUTH CALLBACK
// ============================================
// GET /api/auth/twitter/callback
// Twitter redirects here after user authorizes
// ============================================

router.get('/twitter/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;

    // Handle OAuth errors
    if (error) {
      console.error('OAuth error:', error);
      return res.redirect(`${FRONTEND_URL}?error=oauth_denied`);
    }

    if (!code || !state) {
      return res.redirect(`${FRONTEND_URL}?error=invalid_callback`);
    }

    // Retrieve session data
    const session = sessions.get(state);
    if (!session) {
      return res.redirect(`${FRONTEND_URL}?error=session_expired`);
    }

    // Exchange code for access token
    const tokenParams = new URLSearchParams({
      code: code,
      grant_type: 'authorization_code',
      client_id: TWITTER_CLIENT_ID,
      redirect_uri: TWITTER_CALLBACK_URL,
      code_verifier: session.codeVerifier
    });

    const tokenResponse = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${TWITTER_CLIENT_ID}:${TWITTER_CLIENT_SECRET}`).toString('base64')}`
      },
      body: tokenParams.toString()
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenData.access_token) {
      console.error('Token exchange failed:', tokenData);
      return res.redirect(`${FRONTEND_URL}?error=token_exchange_failed`);
    }

    // Get user info from Twitter
    const userResponse = await fetch('https://api.twitter.com/2/users/me', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`
      }
    });

    const userData = await userResponse.json();

    if (!userResponse.ok || !userData.data) {
      console.error('Failed to get user data:', userData);
      return res.redirect(`${FRONTEND_URL}?error=user_data_failed`);
    }

    const twitterUsername = userData.data.username;
    
    console.log(`✅ Twitter OAuth successful: @${twitterUsername}`);

    // Clean up session
    sessions.delete(state);

    // Create a temporary auth token for the frontend
    const authToken = crypto.randomBytes(32).toString('hex');
    sessions.set(authToken, {
      twitterUsername: twitterUsername,
      twitterId: userData.data.id,
      timestamp: Date.now()
    });

    // Redirect back to frontend with auth token
    res.redirect(`${FRONTEND_URL}?auth_token=${authToken}&twitter_username=${twitterUsername}`);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.redirect(`${FRONTEND_URL}?error=oauth_failed`);
  }
});

// ============================================
// VERIFY AUTH TOKEN
// ============================================
// POST /api/auth/verify
// Frontend calls this to verify the auth token
// ============================================

router.post('/verify', express.json(), (req, res) => {
  try {
    const { authToken } = req.body;

    if (!authToken) {
      return res.status(400).json({ error: 'Auth token required' });
    }

    const session = sessions.get(authToken);

    if (!session) {
      return res.status(401).json({ error: 'Invalid or expired auth token' });
    }

    // Check if token is expired (10 minutes)
    if (Date.now() - session.timestamp > 600000) {
      sessions.delete(authToken);
      return res.status(401).json({ error: 'Auth token expired' });
    }

    res.json({
      verified: true,
      twitterUsername: session.twitterUsername,
      twitterId: session.twitterId
    });
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

module.exports = router;
