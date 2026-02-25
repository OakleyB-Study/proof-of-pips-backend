const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { encrypt } = require('../utils/encryption');
const { getAdapter, getSupportedFirms, isConnectionSupported } = require('../adapters');

// ============================================
// GET ALL TRADERS (for leaderboard)
// ============================================

router.get('/', async (req, res) => {
  try {
    // Try RPC first, then fallback to manual join
    const { data, error } = await db.rpc('get_traders_with_stats');

    if (error) {
      // Fallback: get traders and stats separately
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
    console.error('Error fetching traders:', error);
    res.status(500).json({ error: 'Failed to fetch traders' });
  }
});

// ============================================
// GET SINGLE TRADER (for profile page)
// ============================================

// ============================================
// GET SUPPORTED PROP FIRMS
// ============================================

router.get('/meta/firms', async (req, res) => {
  res.json(getSupportedFirms());
});

router.get('/:username', async (req, res) => {
  try {
    const { username } = req.params;

    const { data, error } = await db
      .from('traders')
      .select(`*, statistics (*)`)
      .eq('twitter_username', username)
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
      updatedAt: stats?.updated_at,
    };

    res.json(trader);
  } catch (error) {
    console.error('Error fetching trader:', error);
    res.status(500).json({ error: 'Failed to fetch trader' });
  }
});

// ============================================
// ADD NEW TRADER (Tradovate or TradeSyncer)
// ============================================

router.post('/add', async (req, res) => {
  try {
    const {
      twitterUsername,
      authToken,
      propFirm,
      connectionType, // 'tradovate' or 'tradesyncer'
      // Tradovate fields
      tradovateUsername,
      tradovatePassword,
      tradovateClientId,
      tradovateSecretKey,
      // TradeSyncer fields
      tradeSyncerApiKey,
    } = req.body;

    // Validate and normalize Twitter username
    if (!twitterUsername) {
      return res.status(400).json({ error: 'Twitter username is required' });
    }
    const normalizedUsername = twitterUsername.replace('@', '').trim();

    // Verify Twitter auth token
    if (!authToken) {
      return res.status(401).json({
        error: 'Twitter authentication required. Please authenticate with Twitter first.'
      });
    }

    try {
      const verifyResponse = await fetch(`${process.env.BACKEND_URL || 'http://localhost:3001'}/api/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authToken })
      });
      const verifyData = await verifyResponse.json();

      if (!verifyResponse.ok || !verifyData.verified) {
        return res.status(401).json({
          error: 'Invalid or expired Twitter authentication. Please try again.'
        });
      }

      if (verifyData.twitterUsername !== normalizedUsername) {
        return res.status(401).json({
          error: 'Twitter username mismatch. Please authenticate again.'
        });
      }
    } catch (error) {
      console.error('Auth verification error:', error);
      return res.status(401).json({ error: 'Failed to verify Twitter authentication' });
    }

    // Validate connection type
    if (!connectionType || !isConnectionSupported(connectionType)) {
      return res.status(400).json({
        error: 'Invalid connection type. Use "tradovate" or "tradesyncer".'
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
        error: 'This Twitter username is already registered'
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
        username: tradovateUsername.trim(),
        password: tradovatePassword || '',
        clientId: tradovateClientId || '',
        secretKey: tradovateSecretKey || '',
      };
    } else {
      if (!tradeSyncerApiKey) {
        return res.status(400).json({ error: 'TradeSyncer API key is required' });
      }
      credentials = { apiKey: tradeSyncerApiKey.trim() };
    }

    // Test the credentials
    console.log(`Validating ${connectionType} credentials for @${normalizedUsername}...`);
    try {
      await adapter.authenticate(credentials);
      console.log(`Credentials validated for @${normalizedUsername}`);
    } catch (error) {
      return res.status(401).json({
        error: `Invalid ${connectionType} credentials: ${error.message}`
      });
    }

    // Build trader record
    const traderRecord = {
      twitter_username: normalizedUsername,
      avatar: '🏆',
      connection_type: connectionType,
      prop_firm: propFirm || 'other',
      prop_firm_display: propFirm ? (require('../adapters').PROP_FIRMS[propFirm]?.display || propFirm) : 'Other',
      account_created: new Date().toISOString(),
    };

    if (connectionType === 'tradovate') {
      traderRecord.tradovate_username = tradovateUsername.trim();
      if (tradovatePassword) traderRecord.tradovate_access_token = encrypt(tradovatePassword);
      if (tradovateSecretKey) traderRecord.tradovate_refresh_token = encrypt(tradovateSecretKey);
    } else {
      traderRecord.tradesyncer_api_key = encrypt(tradeSyncerApiKey.trim());
    }

    // Insert trader
    const { data: newTrader, error: insertError } = await db
      .from('traders')
      .insert([traderRecord])
      .select()
      .single();

    if (insertError) throw insertError;

    console.log(`Trader @${normalizedUsername} added successfully`);

    // Trigger initial sync (async)
    fetch(`${process.env.BACKEND_URL || 'http://localhost:3001'}/api/sync/trader/${normalizedUsername}`, {
      method: 'POST'
    }).catch(err => console.error('Initial sync failed:', err));

    res.status(201).json({
      message: 'Profile added successfully! Your stats are being synced.',
      trader: {
        twitter: newTrader.twitter_username,
        id: newTrader.id,
        connectionType: newTrader.connection_type,
      }
    });
  } catch (error) {
    console.error('Error adding trader:', error);
    res.status(500).json({ error: 'Failed to add profile. Please try again.' });
  }
});

module.exports = router;
