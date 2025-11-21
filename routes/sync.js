// ============================================
// SYNC ROUTES - Manual and Automated Syncing
// ============================================

const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { decrypt } = require('../utils/encryption');
const { getAdapterForFirm, getAdapterForPlatform, getProjectXSubdomain } = require('../adapters');

// ============================================
// ADD/SYNC JIMMYFUTURES
// ============================================
// POST /api/sync/add-jimmy
// This is your WORKING endpoint - now uses adapter system!
// ============================================

router.post('/add-jimmy', async (req, res) => {
  try {
    const username = 'LTX-1TQ6BC70';
    const encryptedApiKey = 'AFT5z0/nScmV4f8nBiPJIxRUQiucEHgT5etoVfAe4TE=';
    const apiKey = decrypt(encryptedApiKey); // Decrypt before using!

    console.log('Adding JimmyFutures to database with real stats...');

    // Use ProjectX adapter with Lucid's URL (Jimmy uses Lucid)
    const adapter = getAdapterForPlatform('projectx');
    adapter.baseURL = 'https://api.lucidtrading.projectx.com/api';
    const stats = await adapter.sync(username, apiKey);

    console.log('Stats calculated:', stats);

    // Get or create trader
    let { data: trader, error: traderError } = await db
      .from('traders')
      .select('id')
      .eq('twitter_username', 'JimmyFutures')
      .single();

    let traderId;

    if (!trader) {
      // Create trader if doesn't exist
      const { data: newTrader, error: insertError } = await db
        .from('traders')
        .insert([{
          twitter_username: 'JimmyFutures',
          avatar: '🏆',
          projectx_username: username,
          projectx_api_key: apiKey,
          account_created: new Date().toISOString()
        }])
        .select()
        .single();

      if (insertError) throw insertError;
      traderId = newTrader.id;
      console.log('Created new JimmyFutures');
    } else {
      traderId = trader.id;
      console.log('Found existing JimmyFutures, updating stats...');
    }

    // Delete old stats if they exist
    await db
      .from('statistics')
      .delete()
      .eq('trader_id', traderId);

    // Insert fresh stats
    const { error: statsError } = await db
      .from('statistics')
      .insert([{
        trader_id: traderId,
        total_profit: stats.totalProfit,
        verified_payouts: stats.verifiedPayouts,
        monthly_profit: stats.monthlyProfit,
        win_rate: stats.winRate,
        updated_at: new Date().toISOString()
      }]);

    if (statsError) throw statsError;

    console.log('Stats updated successfully!');

    res.json({
      message: 'JimmyFutures added/updated successfully!',
      stats: {
        numberOfAccounts: stats.accountCount,
        totalBalance: stats.totalBalance.toFixed(2),
        totalProfit: stats.totalProfit.toFixed(2),
        monthlyProfit: stats.monthlyProfit.toFixed(2),
        winRate: `${stats.winRate.toFixed(2)}%`,
        totalTrades: stats.totalTrades
      }
    });
  } catch (error) {
    console.error('Error adding JimmyFutures:', error);
    res.status(500).json({ 
      error: 'Failed to add JimmyFutures',
      message: error.message
    });
  }
});

// ============================================
// SYNC ALL TRADERS (For Cron Jobs)
// ============================================
// POST /api/sync/all
// This syncs ALL traders in the database
// Called by cron jobs at midnight, 8:30am, 3:30pm CST
// Now supports multiple platforms!
// ============================================

async function syncSingleTrader(trader) {
  try {
    console.log(`Syncing trader: ${trader.twitter_username}`);
    
    // Decrypt API key before using
    const decryptedApiKey = decrypt(trader.projectx_api_key);

    // Get the correct adapter based on trader's firm
    const adapter = getAdapterForPlatform('projectx');
    
    // If trader has a firm, set the correct ProjectX subdomain
    if (trader.firm) {
      adapter.baseURL = getProjectXSubdomain(trader.firm);
      console.log(`Using ${trader.firm} subdomain: ${adapter.baseURL}`);
    }
    
    // Sync using adapter (handles all API calls and calculations)
    const stats = await adapter.sync(trader.projectx_username.trim(), decryptedApiKey);

    // Update database with new stats
    await db
      .from('statistics')
      .delete()
      .eq('trader_id', trader.id);

    await db
      .from('statistics')
      .insert([{
        trader_id: trader.id,
        total_profit: stats.totalProfit,
        verified_payouts: stats.verifiedPayouts,
        monthly_profit: stats.monthlyProfit,
        win_rate: stats.winRate,
        updated_at: new Date().toISOString()
      }]);

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
    const { data: traders, error } = await db
      .from('traders')
      .select('*');

    if (error) throw error;

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
      const result = await syncSingleTrader(trader);
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
