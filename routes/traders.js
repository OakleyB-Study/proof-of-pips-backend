const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { encrypt } = require('../utils/encryption');
const { getAdapter, getSupportedFirms, isConnectionSupported, PROP_FIRMS } = require('../adapters');
const { logSecurityEvent } = require('../middleware/auditLogger');
const { validateTwitterUsername, validateConnectionType, sanitizeString } = require('../middleware/inputSanitizer');
const { createTraderLimiter } = require('../middleware/rateLimiter');
const { jwtAuth } = require('../middleware/jwtAuth');
const { verifyToken, COOKIE_NAME } = require('../utils/jwt');

/**
 * Authenticate a request using either JWT cookie or legacy authToken body param.
 * Returns { twitterUsername, twitterId } or null.
 */
async function authenticateRequest(req) {
  // Try JWT cookie first
  const cookieToken = req.cookies?.[COOKIE_NAME];
  if (cookieToken) {
    const decoded = verifyToken(cookieToken);
    if (decoded) return decoded;
  }

  // Fall back to legacy authToken in body
  const { authToken } = req.body;
  if (authToken && typeof authToken === 'string') {
    try {
      const verifyResponse = await fetch(
        `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/auth/verify`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ authToken }),
        }
      );
      const verifyData = await verifyResponse.json();
      if (verifyResponse.ok && verifyData.verified) {
        return { twitterUsername: verifyData.twitterUsername, twitterId: verifyData.twitterId };
      }
    } catch {}
  }

  return null;
}

// ============================================
// GET ALL TRADERS (for leaderboard)
// ============================================

router.get('/', async (req, res) => {
  try {
    const { data, error } = await db.rpc('get_traders_with_stats');

    if (error) {
      const { data: tradersData } = await db.from('traders').select('*');
      const { data: statsData } = await db.from('statistics').select('*');

      if (!tradersData) {
        return res.json([]);
      }

      const traders = tradersData.map((trader) => {
        const stats = statsData?.find(s => s.trader_id === trader.id);
        return {
          id: trader.id,
          twitter: trader.twitter_username,
          avatar: trader.avatar,
          totalProfit: stats?.total_profit || 0,
          verifiedPayouts: stats?.verified_payouts || 0,
          monthlyProfit: stats?.monthly_profit || 0,
          winRate: stats?.win_rate || 0,
          totalTrades: stats?.total_trades || 0,
          profitFactor: stats?.profit_factor || 0,
          accountCreated: trader.account_created,
          propFirm: trader.prop_firm,
          propFirmDisplay: trader.prop_firm_display,
          connectionType: trader.connection_type,
          totalAccountsLinked: trader.total_accounts_linked || 0,
          authStatus: trader.auth_status || 'active',
          updatedAt: stats?.updated_at,
        };
      });

      traders.sort((a, b) => b.totalProfit - a.totalProfit);
      traders.forEach((trader, index) => {
        trader.rank = index + 1;
      });

      return res.json(traders);
    }

    res.json(data);
  } catch (error) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      event: 'FETCH_TRADERS_FAILED',
      message: error.message,
    }));
    res.status(500).json({ error: 'Failed to fetch traders' });
  }
});

// ============================================
// GET SUPPORTED PROP FIRMS
// ============================================

router.get('/meta/firms', (req, res) => {
  res.json(getSupportedFirms());
});

// ============================================
// GET SINGLE TRADER (for profile page)
// ============================================

router.get('/:username', async (req, res) => {
  try {
    const { username } = req.params;

    // STIG: Validate input before using in DB query
    const validation = validateTwitterUsername(username);
    if (!validation.valid) {
      return res.status(400).json({ error: 'Invalid username format' });
    }

    const { data, error } = await db
      .from('traders')
      .select(`*, statistics (*)`)
      .eq('twitter_username', validation.sanitized)
      .single();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({ error: 'Trader not found' });
    }

    const stats = data.statistics?.[0];
    const trader = {
      id: data.id,
      twitter: data.twitter_username,
      avatar: data.avatar,
      totalProfit: stats?.total_profit || 0,
      verifiedPayouts: stats?.verified_payouts || 0,
      monthlyProfit: stats?.monthly_profit || 0,
      winRate: stats?.win_rate || 0,
      totalTrades: stats?.total_trades || 0,
      profitFactor: stats?.profit_factor || 0,
      bestTrade: stats?.best_trade || 0,
      worstTrade: stats?.worst_trade || 0,
      avgTradePnl: stats?.avg_trade_pnl || 0,
      accountCreated: data.account_created,
      propFirm: data.prop_firm,
      propFirmDisplay: data.prop_firm_display,
      connectionType: data.connection_type,
      totalAccountsLinked: data.total_accounts_linked || 0,
      authStatus: data.auth_status || 'active',
      updatedAt: stats?.updated_at,
    };

    res.json(trader);
  } catch (error) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      event: 'FETCH_TRADER_FAILED',
      message: error.message,
    }));
    res.status(500).json({ error: 'Failed to fetch trader' });
  }
});

// ============================================
// ADD NEW TRADER (Tradovate or TradeSyncer)
// STIG V-222609: Input validation on all fields
// CJIS 5.4: Security events logged
// ============================================

router.post('/add', createTraderLimiter, async (req, res) => {
  try {
    const {
      twitterUsername,
      authToken,
      propFirm,
      connectionType,
      tradovateUsername,
      tradovatePassword,
      tradovateClientId,
      tradovateSecretKey,
      tradeSyncerApiKey,
    } = req.body;

    // STIG: Validate Twitter username with regex
    const usernameValidation = validateTwitterUsername(twitterUsername);
    if (!usernameValidation.valid) {
      return res.status(400).json({ error: usernameValidation.error });
    }
    const normalizedUsername = usernameValidation.sanitized;

    // Verify authentication (JWT cookie or legacy authToken)
    const authUser = await authenticateRequest(req);
    if (!authUser) {
      logSecurityEvent('AUTH_VERIFY_REJECTED', { username: normalizedUsername, sourceIp: req.ip });
      return res.status(401).json({
        error: 'Invalid or expired authentication. Please log in again.',
      });
    }

    if (authUser.twitterUsername !== normalizedUsername) {
      logSecurityEvent('AUTH_USERNAME_MISMATCH', {
        claimed: normalizedUsername,
        actual: authUser.twitterUsername,
        sourceIp: req.ip,
      });
      return res.status(401).json({
        error: 'Twitter username mismatch. Please authenticate again.',
      });
    }

    // STIG: Validate connection type against whitelist
    if (!connectionType || !validateConnectionType(connectionType)) {
      return res.status(400).json({
        error: 'Invalid connection type. Use "tradovate" or "tradesyncer".',
      });
    }

    // Check if Twitter username already exists
    const { data: existing } = await db
      .from('traders')
      .select('id')
      .eq('twitter_username', normalizedUsername)
      .maybeSingle();

    if (existing) {
      return res.status(400).json({
        error: 'This Twitter username is already registered',
      });
    }

    // Validate credentials by testing authentication
    const adapter = getAdapter(connectionType);
    let credentials;

    if (connectionType === 'tradovate') {
      if (!tradovateUsername) {
        return res.status(400).json({ error: 'Tradovate username is required' });
      }
      credentials = {
        username: sanitizeString(tradovateUsername),
        password: tradovatePassword || '',
        clientId: tradovateClientId || '',
        secretKey: tradovateSecretKey || '',
      };
    } else {
      if (!tradeSyncerApiKey) {
        return res.status(400).json({ error: 'TradeSyncer API key is required' });
      }
      credentials = { apiKey: sanitizeString(tradeSyncerApiKey) };
    }

    // Authenticate and obtain access token
    logSecurityEvent('CREDENTIAL_VALIDATION_START', {
      username: normalizedUsername,
      connectionType,
      sourceIp: req.ip,
    });

    let authResult;
    try {
      authResult = await adapter.authenticate(credentials);
      logSecurityEvent('CREDENTIAL_VALIDATION_SUCCESS', { username: normalizedUsername, connectionType });
    } catch (error) {
      logSecurityEvent('CREDENTIAL_VALIDATION_FAILED', {
        username: normalizedUsername,
        connectionType,
        sourceIp: req.ip,
      });
      // STIG: Don't leak adapter-specific error details to client
      return res.status(401).json({
        error: `Invalid ${connectionType} credentials. Please check and try again.`,
      });
    }

    // Build trader record
    const traderRecord = {
      twitter_username: normalizedUsername,
      avatar: '',
      connection_type: connectionType,
      prop_firm: propFirm && PROP_FIRMS[propFirm] ? propFirm : 'other',
      prop_firm_display: propFirm && PROP_FIRMS[propFirm] ? PROP_FIRMS[propFirm].display : 'Other',
      account_created: new Date().toISOString(),
      known_account_ids: [],
      total_accounts_linked: 0,
    };

    if (connectionType === 'tradovate') {
      traderRecord.tradovate_username = sanitizeString(tradovateUsername);
      if (tradovateClientId) traderRecord.tradovate_client_id = sanitizeString(tradovateClientId);
      // Store the ACCESS TOKEN (not password) — password is never persisted
      traderRecord.tradovate_access_token = encrypt(authResult.accessToken);
      traderRecord.tradovate_token_expires_at = authResult.expirationTime || null;
      traderRecord.auth_status = 'active';
      if (tradovateSecretKey) traderRecord.tradovate_refresh_token = encrypt(tradovateSecretKey);
    } else {
      traderRecord.tradesyncer_api_key = encrypt(sanitizeString(tradeSyncerApiKey));
    }

    // Insert trader
    const { data: newTrader, error: insertError } = await db
      .from('traders')
      .insert([traderRecord])
      .select()
      .single();

    if (insertError) throw insertError;

    logSecurityEvent('TRADER_CREATED', {
      username: normalizedUsername,
      connectionType,
      traderId: newTrader.id,
      sourceIp: req.ip,
    });

    // Trigger initial sync (async) - include sync auth key
    const syncKey = process.env.SYNC_API_KEY;
    if (syncKey) {
      fetch(`${process.env.BACKEND_URL || 'http://localhost:3001'}/api/sync/trader/${normalizedUsername}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${syncKey}` },
      }).catch(err => {
        console.error(JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'ERROR',
          event: 'INITIAL_SYNC_FAILED',
          username: normalizedUsername,
          message: err.message,
        }));
      });
    }

    res.status(201).json({
      message: 'Profile added successfully! Your stats are being synced.',
      trader: {
        twitter: newTrader.twitter_username,
        id: newTrader.id,
        connectionType: newTrader.connection_type,
      },
    });
  } catch (error) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      event: 'ADD_TRADER_FAILED',
      message: error.message,
    }));
    res.status(500).json({ error: 'Failed to add profile. Please try again.' });
  }
});

// ============================================
// REGISTER WITHOUT LINKING (Twitter-only signup)
// POST /api/traders/register
// Creates a trader with connection_type='none'
// ============================================

router.post('/register', createTraderLimiter, jwtAuth, async (req, res) => {
  try {
    const twitterUsername = req.user.twitterUsername;

    const usernameValidation = validateTwitterUsername(twitterUsername);
    if (!usernameValidation.valid) {
      return res.status(400).json({ error: usernameValidation.error });
    }
    const normalizedUsername = usernameValidation.sanitized;

    // Check if already exists
    const { data: existing } = await db
      .from('traders')
      .select('id')
      .eq('twitter_username', normalizedUsername)
      .maybeSingle();

    if (existing) {
      return res.status(400).json({ error: 'This Twitter username is already registered.' });
    }

    const traderRecord = {
      twitter_username: normalizedUsername,
      avatar: '',
      connection_type: 'none',
      prop_firm: 'other',
      prop_firm_display: 'Not Linked',
      account_created: new Date().toISOString(),
      known_account_ids: [],
      total_accounts_linked: 0,
      auth_status: 'unlinked',
    };

    const { data: newTrader, error: insertError } = await db
      .from('traders')
      .insert([traderRecord])
      .select()
      .single();

    if (insertError) throw insertError;

    logSecurityEvent('TRADER_REGISTERED_UNLINKED', {
      username: normalizedUsername,
      traderId: newTrader.id,
      sourceIp: req.ip,
    });

    res.status(201).json({
      message: 'Account created! Link a trading platform to appear on the leaderboard.',
      trader: {
        twitter: newTrader.twitter_username,
        id: newTrader.id,
        connectionType: 'none',
      },
    });
  } catch (error) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      event: 'REGISTER_FAILED',
      message: error.message,
    }));
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// ============================================
// LINK TRADING PLATFORM (for unlinked users)
// POST /api/traders/link
// ============================================

router.post('/link', createTraderLimiter, jwtAuth, async (req, res) => {
  try {
    const twitterUsername = req.user.twitterUsername;

    const usernameValidation = validateTwitterUsername(twitterUsername);
    if (!usernameValidation.valid) {
      return res.status(400).json({ error: usernameValidation.error });
    }
    const normalizedUsername = usernameValidation.sanitized;

    const {
      propFirm,
      connectionType,
      tradovateUsername,
      tradovatePassword,
      tradovateClientId,
      tradovateSecretKey,
      tradeSyncerApiKey,
    } = req.body;

    if (!connectionType || !['tradovate', 'tradesyncer'].includes(connectionType)) {
      return res.status(400).json({ error: 'Invalid connection type. Use "tradovate" or "tradesyncer".' });
    }

    // Find the existing trader
    const { data: trader, error: lookupError } = await db
      .from('traders')
      .select('*')
      .eq('twitter_username', normalizedUsername)
      .single();

    if (lookupError || !trader) {
      return res.status(404).json({ error: 'Trader not found. Please register first.' });
    }

    if (trader.connection_type !== 'none') {
      return res.status(400).json({ error: 'Account is already linked to a trading platform.' });
    }

    // Validate and authenticate credentials
    const adapter = getAdapter(connectionType);
    let credentials;

    if (connectionType === 'tradovate') {
      if (!tradovateUsername) {
        return res.status(400).json({ error: 'Tradovate username is required' });
      }
      credentials = {
        username: sanitizeString(tradovateUsername),
        password: tradovatePassword || '',
        clientId: tradovateClientId || '',
        secretKey: tradovateSecretKey || '',
      };
    } else {
      if (!tradeSyncerApiKey) {
        return res.status(400).json({ error: 'TradeSyncer API key is required' });
      }
      credentials = { apiKey: sanitizeString(tradeSyncerApiKey) };
    }

    logSecurityEvent('LINK_VALIDATION_START', { username: normalizedUsername, connectionType, sourceIp: req.ip });

    let authResult;
    try {
      authResult = await adapter.authenticate(credentials);
    } catch (error) {
      logSecurityEvent('LINK_VALIDATION_FAILED', { username: normalizedUsername, connectionType, sourceIp: req.ip });
      return res.status(401).json({ error: `Invalid ${connectionType} credentials. Please check and try again.` });
    }

    // Build update
    const updateData = {
      connection_type: connectionType,
      prop_firm: propFirm && PROP_FIRMS[propFirm] ? propFirm : 'other',
      prop_firm_display: propFirm && PROP_FIRMS[propFirm] ? PROP_FIRMS[propFirm].display : 'Other',
      auth_status: 'active',
      updated_at: new Date().toISOString(),
    };

    if (connectionType === 'tradovate') {
      updateData.tradovate_username = sanitizeString(tradovateUsername);
      if (tradovateClientId) updateData.tradovate_client_id = sanitizeString(tradovateClientId);
      updateData.tradovate_access_token = encrypt(authResult.accessToken);
      updateData.tradovate_token_expires_at = authResult.expirationTime || null;
      if (tradovateSecretKey) updateData.tradovate_refresh_token = encrypt(tradovateSecretKey);
    } else {
      updateData.tradesyncer_api_key = encrypt(sanitizeString(tradeSyncerApiKey));
    }

    await db.from('traders').update(updateData).eq('id', trader.id);

    logSecurityEvent('TRADER_LINKED', { username: normalizedUsername, connectionType, traderId: trader.id, sourceIp: req.ip });

    // Trigger initial sync
    const syncKey = process.env.SYNC_API_KEY;
    if (syncKey) {
      fetch(`${process.env.BACKEND_URL || 'http://localhost:3001'}/api/sync/trader/${normalizedUsername}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${syncKey}` },
      }).catch(() => {});
    }

    res.json({ success: true, message: 'Account linked successfully! Your stats are being synced.' });
  } catch (error) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      event: 'LINK_FAILED',
      message: error.message,
    }));
    res.status(500).json({ error: 'Failed to link account. Please try again.' });
  }
});

// ============================================
// RE-AUTHENTICATE TRADER (token expired)
// POST /api/traders/reauth
// User enters password again to get a new token
// ============================================

router.post('/reauth', createTraderLimiter, async (req, res) => {
  try {
    const { twitterUsername, tradovatePassword } = req.body;

    // STIG: Validate Twitter username
    const usernameValidation = validateTwitterUsername(twitterUsername);
    if (!usernameValidation.valid) {
      return res.status(400).json({ error: usernameValidation.error });
    }
    const normalizedUsername = usernameValidation.sanitized;

    // Verify authentication (JWT cookie or legacy authToken)
    const authUser = await authenticateRequest(req);
    if (!authUser) {
      logSecurityEvent('REAUTH_VERIFY_REJECTED', { username: normalizedUsername, sourceIp: req.ip });
      return res.status(401).json({ error: 'Invalid or expired authentication.' });
    }

    if (authUser.twitterUsername !== normalizedUsername) {
      logSecurityEvent('REAUTH_USERNAME_MISMATCH', { claimed: normalizedUsername, actual: authUser.twitterUsername });
      return res.status(401).json({ error: 'Twitter username mismatch.' });
    }

    // Look up existing trader
    const { data: trader, error: lookupError } = await db
      .from('traders')
      .select('*')
      .eq('twitter_username', normalizedUsername)
      .single();

    if (lookupError || !trader) {
      return res.status(404).json({ error: 'Trader not found' });
    }

    if (trader.connection_type !== 'tradovate') {
      return res.status(400).json({ error: 'Re-authentication is only needed for Tradovate connections.' });
    }

    if (!tradovatePassword) {
      return res.status(400).json({ error: 'Tradovate password is required.' });
    }

    // Re-authenticate using stored username/clientId/secretKey + new password
    const adapter = getAdapter('tradovate');
    const credentials = {
      username: trader.tradovate_username,
      password: tradovatePassword,
      clientId: trader.tradovate_client_id || '',
      secretKey: trader.tradovate_refresh_token ? require('../utils/encryption').decrypt(trader.tradovate_refresh_token) : '',
    };

    logSecurityEvent('REAUTH_ATTEMPT', { username: normalizedUsername, sourceIp: req.ip });

    let authResult;
    try {
      authResult = await adapter.authenticate(credentials);
    } catch (error) {
      logSecurityEvent('REAUTH_FAILED', { username: normalizedUsername, sourceIp: req.ip });
      return res.status(401).json({ error: 'Invalid Tradovate credentials. Please check and try again.' });
    }

    // Store new token — password is never persisted
    await db.from('traders').update({
      tradovate_access_token: encrypt(authResult.accessToken),
      tradovate_token_expires_at: authResult.expirationTime || null,
      auth_status: 'active',
      updated_at: new Date().toISOString(),
    }).eq('id', trader.id);

    logSecurityEvent('REAUTH_SUCCESS', { username: normalizedUsername });

    res.json({ success: true, message: 'Re-authenticated successfully. Your stats will sync shortly.' });
  } catch (error) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      event: 'REAUTH_ERROR',
      message: error.message,
    }));
    res.status(500).json({ error: 'Re-authentication failed. Please try again.' });
  }
});

module.exports = router;
