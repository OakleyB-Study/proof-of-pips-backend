const ProjectXAdapter = require('./projectx');
const CQGAdapter = require('./cqg');
const RithmicAdapter = require('./rithmic');

/**
 * List of all supported prop firms
 */
const SUPPORTED_FIRMS = [
  'apex-trader-funding',
  'topstep',
  'fxify-futures',
  'elite-trader-funding',
  'take-profit-trader',
  'my-funded-futures',
  'tradeday',
  'fundednext-futures',
  'blusky-trading',
  'tradeify',
  'oneup-trader',
  'fundingticks',
  'daytraders',
  'the-trading-pit',
  'top-one-futures',
  'for-traders',
  'hola-prime',
  'brightfunded',
  'liberty-market-investment',
  '4proptrader',
  'darwinex-zero',
  'the5percenters',
  'the-funded-trader',
  'straight-to-funded',
  'bulenox'
];

/**
 * Firms that ONLY support one platform (no choice)
 * Topstep only uses ProjectX
 */
const FIRM_PLATFORM_LOCKED = {
  'topstep': 'projectx'
};

/**
 * Mapping of ProjectX firms to their API subdomains
 */
const PROJECTX_SUBDOMAINS = {
  'topstep': 'https://api.topstepx.projectx.com/api'
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
 * Get the platform for a given prop firm and user choice
 * @param {string} firm - Prop firm name
 * @param {string} platformChoice - User's platform choice ('cqg' or 'rithmic'), optional
 * @returns {string} - Platform name ('projectx', 'cqg', or 'rithmic')
 */
function getPlatformForFirm(firm, platformChoice = null) {
  const normalizedFirm = firm.toLowerCase().trim();
  
  // Check if firm is supported
  if (!SUPPORTED_FIRMS.includes(normalizedFirm)) {
    throw new Error(`Unknown prop firm: ${firm}. Supported firms: ${SUPPORTED_FIRMS.join(', ')}`);
  }
  
  // Check if firm has locked platform (like Topstep)
  if (FIRM_PLATFORM_LOCKED[normalizedFirm]) {
    return FIRM_PLATFORM_LOCKED[normalizedFirm];
  }
  
  // All other firms require user to choose CQG or Rithmic
  if (!platformChoice) {
    throw new Error(`${firm} requires platform selection (CQG or Rithmic)`);
  }
  
  const normalizedChoice = platformChoice.toLowerCase().trim();
  if (normalizedChoice !== 'cqg' && normalizedChoice !== 'rithmic') {
    throw new Error(`Invalid platform choice: ${platformChoice}. Must be 'cqg' or 'rithmic'`);
  }
  
  return normalizedChoice;
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
 * @returns {Array<Object>} - Array of firm objects with metadata
 */
function getSupportedFirms() {
  return SUPPORTED_FIRMS.map(firm => {
    const platformLocked = FIRM_PLATFORM_LOCKED[firm];
    return {
      id: firm,
      name: firm.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
      platformLocked: platformLocked || null,
      requiresPlatformChoice: !platformLocked
    };
  });
}

/**
 * Check if a prop firm is supported
 * @param {string} firm - Prop firm name
 * @returns {boolean} - True if supported
 */
function isFirmSupported(firm) {
  const normalizedFirm = firm.toLowerCase().trim();
  return SUPPORTED_FIRMS.includes(normalizedFirm);
}

/**
 * Check if a firm requires platform choice
 * @param {string} firm - Prop firm name
 * @returns {boolean} - True if user must choose platform
 */
function requiresPlatformChoice(firm) {
  const normalizedFirm = firm.toLowerCase().trim();
  return !FIRM_PLATFORM_LOCKED[normalizedFirm];
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
  getAdapterForPlatform,
  getPlatformForFirm,
  getProjectXSubdomain,
  getSupportedFirms,
  isFirmSupported,
  requiresPlatformChoice,
  SUPPORTED_FIRMS,
  FIRM_PLATFORM_LOCKED,
  PROJECTX_SUBDOMAINS,
};
