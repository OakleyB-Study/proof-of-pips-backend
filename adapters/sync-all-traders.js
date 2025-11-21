// backend/routes/sync-all-traders.js
// This endpoint syncs ALL traders in the database

const express = require('express');
const router = express.Router();
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Your existing sync logic from add-jimmy, but made generic
async function syncTrader(trader) {
  try {
    console.log(`Syncing trader: ${trader.twitter_username}`);
    
    // 1. Authenticate with ProjectX
    const authResponse = await axios.post('https://api.lucidtrading.projectx.com/api/authenticate', {
      username: trader.projectx_username,
      apiKey: trader.projectx_api_key
    });

    const token = authResponse.data.token;

    // 2. Get all accounts
    const accountsResponse = await axios.get('https://api.lucidtrading.projectx.com/api/accounts', {
      headers: { Authorization: `Bearer ${token}` }
    });

    const accounts = accountsResponse.data;
    let totalProfit = 0;
    let monthlyProfit = 0;
    let totalTrades = 0;
    let winningTrades = 0;

    // 3. Get trades for each account
    for (const account of accounts) {
      const tradesResponse = await axios.get(
        `https://api.lucidtrading.projectx.com/api/accounts/${account.id}/trades`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const trades = tradesResponse.data;

      // Calculate stats
      trades.forEach(trade => {
        const profit = parseFloat(trade.profitLoss || 0);
        totalProfit += profit;
        totalTrades++;
        
        if (profit > 0) winningTrades++;

        // Check if trade is in current month (Nov 2025)
        const tradeDate = new Date(trade.date);
        const now = new Date();
        if (tradeDate.getMonth() === now.getMonth() && tradeDate.getFullYear() === now.getFullYear()) {
          monthlyProfit += profit;
        }
      });
    }

    const winRate = totalTrades > 0 ? ((winningTrades / totalTrades) * 100).toFixed(2) : 0;

    // 4. Update database
    const { data: existingStats } = await supabase
      .from('statistics')
      .select('*')
      .eq('trader_id', trader.id)
      .single();

    const statsData = {
      trader_id: trader.id,
      total_profit: totalProfit,
      monthly_profit: monthlyProfit,
      win_rate: parseFloat(winRate),
      verified_payouts: 0,
      updated_at: new Date().toISOString()
    };

    if (existingStats) {
      await supabase
        .from('statistics')
        .update(statsData)
        .eq('trader_id', trader.id);
    } else {
      await supabase
        .from('statistics')
        .insert([statsData]);
    }

    console.log(`✅ Successfully synced ${trader.twitter_username}`);
    return { success: true, trader: trader.twitter_username };

  } catch (error) {
    console.error(`❌ Error syncing ${trader.twitter_username}:`, error.message);
    return { success: false, trader: trader.twitter_username, error: error.message };
  }
}

router.post('/all', async (req, res) => {
  try {
    console.log('🔄 Starting sync for all traders...');

    // Get all traders from database
    const { data: traders, error } = await supabase
      .from('traders')
      .select('*');

    if (error) {
      throw error;
    }

    if (!traders || traders.length === 0) {
      return res.json({
        success: true,
        message: 'No traders to sync',
        results: []
      });
    }

    // Sync each trader
    const results = [];
    for (const trader of traders) {
      const result = await syncTrader(trader);
      results.push(result);
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    console.log(`✅ Sync complete: ${successCount} successful, ${failCount} failed`);

    res.json({
      success: true,
      message: `Synced ${successCount} traders successfully`,
      results: results
    });

  } catch (error) {
    console.error('Error in sync-all:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;