// ============================================
// SYNC ROUTES - Manual and Automated Syncing
// ============================================

const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { decrypt } = require('../utils/encryption');

// ============================================
// ADD/SYNC JIMMYFUTURES
// ============================================
// POST /api/sync/add-jimmy
// This is your WORKING endpoint - keeping it exactly as is!
// ============================================

router.post('/add-jimmy', async (req, res) => {
  try {
    const username = 'LTX-1TQ6BC70';
    const apiKey = 'AFT5z0/nScmV4f8nBiPJIxRUQiucEHgT5etoVfAe4TE=';
    const apiUrl = process.env.PROJECTX_API_URL;

    console.log('Adding JimmyFutures to database with real stats...');

    // Get combined stats
    const authResponse = await fetch(`${apiUrl}/Auth/loginKey`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userName: username, apiKey: apiKey })
    });

    const authData = await authResponse.json();
    if (!authData.success) throw new Error('Auth failed');
    const token = authData.token;

    const accountResponse = await fetch(`${apiUrl}/Account/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({})
    });

    const accountData = await accountResponse.json();
    const accounts = accountData.accounts || [];

    let totalBalance = 0;
    let totalProfit = 0;
    let monthlyProfit = 0;
    let totalTrades = 0;
    let winningTrades = 0;

    // Calculate month start (current month)
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    console.log('Fetching trades from all accounts...');

    for (const account of accounts) {
      totalBalance += account.balance;

      const tradesResponse = await fetch(`${apiUrl}/Trade/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ accountId: account.id })
      });

      const tradesData = await tradesResponse.json();
      const trades = tradesData.trades || [];

      for (const trade of trades) {
        if (trade.profitAndLoss !== null) {
          totalProfit += trade.profitAndLoss;
          totalTrades++;
          if (trade.profitAndLoss > 0) winningTrades++;

          // Add to monthly profit if trade is from this month
          const tradeDate = new Date(trade.creationTimestamp);
          if (tradeDate >= monthStart) {
            monthlyProfit += trade.profitAndLoss;
          }
        }
      }
    }

    const winRate = totalTrades > 0 ? ((winningTrades / totalTrades) * 100) : 0;

    console.log('Stats calculated:', { totalBalance, totalProfit, monthlyProfit, winRate, totalTrades });

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
        total_profit: totalProfit,
        verified_payouts: 0,
        monthly_profit: monthlyProfit,
        win_rate: winRate,
        updated_at: new Date().toISOString()
      }]);

    if (statsError) throw statsError;

    console.log('Stats updated successfully!');

    res.json({
      message: 'JimmyFutures added/updated successfully!',
      stats: {
        numberOfAccounts: accounts.length,
        totalBalance: totalBalance.toFixed(2),
        totalProfit: totalProfit.toFixed(2),
        monthlyProfit: monthlyProfit.toFixed(2),
        winRate: `${winRate.toFixed(2)}%`,
        totalTrades: totalTrades
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
// SYNC ALL TRADERS (NEW - For Cron Jobs)
// ============================================
// POST /api/sync/all
// This syncs ALL traders in the database
// Called by cron jobs at midnight, 8:30am, 3:30pm CST
// ============================================

async function syncSingleTrader(trader) {
  try {
    console.log(`Syncing trader: ${trader.twitter_username}`);
    
    const apiUrl = process.env.PROJECTX_API_URL;
    
    // Decrypt API key before using
    const decryptedApiKey = decrypt(trader.projectx_api_key);

    // Authenticate
    const authResponse = await fetch(`${apiUrl}/Auth/loginKey`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        userName: trader.projectx_username.trim(), 
        apiKey: decryptedApiKey 
      })
    });

    const authData = await authResponse.json();
    if (!authData.success) throw new Error('Auth failed');
    const token = authData.token;

    // Get all accounts
    const accountResponse = await fetch(`${apiUrl}/Account/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({})
    });

    const accountData = await accountResponse.json();
    const accounts = accountData.accounts || [];

    let totalProfit = 0;
    let monthlyProfit = 0;
    let totalTrades = 0;
    let winningTrades = 0;

    // Calculate month start
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Fetch trades for each account
    for (const account of accounts) {
      const tradesResponse = await fetch(`${apiUrl}/Trade/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ accountId: account.id })
      });

      const tradesData = await tradesResponse.json();
      const trades = tradesData.trades || [];

      for (const trade of trades) {
        if (trade.profitAndLoss !== null) {
          totalProfit += trade.profitAndLoss;
          totalTrades++;
          if (trade.profitAndLoss > 0) winningTrades++;

          const tradeDate = new Date(trade.creationTimestamp);
          if (tradeDate >= monthStart) {
            monthlyProfit += trade.profitAndLoss;
          }
        }
      }
    }

    const winRate = totalTrades > 0 ? ((winningTrades / totalTrades) * 100) : 0;

    // Update database
    await db
      .from('statistics')
      .delete()
      .eq('trader_id', trader.id);

    await db
      .from('statistics')
      .insert([{
        trader_id: trader.id,
        total_profit: totalProfit,
        verified_payouts: 0,
        monthly_profit: monthlyProfit,
        win_rate: winRate,
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
