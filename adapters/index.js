const TradovateAdapter = require('./tradovate');
const TradeSyncerAdapter = require('./tradesyncer');

/**
 * Supported connection types and their adapters.
 * Traders connect via Tradovate (execution platform) or TradeSyncer (sync service).
 */
const adapters = {
  tradovate: new TradovateAdapter(),
  tradesyncer: new TradeSyncerAdapter(),
};

/**
 * Prop firms and which connection types they support.
 * Most firms flow through Tradovate for execution.
 * TradeSyncer works across all of them as a third-party sync layer.
 */
const PROP_FIRMS = {
  'topstep':             { display: 'Topstep',               connections: ['tradovate', 'tradesyncer'] },
  'apex':                { display: 'Apex Trader Funding',    connections: ['tradovate', 'tradesyncer'] },
  'tradeday':            { display: 'TradeDay',               connections: ['tradovate', 'tradesyncer'] },
  'take-profit-trader':  { display: 'Take Profit Trader',     connections: ['tradovate', 'tradesyncer'] },
  'my-funded-futures':   { display: 'My Funded Futures',      connections: ['tradovate', 'tradesyncer'] },
  'elite-trader-funding':{ display: 'Elite Trader Funding',   connections: ['tradovate', 'tradesyncer'] },
  'bulenox':             { display: 'Bulenox',                connections: ['tradovate', 'tradesyncer'] },
  'tradeify':            { display: 'Tradeify',               connections: ['tradovate', 'tradesyncer'] },
  'fundednext-futures':  { display: 'FundedNext Futures',     connections: ['tradovate', 'tradesyncer'] },
  'oneup-trader':        { display: 'OneUp Trader',           connections: ['tradovate', 'tradesyncer'] },
  'blusky-trading':      { display: 'BluSky Trading',         connections: ['tradovate', 'tradesyncer'] },
  'fxify-futures':       { display: 'FXIFY Futures',          connections: ['tradovate', 'tradesyncer'] },
  'the-trading-pit':     { display: 'The Trading Pit',        connections: ['tradovate', 'tradesyncer'] },
  'leeloo-trading':      { display: 'Leeloo Trading',         connections: ['tradovate', 'tradesyncer'] },
  'other':               { display: 'Other',                  connections: ['tradovate', 'tradesyncer'] },
};

/**
 * Get the adapter instance for a connection type
 * @param {string} connectionType - 'tradovate' or 'tradesyncer'
 * @returns {BaseAdapter}
 */
function getAdapter(connectionType) {
  const adapter = adapters[connectionType];
  if (!adapter) {
    throw new Error(`Unknown connection type: ${connectionType}. Use 'tradovate' or 'tradesyncer'.`);
  }
  return adapter;
}

/**
 * Get prop firm info
 * @param {string} firmKey - Prop firm key (e.g., 'topstep')
 * @returns {Object|null}
 */
function getPropFirm(firmKey) {
  return PROP_FIRMS[firmKey] || null;
}

/**
 * Get list of all supported prop firms
 * @returns {Array<{key: string, display: string, connections: string[]}>}
 */
function getSupportedFirms() {
  return Object.entries(PROP_FIRMS).map(([key, info]) => ({
    key,
    display: info.display,
    connections: info.connections,
  }));
}

/**
 * Check if a connection type is supported
 * @param {string} type - Connection type
 * @returns {boolean}
 */
function isConnectionSupported(type) {
  return type in adapters;
}

module.exports = {
  getAdapter,
  getPropFirm,
  getSupportedFirms,
  isConnectionSupported,
  PROP_FIRMS,
};
