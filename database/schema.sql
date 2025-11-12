-- ============================================
-- PROOF OF PIPS - DATABASE SCHEMA
-- ============================================
-- WHAT THIS FILE DOES:
-- Creates all the database tables you need
-- Run this in your Supabase SQL editor
-- ============================================

-- ============================================
-- TRADERS TABLE
-- ============================================
-- WHAT THIS STORES:
-- Basic info about each trader on your leaderboard
-- - Their Twitter username
-- - Their ProjectX credentials (to fetch data)
-- - When they joined
-- ============================================

CREATE TABLE IF NOT EXISTS traders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  twitter_username TEXT UNIQUE NOT NULL,
  avatar TEXT DEFAULT '👤',
  projectx_username TEXT NOT NULL,
  projectx_api_key TEXT NOT NULL, -- TODO: Should be encrypted!
  account_created TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- STATISTICS TABLE
-- ============================================
-- WHAT THIS STORES:
-- Trading performance data for each trader
-- This gets updated when you sync with ProjectX API
-- ============================================

CREATE TABLE IF NOT EXISTS statistics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_id UUID REFERENCES traders(id) ON DELETE CASCADE,
  total_profit DECIMAL(12, 2) DEFAULT 0,
  verified_payouts INTEGER DEFAULT 0,
  monthly_profit DECIMAL(12, 2) DEFAULT 0,
  win_rate DECIMAL(5, 2) DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure one stats record per trader
  UNIQUE(trader_id)
);

-- ============================================
-- INDEXES (for faster queries)
-- ============================================
-- WHAT THIS DOES:
-- Makes database queries faster when sorting/searching
-- Especially important for the leaderboard
-- ============================================

CREATE INDEX IF NOT EXISTS idx_traders_twitter ON traders(twitter_username);
CREATE INDEX IF NOT EXISTS idx_statistics_trader_id ON statistics(trader_id);
CREATE INDEX IF NOT EXISTS idx_statistics_total_profit ON statistics(total_profit DESC);

-- ============================================
-- SAMPLE DATA (for testing)
-- ============================================
-- WHAT THIS DOES:
-- Inserts a few fake traders so you can test the API
-- You can delete this later when you have real data
-- ============================================

-- Insert sample traders
INSERT INTO traders (twitter_username, avatar, projectx_username, projectx_api_key, account_created)
VALUES 
  ('JimmyFutures', '🏆', 'jimmy_demo', 'fake_key_123', '2023-03-01'),
  ('BullishBritt', '👑', 'britt_demo', 'fake_key_456', '2023-01-15'),
  ('TheTradingChamp', '💎', 'champ_demo', 'fake_key_789', '2023-06-10')
ON CONFLICT (twitter_username) DO NOTHING;

-- Insert sample statistics
INSERT INTO statistics (trader_id, total_profit, verified_payouts, monthly_profit, win_rate)
SELECT 
  id,
  127500.00,
  8,
  18200.00,
  68.5
FROM traders WHERE twitter_username = 'JimmyFutures'
ON CONFLICT (trader_id) DO NOTHING;

INSERT INTO statistics (trader_id, total_profit, verified_payouts, monthly_profit, win_rate)
SELECT 
  id,
  98300.00,
  12,
  15100.00,
  71.2
FROM traders WHERE twitter_username = 'BullishBritt'
ON CONFLICT (trader_id) DO NOTHING;

INSERT INTO statistics (trader_id, total_profit, verified_payouts, monthly_profit, win_rate)
SELECT 
  id,
  84750.00,
  6,
  14100.00,
  64.8
FROM traders WHERE twitter_username = 'TheTradingChamp'
ON CONFLICT (trader_id) DO NOTHING;

-- ============================================
-- DONE!
-- ============================================
-- After running this, you should see:
-- - 2 tables: traders and statistics
-- - 3 sample traders with stats
-- ============================================
