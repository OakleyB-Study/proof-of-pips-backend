/**
 * Base Adapter Interface
 * All platform adapters (Tradovate, TradeSyncer) must implement these methods.
 */
class BaseAdapter {
  constructor() {
    if (this.constructor === BaseAdapter) {
      throw new Error('BaseAdapter is an abstract class and cannot be instantiated directly');
    }
  }

  /**
   * Authenticate with the platform
   * @param {Object} credentials - Platform-specific credentials
   * @returns {Promise<Object>} - Authentication result (tokens, etc.)
   */
  async authenticate(credentials) {
    throw new Error('authenticate() must be implemented by subclass');
  }

  /**
   * Get all accounts for a user
   * @param {Object} authContext - Authentication context from authenticate()
   * @returns {Promise<Array>} - Array of account objects
   */
  async getAccounts(authContext) {
    throw new Error('getAccounts() must be implemented by subclass');
  }

  /**
   * Get trades for a specific account
   * @param {Object} authContext - Authentication context
   * @param {string} accountId - Account ID
   * @param {Object} options - Optional filters (startDate, endDate, etc.)
   * @returns {Promise<Array>} - Array of trade objects
   */
  async getTrades(authContext, accountId, options = {}) {
    throw new Error('getTrades() must be implemented by subclass');
  }

  /**
   * Calculate statistics from trades
   * @param {Array} trades - Array of normalized trade objects
   * @returns {Object} - Calculated statistics
   */
  calculateStats(trades) {
    if (!trades || trades.length === 0) {
      return {
        totalProfit: 0,
        monthlyProfit: 0,
        winRate: 0,
        totalTrades: 0,
        avgTradePnl: 0,
        bestTrade: 0,
        worstTrade: 0,
        profitFactor: 0,
        verifiedPayouts: 0,
      };
    }

    const profits = trades.map(t => parseFloat(t.profit) || 0);
    const totalProfit = profits.reduce((sum, p) => sum + p, 0);
    const winners = profits.filter(p => p > 0);
    const losers = profits.filter(p => p < 0);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const monthlyTrades = trades.filter(t => new Date(t.closedAt) >= thirtyDaysAgo);
    const monthlyProfit = monthlyTrades.reduce((sum, t) => sum + (parseFloat(t.profit) || 0), 0);

    const grossWins = winners.reduce((sum, p) => sum + p, 0);
    const grossLosses = Math.abs(losers.reduce((sum, p) => sum + p, 0));

    return {
      totalProfit: parseFloat(totalProfit.toFixed(2)),
      monthlyProfit: parseFloat(monthlyProfit.toFixed(2)),
      winRate: parseFloat(((winners.length / trades.length) * 100).toFixed(2)),
      totalTrades: trades.length,
      avgTradePnl: parseFloat((totalProfit / trades.length).toFixed(2)),
      bestTrade: parseFloat(Math.max(...profits, 0).toFixed(2)),
      worstTrade: parseFloat(Math.min(...profits, 0).toFixed(2)),
      profitFactor: grossLosses > 0 ? parseFloat((grossWins / grossLosses).toFixed(2)) : grossWins > 0 ? 999 : 0,
      verifiedPayouts: 0,
    };
  }

  /**
   * Full sync: authenticate, fetch accounts, fetch trades, calculate stats.
   * @param {Object} credentials - Platform credentials
   * @returns {Promise<Object>} - { stats, trades, accounts }
   */
  async sync(credentials) {
    throw new Error('sync() must be implemented by subclass');
  }
}

module.exports = BaseAdapter;
