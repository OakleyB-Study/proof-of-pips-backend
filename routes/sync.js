const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { decrypt } = require('../utils/encryption');
const { getAdapter } = require('../adapters');

// ============================================
// SYNC SINGLE TRADER (internal helper)
// ============================================

async function syncSingleTrader(trader) {
  try {
    console.log(`Syncing trader: @${trader.twitter_username} (${trader.connection_type})`);

    const adapter = getAdapter(trader.connection_type);
    let credentials;

    if (trader.connection_type === 'tradovate') {
      credentials = {
        username: trader.tradovate_username,
        password: trader.tradovate_access_token ? decrypt(trader.tradovate_access_token) : '',
        secretKey: trader.tradovate_refresh_token ? decrypt(trader.tradovate_refresh_token) : '',
      };
    } else if (trader.connection_type === 'tradesyncer') {
      credentials = {
        apiKey: trader.tradesyncer_api_key ? decrypt(trader.tradesyncer_api_key) : '',
      };
    } else {
      throw new Error(`Unsupported connection type: ${trader.connection_type}`);
    }

    // Run sync
    const result = await adapter.sync(credentials);
    const stats = result.stats;

    // Upsert statistics
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
    }]);
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

    // Log sync
    await db.from('sync_log').insert([{
      trader_id: trader.id,
      source: trader.connection_type,
      status: 'success',
      trades_synced: result.trades?.length || 0,
      completed_at: new Date().toISOString(),
    }]);

    await db.from('traders').update({ updated_at: new Date().toISOString() }).eq('id', trader.id);

    console.log(`Synced @${trader.twitter_username}: $${stats.totalProfit} profit, ${stats.totalTrades} trades`);
    return { success: true, trader: trader.twitter_username, stats };
  } catch (error) {
    console.error(`Failed to sync @${trader.twitter_username}:`, error.message);

    try {
      await db.from('sync_log').insert([{
        trader_id: trader.id,
        source: trader.connection_type,
        status: 'failed',
        error_message: error.message,
        completed_at: new Date().toISOString(),
      }]);
    } catch (_) { /* don't fail on log error */ }

    return { success: false, trader: trader.twitter_username, error: error.message };
  }
}

// ============================================
// SYNC ALL TRADERS
// POST /api/sync/all
// ============================================

router.post('/all', async (req, res) => {
  try {
    console.log('Starting sync for all traders...');

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

    console.log(`Sync complete: ${successCount} successful, ${failCount} failed`);

    res.json({
      success: true,
      message: `Synced ${successCount} traders successfully`,
      results,
    });
  } catch (error) {
    console.error('Error in sync-all:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// SYNC SINGLE TRADER BY USERNAME
// POST /api/sync/trader/:username
// ============================================

router.post('/trader/:username', async (req, res) => {
  try {
    const { username } = req.params;

    const { data: trader, error } = await db
      .from('traders')
      .select('*')
      .eq('twitter_username', username)
      .single();

    if (error || !trader) {
      return res.status(404).json({ error: 'Trader not found' });
    }

    const result = await syncSingleTrader(trader);

    if (result.success) {
      res.json({ success: true, message: `Synced @${username}`, stats: result.stats });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error('Error syncing trader:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// TEST CREDENTIALS
// POST /api/sync/test
// ============================================

router.post('/test', async (req, res) => {
  try {
    const { connectionType, tradovateUsername, tradovatePassword, tradovateSecretKey, tradeSyncerApiKey } = req.body;

    if (!connectionType) {
      return res.status(400).json({ error: 'connectionType is required' });
    }

    const adapter = getAdapter(connectionType);
    let credentials;

    if (connectionType === 'tradovate') {
      credentials = {
        username: tradovateUsername,
        password: tradovatePassword || '',
        secretKey: tradovateSecretKey || '',
      };
    } else {
      credentials = { apiKey: tradeSyncerApiKey };
    }

    const auth = await adapter.authenticate(credentials);
    res.json({ success: true, message: 'Credentials are valid', user: auth.username || auth.name });
  } catch (error) {
    res.status(401).json({ success: false, error: error.message });
  }
});

// ============================================
// GET SYNC HISTORY
// GET /api/sync/history/:username
// ============================================

router.get('/history/:username', async (req, res) => {
  try {
    const { username } = req.params;

    const { data: trader } = await db
      .from('traders')
      .select('id')
      .eq('twitter_username', username)
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
    console.error('Error fetching sync history:', error);
    res.status(500).json({ error: 'Failed to fetch sync history' });
  }
});

module.exports = router;
