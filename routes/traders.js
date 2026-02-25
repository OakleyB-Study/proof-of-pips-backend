const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { encrypt } = require('../utils/encryption');
const { getAdapter, getSupportedFirms, isConnectionSupported, PROP_FIRMS } = require('../adapters');
const { logSecurityEvent } = require('../middleware/auditLogger');
const { validateTwitterUsername, validateConnectionType, sanitizeString } = require('../middleware/inputSanitizer');
const { createTraderLimiter } = require('../middleware/rateLimiter');

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

    // Verify Twitter auth token
    if (!authToken || typeof authToken !== 'string') {
      return res.status(401).json({
        error: 'Twitter authentication required. Please authenticate with Twitter first.',
      });
    }

    try {
      const verifyResponse = await fetch(`${process.env.BACKEND_URL || 'http://localhost:3001'}/api/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authToken }),
      });
      const verifyData = await verifyResponse.json();

      if (!verifyResponse.ok || !verifyData.verified) {
        logSecurityEvent('AUTH_VERIFY_REJECTED', { username: normalizedUsername, sourceIp: req.ip });
        return res.status(401).json({
          error: 'Invalid or expired Twitter authentication. Please try again.',
        });
      }

      if (verifyData.twitterUsername !== normalizedUsername) {
        logSecurityEvent('AUTH_USERNAME_MISMATCH', {
          claimed: normalizedUsername,
          actual: verifyData.twitterUsername,
          sourceIp: req.ip,
        });
        return res.status(401).json({
          error: 'Twitter username mismatch. Please authenticate again.',
        });
      }
    } catch (error) {
      logSecurityEvent('AUTH_VERIFY_ERROR', { username: normalizedUsername, error: error.message });
      return res.status(401).json({ error: 'Failed to verify Twitter authentication' });
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

    // Test the credentials
    logSecurityEvent('CREDENTIAL_VALIDATION_START', {
      username: normalizedUsername,
      connectionType,
      sourceIp: req.ip,
    });

    try {
      await adapter.authenticate(credentials);
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
      if (tradovatePassword) traderRecord.tradovate_access_token = encrypt(tradovatePassword);
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

module.exports = router;
