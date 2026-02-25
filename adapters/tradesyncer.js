const axios = require('axios');
const BaseAdapter = require('./base');

/**
 * TradeSyncer API Adapter
 *
 * TradeSyncer is a trade copying/syncing service widely used by prop traders
 * to manage multiple funded accounts. It tracks all trade activity and
 * provides a centralized view of performance.
 *
 * TradeSyncer exposes an API that gives us:
 *   - Account connections and their status
 *   - Complete trade history across all synced accounts
 *   - Performance metrics (profit, drawdown, etc.)
 *   - Payout records
 *
 * Auth: API key-based authentication via header.
 */
class TradeSyncerAdapter extends BaseAdapter {
  constructor() {
    super();
    this.baseURL = process.env.TRADESYNCER_API_URL || 'https://api.tradesyncer.com/v1';
  }

  /**
   * Authenticate with TradeSyncer API
   * TradeSyncer uses API key auth - just validate the key works.
   *
   * @param {Object} credentials
   * @param {string} credentials.apiKey - TradeSyncer API key
   * @returns {Promise<Object>} - { apiKey, user }
   */
  async authenticate(credentials) {
    try {
      const response = await axios.get(
        `${this.baseURL}/user/me`,
        {
          headers: {
            'Authorization': `Bearer ${credentials.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.data || !response.data.id) {
        throw new Error('Invalid API key or user not found');
      }

      return {
        apiKey: credentials.apiKey,
        userId: response.data.id,
        username: response.data.username || response.data.email,
      };
    } catch (error) {
      const msg = error.response?.data?.message || error.message;
      console.error('[TradeSyncer] Authentication error:', msg);
      throw new Error(`TradeSyncer authentication failed: ${msg}`);
    }
  }

  /**
   * Get all connected accounts from TradeSyncer
   */
  async getAccounts(authContext) {
    try {
      const response = await axios.get(
        `${this.baseURL}/accounts`,
        {
          headers: {
            'Authorization': `Bearer ${authContext.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!Array.isArray(response.data)) {
        return [];
      }

      return response.data.map(account => ({
        id: account.id,
        name: account.name || account.accountName,
        displayName: account.displayName || account.name,
        balance: parseFloat(account.balance) || 0,
        active: account.status === 'active',
        broker: account.broker,
        propFirm: account.propFirm || null,
      }));
    } catch (error) {
      console.error('[TradeSyncer] getAccounts error:', error.response?.data || error.message);
      throw new Error(`Failed to fetch TradeSyncer accounts: ${error.message}`);
    }
  }

  /**
   * Get trade history from TradeSyncer.
   * TradeSyncer typically provides clean, paired trades (round trips) with P&L.
   */
  async getTrades(authContext, accountId, options = {}) {
    try {
      const params = {};
      if (accountId) params.accountId = accountId;
      if (options.startDate) params.startDate = options.startDate;
      if (options.endDate) params.endDate = options.endDate;
      if (options.limit) params.limit = options.limit;

      const response = await axios.get(
        `${this.baseURL}/trades`,
        {
          headers: {
            'Authorization': `Bearer ${authContext.apiKey}`,
            'Content-Type': 'application/json',
          },
          params,
        }
      );

      const trades = Array.isArray(response.data) ? response.data : (response.data?.trades || []);

      return trades.map(trade => ({
        externalTradeId: String(trade.id || trade.tradeId),
        symbol: trade.symbol || trade.instrument || 'UNKNOWN',
        side: (trade.side || trade.direction || '').toLowerCase(),
        quantity: trade.quantity || trade.lots || 1,
        entryPrice: parseFloat(trade.entryPrice || trade.openPrice) || 0,
        exitPrice: parseFloat(trade.exitPrice || trade.closePrice) || 0,
        profit: parseFloat(trade.profit || trade.pnl || trade.realizedPnl) || 0,
        openedAt: trade.openTime || trade.entryTime,
        closedAt: trade.closeTime || trade.exitTime,
        source: 'tradesyncer',
      }));
    } catch (error) {
      console.error('[TradeSyncer] getTrades error:', error.response?.data || error.message);
      return [];
    }
  }

  /**
   * Get performance summary from TradeSyncer (if available).
   * Some TradeSyncer API versions provide pre-calculated stats.
   */
  async getPerformanceSummary(authContext) {
    try {
      const response = await axios.get(
        `${this.baseURL}/performance/summary`,
        {
          headers: {
            'Authorization': `Bearer ${authContext.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );
      return response.data;
    } catch (error) {
      // Not all TradeSyncer setups have this endpoint
      return null;
    }
  }

  /**
   * Get payout records from TradeSyncer
   */
  async getPayouts(authContext) {
    try {
      const response = await axios.get(
        `${this.baseURL}/payouts`,
        {
          headers: {
            'Authorization': `Bearer ${authContext.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      // Payouts endpoint might not exist in all setups
      return [];
    }
  }

  /**
   * Full sync process for TradeSyncer
   */
  async sync(credentials) {
    try {
      console.log('[TradeSyncer] Starting sync...');

      // Step 1: Authenticate
      const auth = await this.authenticate(credentials);
      console.log(`[TradeSyncer] Authenticated as ${auth.username}`);

      // Step 2: Get accounts
      const accounts = await this.getAccounts(auth);
      console.log(`[TradeSyncer] Found ${accounts.length} connected accounts`);

      // Step 3: Get all trades across accounts
      const allTrades = [];
      for (const account of accounts) {
        const trades = await this.getTrades(auth, account.id);
        allTrades.push(...trades);
      }
      console.log(`[TradeSyncer] Found ${allTrades.length} total trades`);

      // Step 4: Try to get pre-calculated performance
      const perfSummary = await this.getPerformanceSummary(auth);

      // Step 5: Get payouts
      const payouts = await this.getPayouts(auth);

      // Step 6: Calculate statistics (use our own calc, augmented with platform data)
      const stats = this.calculateStats(allTrades);

      // Override payout count if we got it from the API
      if (payouts.length > 0) {
        stats.verifiedPayouts = payouts.length;
      }

      // Use platform stats if they're more accurate
      if (perfSummary) {
        if (perfSummary.totalProfit != null) {
          stats.totalProfit = parseFloat(perfSummary.totalProfit) || stats.totalProfit;
        }
        if (perfSummary.winRate != null) {
          stats.winRate = parseFloat(perfSummary.winRate) || stats.winRate;
        }
      }

      console.log('[TradeSyncer] Stats:', stats);

      return {
        stats,
        trades: allTrades,
        accounts,
        payouts,
      };
    } catch (error) {
      console.error(`[TradeSyncer] Sync failed:`, error.message);
      throw error;
    }
  }
}

module.exports = TradeSyncerAdapter;
