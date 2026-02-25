-- ============================================
-- PROOF OF PIPS - DATABASE SCHEMA (v2)
-- ============================================
-- Modernized for Tradovate + TradeSyncer integrations
-- Run this in your Supabase SQL editor
-- ============================================

-- ============================================
-- TRADERS TABLE
-- ============================================
-- Stores trader identity and connection method.
-- Traders connect via Tradovate or TradeSyncer (or both).
-- ============================================

CREATE TABLE IF NOT EXISTS traders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  twitter_username TEXT UNIQUE NOT NULL,
  avatar TEXT DEFAULT '👤',

  -- Connection method: 'tradovate', 'tradesyncer', or 'both'
  connection_type TEXT NOT NULL DEFAULT 'tradovate',

  -- Tradovate credentials (encrypted)
  tradovate_username TEXT,
  tradovate_access_token TEXT,       -- OAuth access token (encrypted)
  tradovate_refresh_token TEXT,      -- OAuth refresh token (encrypted)
  tradovate_token_expiry TIMESTAMP WITH TIME ZONE,
  tradovate_account_ids TEXT[],      -- Array of linked Tradovate account IDs

  -- TradeSyncer credentials (encrypted)
  tradesyncer_api_key TEXT,          -- Encrypted API key
  tradesyncer_account_id TEXT,       -- TradeSyncer account identifier

  -- Prop firm metadata
  prop_firm TEXT,                     -- e.g., 'topstep', 'apex', 'tradeday'
  prop_firm_display TEXT,             -- e.g., 'Topstep', 'Apex Trader Funding'

  account_created TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- STATISTICS TABLE
-- ============================================
-- Trading performance data synced from Tradovate/TradeSyncer.
-- Updated hourly by cron jobs.
-- ============================================

CREATE TABLE IF NOT EXISTS statistics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_id UUID REFERENCES traders(id) ON DELETE CASCADE,
  total_profit DECIMAL(12, 2) DEFAULT 0,
  verified_payouts INTEGER DEFAULT 0,
  monthly_profit DECIMAL(12, 2) DEFAULT 0,
  win_rate DECIMAL(5, 2) DEFAULT 0,
  total_trades INTEGER DEFAULT 0,
  avg_trade_pnl DECIMAL(10, 2) DEFAULT 0,
  best_trade DECIMAL(10, 2) DEFAULT 0,
  worst_trade DECIMAL(10, 2) DEFAULT 0,
  profit_factor DECIMAL(6, 2) DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(trader_id)
);

-- ============================================
-- TRADE HISTORY TABLE (new)
-- ============================================
-- Stores individual trades for detailed analytics.
-- Synced from Tradovate or TradeSyncer.
-- ============================================

CREATE TABLE IF NOT EXISTS trade_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_id UUID REFERENCES traders(id) ON DELETE CASCADE,
  external_trade_id TEXT,             -- Tradovate/TradeSyncer trade ID
  symbol TEXT NOT NULL,               -- e.g., 'ESH6', 'NQZ5'
  side TEXT NOT NULL,                 -- 'buy' or 'sell'
  quantity INTEGER NOT NULL DEFAULT 1,
  entry_price DECIMAL(12, 4),
  exit_price DECIMAL(12, 4),
  profit DECIMAL(10, 2),
  opened_at TIMESTAMP WITH TIME ZONE,
  closed_at TIMESTAMP WITH TIME ZONE,
  source TEXT DEFAULT 'tradovate',    -- 'tradovate' or 'tradesyncer'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- SYNC LOG TABLE (new)
-- ============================================
-- Tracks sync history for debugging and monitoring.
-- ============================================

CREATE TABLE IF NOT EXISTS sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_id UUID REFERENCES traders(id) ON DELETE CASCADE,
  source TEXT NOT NULL,               -- 'tradovate' or 'tradesyncer'
  status TEXT NOT NULL,               -- 'success', 'failed', 'partial'
  trades_synced INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_traders_twitter ON traders(twitter_username);
CREATE INDEX IF NOT EXISTS idx_traders_connection ON traders(connection_type);
CREATE INDEX IF NOT EXISTS idx_traders_prop_firm ON traders(prop_firm);
CREATE INDEX IF NOT EXISTS idx_statistics_trader_id ON statistics(trader_id);
CREATE INDEX IF NOT EXISTS idx_statistics_total_profit ON statistics(total_profit DESC);
CREATE INDEX IF NOT EXISTS idx_trade_history_trader_id ON trade_history(trader_id);
CREATE INDEX IF NOT EXISTS idx_trade_history_closed_at ON trade_history(closed_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_log_trader_id ON sync_log(trader_id);

-- ============================================
-- MIGRATION: Add new columns to existing tables
-- ============================================
-- Run these if upgrading from v1 schema:
--
-- ALTER TABLE traders ADD COLUMN IF NOT EXISTS connection_type TEXT DEFAULT 'tradovate';
-- ALTER TABLE traders ADD COLUMN IF NOT EXISTS tradovate_username TEXT;
-- ALTER TABLE traders ADD COLUMN IF NOT EXISTS tradovate_access_token TEXT;
-- ALTER TABLE traders ADD COLUMN IF NOT EXISTS tradovate_refresh_token TEXT;
-- ALTER TABLE traders ADD COLUMN IF NOT EXISTS tradovate_token_expiry TIMESTAMP WITH TIME ZONE;
-- ALTER TABLE traders ADD COLUMN IF NOT EXISTS tradovate_account_ids TEXT[];
-- ALTER TABLE traders ADD COLUMN IF NOT EXISTS tradesyncer_api_key TEXT;
-- ALTER TABLE traders ADD COLUMN IF NOT EXISTS tradesyncer_account_id TEXT;
-- ALTER TABLE traders ADD COLUMN IF NOT EXISTS prop_firm TEXT;
-- ALTER TABLE traders ADD COLUMN IF NOT EXISTS prop_firm_display TEXT;
-- ALTER TABLE statistics ADD COLUMN IF NOT EXISTS total_trades INTEGER DEFAULT 0;
-- ALTER TABLE statistics ADD COLUMN IF NOT EXISTS avg_trade_pnl DECIMAL(10, 2) DEFAULT 0;
-- ALTER TABLE statistics ADD COLUMN IF NOT EXISTS best_trade DECIMAL(10, 2) DEFAULT 0;
-- ALTER TABLE statistics ADD COLUMN IF NOT EXISTS worst_trade DECIMAL(10, 2) DEFAULT 0;
-- ALTER TABLE statistics ADD COLUMN IF NOT EXISTS profit_factor DECIMAL(6, 2) DEFAULT 0;
-- ============================================
