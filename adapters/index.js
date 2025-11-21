const ProjectXAdapter = require('./projectx');
const CQGAdapter = require('./cqg');
const RithmicAdapter = require('./rithmic');

/**
 * Mapping of prop firms to their underlying platforms
 * Easy to add new firms without changing code
 */
const FIRM_TO_PLATFORM = {
  // ProjectX-based firms
  'lucid': 'projectx',
  'topstepx': 'projectx',
  'tictictrader': 'projectx',
  'goat': 'projectx',
  
  // CQG-based firms
  'ninjatrader': 'cqg',
  'tradovate': 'cqg',
  'tradingview': 'cqg',
  
  // Rithmic-based firms
  'motivewave': 'rithmic',
  'quantower': 'rithmic',
  'sierra-chart': 'rithmic',
};

/**
 * Mapping of ProjectX firms to their API subdomains
 */
const PROJECTX_SUBDOMAINS = {
  'lucid': 'https://api.lucidtrading.projectx.com/api',
  'topstepx': 'https://api.topstepx.projectx.com/api',
  'tictictrader': 'https://t3.projectx.com/api',
  'goat': 'https://api.goat.projectx.com/api',
};

/**
 * Platform adapter instances (singleton pattern)
 */
const adapters = {
  projectx: new ProjectXAdapter(),
  cqg: new CQGAdapter(),
  rithmic: new RithmicAdapter(),
};

/**
 * Get the platform name for a given prop firm
 * @param {string} firm - Prop firm name (e.g., 'lucid', 'ninjatrader')
 * @returns {string} - Platform name ('projectx', 'cqg', or 'rithmic')
 */
function getPlatformForFirm(firm) {
  const normalizedFirm = firm.toLowerCase().trim();
  const platform = FIRM_TO_PLATFORM[normalizedFirm];
  
  if (!platform) {
    throw new Error(`Unknown prop firm: ${firm}. Supported firms: ${Object.keys(FIRM_TO_PLATFORM).join(', ')}`);
  }
  
  return platform;
}

/**
 * Get the adapter instance for a given prop firm
 * @param {string} firm - Prop firm name (e.g., 'lucid', 'ninjatrader')
 * @returns {BaseAdapter} - Platform adapter instance
 */
function getAdapterForFirm(firm) {
  const platform = getPlatformForFirm(firm);
  return adapters[platform];
}

/**
 * Get the adapter instance for a given platform
 * @param {string} platform - Platform name ('projectx', 'cqg', or 'rithmic')
 * @returns {BaseAdapter} - Platform adapter instance
 */
function getAdapterForPlatform(platform) {
  const normalizedPlatform = platform.toLowerCase().trim();
  const adapter = adapters[normalizedPlatform];
  
  if (!adapter) {
    throw new Error(`Unknown platform: ${platform}. Supported platforms: ${Object.keys(adapters).join(', ')}`);
  }
  
  return adapter;
}

/**
 * Get list of all supported prop firms
 * @returns {Array<string>} - Array of supported firm names
 */
function getSupportedFirms() {
  return Object.keys(FIRM_TO_PLATFORM);
}

/**
 * Get list of all supported platforms
 * @returns {Array<string>} - Array of platform names
 */
function getSupportedPlatforms() {
  return Object.keys(adapters);
}

/**
 * Check if a prop firm is supported
 * @param {string} firm - Prop firm name
 * @returns {boolean} - True if supported
 */
function isFirmSupported(firm) {
  const normalizedFirm = firm.toLowerCase().trim();
  return normalizedFirm in FIRM_TO_PLATFORM;
}

/**
 * Check if a platform is implemented (not a stub)
 * @param {string} platform - Platform name
 * @returns {boolean} - True if fully implemented
 */
function isPlatformImplemented(platform) {
  // Only ProjectX is fully implemented right now
  return platform.toLowerCase() === 'projectx';
}

/**
 * Get the ProjectX API subdomain for a given firm
 * @param {string} firm - Prop firm name (e.g., 'lucid', 'topstepx')
 * @returns {string} - ProjectX API URL for that firm
 */
function getProjectXSubdomain(firm) {
  const normalizedFirm = firm.toLowerCase().trim();
  const subdomain = PROJECTX_SUBDOMAINS[normalizedFirm];
  
  if (!subdomain) {
    throw new Error(`Unknown ProjectX firm: ${firm}. Supported ProjectX firms: ${Object.keys(PROJECTX_SUBDOMAINS).join(', ')}`);
  }
  
  return subdomain;
}

module.exports = {
  getAdapterForFirm,
  getAdapterForPlatform,
  getPlatformForFirm,
  getProjectXSubdomain,
  getSupportedFirms,
  getSupportedPlatforms,
  isFirmSupported,
  isPlatformImplemented,
  FIRM_TO_PLATFORM,
  PROJECTX_SUBDOMAINS,
};
