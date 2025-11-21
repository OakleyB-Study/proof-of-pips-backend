const BaseAdapter = require('./base');

/**
 * CQG Platform Adapter (STUB)
 * Ready for implementation when CQG API access is available
 * 
 * Platforms using CQG:
 * - NinjaTrader PROP
 * - Tradovate Prop
 * - TradingView
 */
class CQGAdapter extends BaseAdapter {
  constructor() {
    super();
    this.baseURL = process.env.CQG_API_URL || 'https://api.cqg.com';
  }

  /**
   * Authenticate with CQG API
   * TODO: Implement when CQG API documentation is available
   */
  async authenticate(username, apiKey) {
    throw new Error('CQG adapter not yet implemented. Please use ProjectX for now.');
  }

  /**
   * Get all accounts for a user
   * TODO: Implement when CQG API documentation is available
   */
  async getAccounts(token) {
    throw new Error('CQG adapter not yet implemented. Please use ProjectX for now.');
  }

  /**
   * Get trades for a specific account
   * TODO: Implement when CQG API documentation is available
   */
  async getTrades(token, accountId) {
    throw new Error('CQG adapter not yet implemented. Please use ProjectX for now.');
  }

  /**
   * Calculate statistics from accounts and trades
   * TODO: Adapt to CQG data structure when available
   */
  calculateStats(accounts, trades) {
    throw new Error('CQG adapter not yet implemented. Please use ProjectX for now.');
  }

  /**
   * Full sync process for CQG
   * TODO: Implement when CQG API documentation is available
   */
  async sync(username, apiKey) {
    throw new Error('CQG adapter not yet implemented. Please use ProjectX for now.');
  }
}

module.exports = CQGAdapter;
