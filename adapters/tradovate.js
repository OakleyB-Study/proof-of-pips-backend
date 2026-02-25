const axios = require('axios');
const BaseAdapter = require('./base');

/**
 * Tradovate API Adapter
 *
 * Tradovate is the execution platform used by most prop firms.
 * Their REST API provides access to accounts, orders, positions, and fills.
 *
 * API Docs: https://api.tradovate.com
 *
 * Auth flow:
 *   1. POST /auth/accesstokenrequest with username/password or API key
 *   2. Receive accessToken + expirationTime
 *   3. Use Bearer token for all subsequent requests
 *   4. Refresh via /auth/renewaccesstoken before expiry
 *
 * Environments:
 *   - Demo: https://demo.tradovateapi.com/v1
 *   - Live: https://live.tradovateapi.com/v1
 */
class TradovateAdapter extends BaseAdapter {
  constructor() {
    super();
    this.demoURL = 'https://demo.tradovateapi.com/v1';
    this.liveURL = 'https://live.tradovateapi.com/v1';
    this.baseURL = this.demoURL; // Default to demo (most prop firms use demo env)
  }

  /**
   * Set the environment (demo or live)
   */
  setEnvironment(env) {
    this.baseURL = env === 'live' ? this.liveURL : this.demoURL;
  }

  /**
   * Authenticate with Tradovate API
   * Supports both password-based and API key auth.
   *
   * @param {Object} credentials
   * @param {string} credentials.username - Tradovate username
   * @param {string} [credentials.password] - Tradovate password
   * @param {string} [credentials.apiKey] - Tradovate API key (sec/cid pair)
   * @param {string} [credentials.secretKey] - Tradovate secret key
   * @param {string} [credentials.deviceId] - Unique device identifier
   * @param {string} [credentials.appId] - Application identifier
   * @param {number} [credentials.appVersion] - App version string
   * @returns {Promise<Object>} - { accessToken, expirationTime, userId }
   */
  async authenticate(credentials) {
    try {
      const body = {
        name: credentials.username,
        password: credentials.password || '',
        appId: credentials.appId || 'ProofOfPips',
        appVersion: credentials.appVersion || '1.0',
        deviceId: credentials.deviceId || `pop-${credentials.username}`,
        cid: credentials.clientId || '',
        sec: credentials.secretKey || '',
      };

      const response = await axios.post(
        `${this.baseURL}/auth/accesstokenrequest`,
        body,
        { headers: { 'Content-Type': 'application/json' } }
      );

      if (!response.data || !response.data.accessToken) {
        throw new Error(response.data?.errorText || 'No access token received from Tradovate');
      }

      return {
        accessToken: response.data.accessToken,
        expirationTime: response.data.expirationTime,
        userId: response.data.userId,
        name: response.data.name,
        hasLive: response.data.hasLive || false,
        userStatus: response.data.userStatus || 'Unknown',
      };
    } catch (error) {
      const msg = error.response?.data?.errorText || error.response?.data?.['p-ticket'] || error.message;
      console.error('[Tradovate] Authentication error:', msg);
      throw new Error(`Tradovate authentication failed: ${msg}`);
    }
  }

  /**
   * Renew an existing access token
   */
  async renewToken(accessToken) {
    try {
      const response = await axios.post(
        `${this.baseURL}/auth/renewaccesstoken`,
        {},
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );
      return {
        accessToken: response.data.accessToken,
        expirationTime: response.data.expirationTime,
      };
    } catch (error) {
      console.error('[Tradovate] Token renewal error:', error.message);
      throw new Error('Failed to renew Tradovate access token');
    }
  }

  /**
   * Get all accounts for the authenticated user
   */
  async getAccounts(authContext) {
    try {
      const response = await axios.get(
        `${this.baseURL}/account/list`,
        {
          headers: {
            'Authorization': `Bearer ${authContext.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!Array.isArray(response.data)) {
        return [];
      }

      return response.data.map(account => ({
        id: account.id,
        name: account.name,
        displayName: account.nickname || account.name,
        balance: parseFloat(account.cashBalance) || 0,
        active: account.active,
        accountType: account.accountType,
      }));
    } catch (error) {
      console.error('[Tradovate] getAccounts error:', error.response?.data || error.message);
      throw new Error(`Failed to fetch Tradovate accounts: ${error.message}`);
    }
  }

  /**
   * Get fill pairs (round-trip trades) for a specific account.
   * fillPair/list returns matched entry+exit fills with proper P&L.
   * This is the most accurate source of trade P&L data from Tradovate.
   *
   * @param {Object} authContext - Auth context with accessToken
   * @param {string|number} accountId - Tradovate account ID
   * @returns {Promise<Array>} - Normalized trades with entry/exit and P&L
   */
  async getFillPairs(authContext, accountId) {
    try {
      const response = await axios.get(
        `${this.baseURL}/fillPair/list`,
        {
          headers: {
            'Authorization': `Bearer ${authContext.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!Array.isArray(response.data)) {
        return [];
      }

      // Filter for this account and normalize to our format
      return response.data
        .filter(pair => pair.accountId === accountId)
        .map(pair => ({
          externalTradeId: String(pair.id),
          symbol: pair.contractId ? `contract-${pair.contractId}` : 'UNKNOWN',
          side: pair.isBuy ? 'buy' : 'sell',
          quantity: pair.qty || 1,
          entryPrice: parseFloat(pair.buyPrice || pair.price) || 0,
          exitPrice: parseFloat(pair.sellPrice) || 0,
          profit: parseFloat(pair.pnl) || 0,
          openedAt: pair.buyTimestamp || pair.timestamp,
          closedAt: pair.sellTimestamp || pair.timestamp,
          source: 'tradovate',
        }));
    } catch (error) {
      console.error('[Tradovate] getFillPairs error:', error.response?.data || error.message);
      return [];
    }
  }

  /**
   * Get individual fills (executed trades) for a specific account.
   * Used as fallback when fillPair/list returns no data.
   *
   * @param {Object} authContext - Auth context with accessToken
   * @param {string|number} accountId - Tradovate account ID
   * @param {Object} options - { startDate, endDate }
   */
  async getTrades(authContext, accountId, options = {}) {
    try {
      const response = await axios.get(
        `${this.baseURL}/fill/list`,
        {
          headers: {
            'Authorization': `Bearer ${authContext.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!Array.isArray(response.data)) {
        return [];
      }

      // Filter fills for this specific account
      const accountFills = response.data.filter(fill => fill.accountId === accountId);

      return accountFills.map(fill => ({
        externalTradeId: String(fill.id),
        symbol: fill.contractId ? `contract-${fill.contractId}` : 'UNKNOWN',
        side: fill.action === 'Buy' ? 'buy' : 'sell',
        quantity: fill.qty || 1,
        entryPrice: parseFloat(fill.price) || 0,
        exitPrice: null,
        profit: parseFloat(fill.pnl) || 0,
        openedAt: fill.timestamp,
        closedAt: fill.timestamp,
        source: 'tradovate',
      }));
    } catch (error) {
      console.error('[Tradovate] getTrades error:', error.response?.data || error.message);
      return [];
    }
  }

  /**
   * Get cash balance P&L entries as last-resort fallback.
   * Less detailed than fillPairs but always available.
   */
  async getCashBalanceTrades(authContext, accountId) {
    try {
      const response = await axios.get(
        `${this.baseURL}/cashBalance/list`,
        {
          headers: {
            'Authorization': `Bearer ${authContext.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!Array.isArray(response.data)) {
        return [];
      }

      return response.data
        .filter(entry => entry.accountId === accountId && entry.cashChangeType === 'TradePnL')
        .map(entry => ({
          externalTradeId: String(entry.id),
          symbol: entry.contractId ? `contract-${entry.contractId}` : 'UNKNOWN',
          side: 'unknown',
          quantity: 1,
          entryPrice: 0,
          exitPrice: 0,
          profit: parseFloat(entry.amount) || 0,
          openedAt: entry.timestamp,
          closedAt: entry.timestamp,
          source: 'tradovate',
        }));
    } catch (error) {
      console.error('[Tradovate] getCashBalanceTrades error:', error.message);
      return [];
    }
  }

  /**
   * Full sync process for Tradovate.
   *
   * Trade data priority:
   *   1. fillPair/list - round-trip trades with entry/exit/P&L (best)
   *   2. fill/list     - individual fills (less context)
   *   3. cashBalance/list - realized P&L entries (last resort)
   */
  async sync(credentials) {
    try {
      console.log(`[Tradovate] Starting sync for ${credentials.username}`);

      // Step 1: Authenticate
      const auth = await this.authenticate(credentials);
      console.log(`[Tradovate] Authenticated as ${auth.name} (userId: ${auth.userId}, hasLive: ${auth.hasLive})`);

      // Step 2: Get all accounts
      const accounts = await this.getAccounts(auth);
      console.log(`[Tradovate] Found ${accounts.length} accounts`);

      // Step 3: Get trades for all accounts (priority: fillPairs > fills > cashBalance)
      const allTrades = [];
      for (const account of accounts) {
        // Try fillPair/list first (round-trip trades with proper P&L)
        let trades = await this.getFillPairs(auth, account.id);

        if (trades.length === 0) {
          // Fallback to individual fills
          trades = await this.getTrades(auth, account.id);
        }

        if (trades.length === 0) {
          // Last resort: cash balance P&L entries
          trades = await this.getCashBalanceTrades(auth, account.id);
        }

        allTrades.push(...trades);
      }
      console.log(`[Tradovate] Found ${allTrades.length} total trades`);

      // Step 4: Calculate statistics
      const stats = this.calculateStats(allTrades);

      return {
        stats,
        trades: allTrades,
        accounts,
        auth: {
          accessToken: auth.accessToken,
          expirationTime: auth.expirationTime,
          hasLive: auth.hasLive,
          userStatus: auth.userStatus,
        },
      };
    } catch (error) {
      console.error(`[Tradovate] Sync failed for ${credentials.username}:`, error.message);
      throw error;
    }
  }
}

module.exports = TradovateAdapter;
