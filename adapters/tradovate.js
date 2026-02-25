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
   * Get fills (executed trades) for a specific account.
   * Tradovate uses "fills" for executed orders.
   *
   * @param {Object} authContext - Auth context with accessToken
   * @param {string|number} accountId - Tradovate account ID
   * @param {Object} options - { startDate, endDate }
   */
  async getTrades(authContext, accountId, options = {}) {
    try {
      // Get fills (executed trades) for the account
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

      // Also get positions for P&L data
      let positions = [];
      try {
        const posResponse = await axios.get(
          `${this.baseURL}/position/list`,
          {
            headers: {
              'Authorization': `Bearer ${authContext.accessToken}`,
              'Content-Type': 'application/json',
            },
          }
        );
        positions = Array.isArray(posResponse.data)
          ? posResponse.data.filter(p => p.accountId === accountId)
          : [];
      } catch (e) {
        // Positions endpoint might fail for some account types
      }

      // Get cash balance changes for payout tracking
      let cashBalanceLog = [];
      try {
        const cashResponse = await axios.get(
          `${this.baseURL}/cashBalance/list`,
          {
            headers: {
              'Authorization': `Bearer ${authContext.accessToken}`,
              'Content-Type': 'application/json',
            },
          }
        );
        cashBalanceLog = Array.isArray(cashResponse.data)
          ? cashResponse.data.filter(c => c.accountId === accountId)
          : [];
      } catch (e) {
        // Cash balance log might not be available
      }

      // Normalize fills to our standard trade format
      return accountFills.map(fill => ({
        externalTradeId: String(fill.id),
        symbol: fill.contractId ? `contract-${fill.contractId}` : 'UNKNOWN',
        side: fill.action === 'Buy' ? 'buy' : 'sell',
        quantity: fill.qty || 1,
        entryPrice: parseFloat(fill.price) || 0,
        exitPrice: null, // Fills are individual - need to pair them for P&L
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
   * Get closed positions with P&L (more useful than individual fills).
   * This aggregates fills into round-trip trades.
   */
  async getClosedPositions(authContext, accountId) {
    try {
      // Tradovate doesn't have a direct "closed trades" endpoint,
      // so we use the order + fill data to reconstruct P&L.
      // For prop firm tracking, the cash balance changes are most reliable.
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

      // Filter for this account's realized P&L entries
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
      console.error('[Tradovate] getClosedPositions error:', error.message);
      return [];
    }
  }

  /**
   * Full sync process for Tradovate
   */
  async sync(credentials) {
    try {
      console.log(`[Tradovate] Starting sync for ${credentials.username}`);

      // Step 1: Authenticate
      const auth = await this.authenticate(credentials);
      console.log(`[Tradovate] Authenticated as ${auth.name} (userId: ${auth.userId})`);

      // Step 2: Get all accounts
      const accounts = await this.getAccounts(auth);
      console.log(`[Tradovate] Found ${accounts.length} accounts`);

      // Step 3: Get trades for all accounts
      const allTrades = [];
      for (const account of accounts) {
        // Prefer closed positions (aggregated P&L) over raw fills
        const trades = await this.getClosedPositions(auth, account.id);
        if (trades.length > 0) {
          allTrades.push(...trades);
        } else {
          // Fallback to fills
          const fills = await this.getTrades(auth, account.id);
          allTrades.push(...fills);
        }
      }
      console.log(`[Tradovate] Found ${allTrades.length} total trades`);

      // Step 4: Calculate statistics
      const stats = this.calculateStats(allTrades);
      console.log(`[Tradovate] Stats:`, stats);

      return {
        stats,
        trades: allTrades,
        accounts,
        auth: {
          accessToken: auth.accessToken,
          expirationTime: auth.expirationTime,
        },
      };
    } catch (error) {
      console.error(`[Tradovate] Sync failed for ${credentials.username}:`, error.message);
      throw error;
    }
  }
}

module.exports = TradovateAdapter;
