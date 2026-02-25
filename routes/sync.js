const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { decrypt } = require('../utils/encryption');
const { getAdapter } = require('../adapters');
const { logSecurityEvent } = require('../middleware/auditLogger');
const { validateTwitterUsername, validateConnectionType } = require('../middleware/inputSanitizer');

// ============================================
// SYNC SINGLE TRADER (internal helper)
// CJIS 5.4: All data modifications are audit logged
// ============================================

async function syncSingleTrader(trader) {
  try {
    logSecurityEvent('SYNC_TRADER_START', {
      username: trader.twitter_username,
      connectionType: trader.connection_type,
      traderId: trader.id,
    });

    const adapter = getAdapter(trader.connection_type);
    let credentials;

    if (trader.connection_type === 'tradovate') {
      credentials = {
        username: trader.tradovate_username,
        password: trader.tradovate_access_token ? decrypt(trader.tradovate_access_token) : '',
        clientId: trader.tradovate_client_id || '',
        secretKey: trader.tradovate_refresh_token ? decrypt(trader.tradovate_refresh_token) : '',
      };
    } else if (trader.connection_type === 'tradesyncer') {
      credentials = {
        apiKey: trader.tradesyncer_api_key ? decrypt(trader.tradesyncer_api_key) : '',
      };
    } else {
      throw new Error(`Unsupported connection type: ${trader.connection_type}`);
    }

    const result = await adapter.sync(credentials);
    const stats = result.stats;

    // Track unique account IDs (high-water mark - only goes up, never down)
    if (result.accounts && result.accounts.length > 0) {
      const currentKnown = trader.known_account_ids || [];
      const newAccountIds = result.accounts
        .map(a => String(a.id))
        .filter(id => !currentKnown.includes(id));

      if (newAccountIds.length > 0) {
        const updatedKnown = [...currentKnown, ...newAccountIds];
        await db.from('traders').update({
          known_account_ids: updatedKnown,
          total_accounts_linked: updatedKnown.length,
        }).eq('id', trader.id);

        logSecurityEvent('NEW_ACCOUNTS_DETECTED', {
          username: trader.twitter_username,
          newAccounts: newAccountIds.length,
          totalAccounts: updatedKnown.length,
        });
      }
    }

    // Upsert statistics (atomic operation)
    const { error: statsError } = await db.from('statistics').upsert([{
      trader_id: trader.id,
      total_profit: stats.totalProfit,
      verified_payouts: stats.verifiedPayouts,
      monthly_profit: stats.monthlyProfit,
      win_rate: stats.winRate,
      total_trades: stats.totalTrades,
      avg_trade_pnl: stats.avgTradePnl,
      best_trade: stats.bestTrade,
      worst_trade: stats.worstTrade,
      profit_factor: stats.profitFactor,
      updated_at: new Date().toISOString(),
    }], { onConflict: 'trader_id' });
    if (statsError) throw statsError;

    // Store trade history (keep last 500 trades)
    if (result.trades && result.trades.length > 0) {
      const recentTrades = result.trades.slice(-500).map(trade => ({
        trader_id: trader.id,
        external_trade_id: trade.externalTradeId,
        symbol: trade.symbol,
        side: trade.side,
        quantity: trade.quantity,
        entry_price: trade.entryPrice,
        exit_price: trade.exitPrice,
        profit: trade.profit,
        opened_at: trade.openedAt,
        closed_at: trade.closedAt,
        source: trade.source,
      }));

      await db.from('trade_history').delete().eq('trader_id', trader.id);
      await db.from('trade_history').insert(recentTrades);
    }

    // Audit log in database
    const now = new Date().toISOString();
    await db.from('sync_log').insert([{
      trader_id: trader.id,
      source: trader.connection_type,
      status: 'success',
      trades_synced: result.trades?.length || 0,
      started_at: now,
      completed_at: now,
    }]);

    await db.from('traders').update({ updated_at: new Date().toISOString() }).eq('id', trader.id);

    logSecurityEvent('SYNC_TRADER_SUCCESS', {
      username: trader.twitter_username,
      totalTrades: stats.totalTrades,
    });

    return { success: true, trader: trader.twitter_username, stats };
  } catch (error) {
    logSecurityEvent('SYNC_TRADER_FAILED', {
      username: trader.twitter_username,
      error: error.message,
    });

    try {
      const failedAt = new Date().toISOString();
      await db.from('sync_log').insert([{
        trader_id: trader.id,
        source: trader.connection_type,
        status: 'failed',
        error_message: error.message,
        started_at: failedAt,
        completed_at: failedAt,
      }]);
    } catch (_) { /* don't fail on log error */ }

    return { success: false, trader: trader.twitter_username, error: error.message };
  }
}

// ============================================
// SYNC ALL TRADERS
// POST /api/sync/all
// Protected by syncAuth middleware (in server.js)
// ============================================

router.post('/all', async (req, res) => {
  try {
    logSecurityEvent('SYNC_ALL_START', { sourceIp: req.ip });

    const { data: traders, error } = await db.from('traders').select('*');
    if (error) throw error;

    if (!traders || traders.length === 0) {
      return res.json({ success: true, message: 'No traders to sync', results: [] });
    }

    const results = [];
    for (const trader of traders) {
      const result = await syncSingleTrader(trader);
      results.push(result);
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    logSecurityEvent('SYNC_ALL_COMPLETE', { successCount, failCount });

    res.json({
      success: true,
      message: `Synced ${successCount} traders successfully`,
      results,
    });
  } catch (error) {
    logSecurityEvent('SYNC_ALL_ERROR', { error: error.message });
    // STIG: Don't leak internal error details
    res.status(500).json({ success: false, error: 'Sync operation failed' });
  }
});

// ============================================
// SYNC SINGLE TRADER BY USERNAME
// POST /api/sync/trader/:username
// ============================================

router.post('/trader/:username', async (req, res) => {
  try {
    const { username } = req.params;

    // STIG: Validate input
    const validation = validateTwitterUsername(username);
    if (!validation.valid) {
      return res.status(400).json({ error: 'Invalid username format' });
    }

    const { data: trader, error } = await db
      .from('traders')
      .select('*')
      .eq('twitter_username', validation.sanitized)
      .single();

    if (error || !trader) {
      return res.status(404).json({ error: 'Trader not found' });
    }

    const result = await syncSingleTrader(trader);

    if (result.success) {
      res.json({ success: true, message: `Synced @${validation.sanitized}`, stats: result.stats });
    } else {
      // STIG: Don't leak internal error details
      res.status(500).json({ success: false, error: 'Sync failed for this trader' });
    }
  } catch (error) {
    logSecurityEvent('SYNC_SINGLE_ERROR', { error: error.message });
    res.status(500).json({ success: false, error: 'Sync operation failed' });
  }
});

// ============================================
// TEST CREDENTIALS
// POST /api/sync/test
// ============================================

router.post('/test', async (req, res) => {
  try {
    const { connectionType, tradovateUsername, tradovatePassword, tradovateClientId, tradovateSecretKey, tradeSyncerApiKey } = req.body;

    if (!connectionType || !validateConnectionType(connectionType)) {
      return res.status(400).json({ error: 'Valid connectionType is required (tradovate or tradesyncer)' });
    }

    const adapter = getAdapter(connectionType);
    let credentials;

    if (connectionType === 'tradovate') {
      credentials = {
        username: tradovateUsername,
        password: tradovatePassword || '',
        clientId: tradovateClientId || '',
        secretKey: tradovateSecretKey || '',
      };
    } else {
      credentials = { apiKey: tradeSyncerApiKey };
    }

    logSecurityEvent('CREDENTIAL_TEST', { connectionType, sourceIp: req.ip });

    const auth = await adapter.authenticate(credentials);
    res.json({ success: true, message: 'Credentials are valid', user: auth.username || auth.name });
  } catch (error) {
    logSecurityEvent('CREDENTIAL_TEST_FAILED', { connectionType: req.body?.connectionType, sourceIp: req.ip });
    // STIG: Don't leak adapter-specific error details
    res.status(401).json({ success: false, error: 'Invalid credentials' });
  }
});

// ============================================
// GET SYNC HISTORY
// GET /api/sync/history/:username
// ============================================

router.get('/history/:username', async (req, res) => {
  try {
    const { username } = req.params;

    const validation = validateTwitterUsername(username);
    if (!validation.valid) {
      return res.status(400).json({ error: 'Invalid username format' });
    }

    const { data: trader } = await db
      .from('traders')
      .select('id')
      .eq('twitter_username', validation.sanitized)
      .single();

    if (!trader) {
      return res.status(404).json({ error: 'Trader not found' });
    }

    const { data: logs, error } = await db
      .from('sync_log')
      .select('*')
      .eq('trader_id', trader.id)
      .order('started_at', { ascending: false })
      .limit(20);

    if (error) throw error;
    res.json(logs || []);
  } catch (error) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      event: 'FETCH_SYNC_HISTORY_FAILED',
      message: error.message,
    }));
    res.status(500).json({ error: 'Failed to fetch sync history' });
  }
});

module.exports = router;
