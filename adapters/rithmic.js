const BaseAdapter = require('./base');

/**
 * Rithmic Platform Adapter (STUB)
 * Ready for implementation when Rithmic API access is available
 * 
 * Platforms using Rithmic:
 * - MotiveWave
 * - Quantower
 * - Sierra Chart
 */
class RithmicAdapter extends BaseAdapter {
  constructor() {
    super();
    this.baseURL = process.env.RITHMIC_API_URL || 'https://api.rithmic.com';
  }

  /**
   * Authenticate with Rithmic API
   * TODO: Implement when Rithmic API documentation is available
   */
  async authenticate(username, apiKey) {
    throw new Error('Rithmic adapter not yet implemented. Please use ProjectX for now.');
  }

  /**
   * Get all accounts for a user
   * TODO: Implement when Rithmic API documentation is available
   */
  async getAccounts(token) {
    throw new Error('Rithmic adapter not yet implemented. Please use ProjectX for now.');
  }

  /**
   * Get trades for a specific account
   * TODO: Implement when Rithmic API documentation is available
   */
  async getTrades(token, accountId) {
    throw new Error('Rithmic adapter not yet implemented. Please use ProjectX for now.');
  }

  /**
   * Calculate statistics from accounts and trades
   * TODO: Adapt to Rithmic data structure when available
   */
  calculateStats(accounts, trades) {
    throw new Error('Rithmic adapter not yet implemented. Please use ProjectX for now.');
  }

  /**
   * Full sync process for Rithmic
   * TODO: Implement when Rithmic API documentation is available
   */
  async sync(username, apiKey) {
    throw new Error('Rithmic adapter not yet implemented. Please use ProjectX for now.');
  }
}

module.exports = RithmicAdapter;
