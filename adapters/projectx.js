const axios = require('axios');
const BaseAdapter = require('./base');

/**
 * ProjectX Platform Adapter
 * Handles authentication and data fetching for ProjectX API
 */
class ProjectXAdapter extends BaseAdapter {
  constructor() {
    super();
    this.baseURL = process.env.PROJECTX_API_URL || 'https://api.projectx.com';
  }

  /**
   * Authenticate with ProjectX API
   * @param {string} username - ProjectX username (e.g., LTX-1TQ6BC70)
   * @param {string} apiKey - ProjectX API key (decrypted)
   * @returns {Promise<string>} - Authentication token
   */
  async authenticate(username, apiKey) {
    try {
      const response = await axios.post(
        `${this.baseURL}/Auth/loginKey`,
        {
          username,
          apiKey
        },
        {
          headers: { 'Content-Type': 'application/json' }
        }
      );

      if (!response.data || !response.data.token) {
        throw new Error('No token received from ProjectX API');
      }

      return response.data.token;
    } catch (error) {
      console.error('ProjectX authentication error:', error.response?.data || error.message);
      throw new Error(`ProjectX authentication failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Get all accounts for a user
   * @param {string} token - Authentication token
   * @returns {Promise<Array>} - Array of account objects
   */
  async getAccounts(token) {
    try {
      const response = await axios.get(
        `${this.baseURL}/Account/search`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.data || !Array.isArray(response.data)) {
        throw new Error('Invalid accounts response from ProjectX API');
      }

      return response.data;
    } catch (error) {
      console.error('ProjectX getAccounts error:', error.response?.data || error.message);
      throw new Error(`Failed to fetch accounts: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Get trades for a specific account
   * @param {string} token - Authentication token
   * @param {string} accountId - Account ID
   * @returns {Promise<Array>} - Array of trade objects
   */
  async getTrades(token, accountId) {
    try {
      const response = await axios.get(
        `${this.baseURL}/Trade/search`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          params: {
            accountId
          }
        }
      );

      if (!response.data || !Array.isArray(response.data)) {
        return []; // No trades yet is valid
      }

      return response.data;
    } catch (error) {
      console.error('ProjectX getTrades error:', error.response?.data || error.message);
      // Don't throw on trades error - some accounts might not have trades yet
      return [];
    }
  }

  /**
   * Calculate statistics from accounts and trades
   * @param {Array} accounts - Array of account objects from ProjectX
   * @param {Array} trades - Array of all trades from all accounts
   * @returns {Object} - Statistics object
   */
  calculateStats(accounts, trades) {
    // Calculate total balance across all accounts
    const totalBalance = accounts.reduce((sum, account) => {
      return sum + (parseFloat(account.balance) || 0);
    }, 0);

    // Calculate total profit from closed trades
    const closedTrades = trades.filter(trade => trade.status === 'closed');
    const totalProfit = closedTrades.reduce((sum, trade) => {
      return sum + (parseFloat(trade.profit) || 0);
    }, 0);

    // Calculate win rate
    const winningTrades = closedTrades.filter(trade => parseFloat(trade.profit) > 0);
    const winRate = closedTrades.length > 0 
      ? (winningTrades.length / closedTrades.length) * 100 
      : 0;

    // Calculate monthly profit (trades from last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const monthlyTrades = closedTrades.filter(trade => {
      const tradeDate = new Date(trade.closeTime || trade.openTime);
      return tradeDate >= thirtyDaysAgo;
    });
    
    const monthlyProfit = monthlyTrades.reduce((sum, trade) => {
      return sum + (parseFloat(trade.profit) || 0);
    }, 0);

    // Calculate verified payouts (accounts with withdrawals)
    const verifiedPayouts = accounts.reduce((sum, account) => {
      return sum + (parseFloat(account.totalWithdrawals) || 0);
    }, 0);

    return {
      totalProfit: parseFloat(totalProfit.toFixed(2)),
      totalBalance: parseFloat(totalBalance.toFixed(2)),
      winRate: parseFloat(winRate.toFixed(2)),
      monthlyProfit: parseFloat(monthlyProfit.toFixed(2)),
      verifiedPayouts: parseFloat(verifiedPayouts.toFixed(2)),
      totalTrades: closedTrades.length,
      accountCount: accounts.length
    };
  }

  /**
   * Full sync process for ProjectX
   * @param {string} username - ProjectX username
   * @param {string} apiKey - ProjectX API key (decrypted)
   * @returns {Promise<Object>} - Statistics object
   */
  async sync(username, apiKey) {
    try {
      console.log(`[ProjectX] Starting sync for ${username}`);

      // Step 1: Authenticate
      const token = await this.authenticate(username, apiKey);
      console.log(`[ProjectX] Authentication successful for ${username}`);

      // Step 2: Get all accounts
      const accounts = await this.getAccounts(token);
      console.log(`[ProjectX] Found ${accounts.length} accounts for ${username}`);

      // Step 3: Get trades for all accounts
      const allTrades = [];
      for (const account of accounts) {
        const trades = await this.getTrades(token, account.id);
        allTrades.push(...trades);
      }
      console.log(`[ProjectX] Found ${allTrades.length} total trades for ${username}`);

      // Step 4: Calculate statistics
      const stats = this.calculateStats(accounts, allTrades);
      console.log(`[ProjectX] Sync complete for ${username}:`, stats);

      return stats;
    } catch (error) {
      console.error(`[ProjectX] Sync failed for ${username}:`, error.message);
      throw error;
    }
  }
}

module.exports = ProjectXAdapter;
