// ============================================
// SYNC ROUTES
// ============================================
// WHAT THIS FILE DOES:
// Handles syncing data from ProjectX API to your database
// This runs periodically (e.g., every hour) to update trader stats
// ============================================

const express = require('express');
const router = express.Router();
const db = require('../config/database');

// ============================================
// PROJECTX API HELPER FUNCTION
// ============================================
// WHAT THIS DOES:
// Connects to ProjectX API and fetches account data
// ============================================

async function fetchProjectXData(username, apiKey, apiUrl) {
  try {
    // Step 1: Authenticate
    const authResponse = await fetch(`${apiUrl}/Auth/loginKey`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userName: username,
        apiKey: apiKey
      })
    });

    if (!authResponse.ok) {
      throw new Error('ProjectX authentication failed');
    }

    const authData = await authResponse.json();
    
    // Check if authentication was successful
    if (!authData.success || authData.errorCode !== 0) {
      throw new Error(authData.errorMessage || 'Authentication failed');
    }
    
    const token = authData.token;

    // Step 2: Get account data
    const accountResponse = await fetch(`${apiUrl}/Account/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({})
    });

    if (!accountResponse.ok) {
      throw new Error('Failed to fetch account data');
    }

    const accounts = await accountResponse.json();
    
    // Return the first account's data
    // You might want to handle multiple accounts differently
    return accounts[0] || accounts;
  } catch (error) {
    console.error('ProjectX API Error:', error);
    throw error;
  }
}

// ============================================
// SYNC SINGLE TRADER
// ============================================
// WHAT THIS DOES:
// Syncs data for one specific trader
// 
// CALL THIS: POST /api/sync/trader/:username
// ============================================

router.post('/trader/:username', async (req, res) => {
  try {
    const { username } = req.params;

    // Get trader's ProjectX credentials from database
    const { data: trader, error: traderError } = await db
      .from('traders')
      .select('id, projectx_api_key, projectx_username')
      .eq('twitter_username', username)
      .single();

    if (traderError || !trader) {
      return res.status(404).json({ error: 'Trader not found' });
    }

    // Fetch fresh data from ProjectX
    const projectxData = await fetchProjectXData(
      trader.projectx_username,
      trader.projectx_api_key,
      process.env.PROJECTX_API_URL
    );

    // Extract relevant stats from ProjectX response
    // NOTE: These field names might be different - check your actual API response
    const stats = {
      total_profit: projectxData.totalPnL || 0,
      monthly_profit: projectxData.monthlyPnL || 0,
      win_rate: projectxData.winRate || 0,
      // verified_payouts might need to be calculated or tracked separately
      verified_payouts: projectxData.payoutsCount || 0,
    };

    // Update or insert statistics
    const { error: statsError } = await db
      .from('statistics')
      .upsert({
        trader_id: trader.id,
        ...stats,
        updated_at: new Date().toISOString()
      });

    if (statsError) throw statsError;

    res.json({ 
      message: 'Trader synced successfully',
      stats 
    });
  } catch (error) {
    console.error('Error syncing trader:', error);
    res.status(500).json({ error: 'Failed to sync trader data' });
  }
});

// ============================================
// SYNC ALL TRADERS
// ============================================
// WHAT THIS DOES:
// Syncs data for ALL traders in your database
// This should run on a schedule (cron job)
// 
// CALL THIS: POST /api/sync/all
// ============================================

router.post('/all', async (req, res) => {
  try {
    // Get all traders
    const { data: traders, error } = await db
      .from('traders')
      .select('*');

    if (error) throw error;

    const results = {
      total: traders.length,
      successful: 0,
      failed: 0,
      errors: []
    };

    // Sync each trader
    for (const trader of traders) {
      try {
        const projectxData = await fetchProjectXData(
          trader.projectx_username,
          trader.projectx_api_key,
          process.env.PROJECTX_API_URL
        );

        const stats = {
          total_profit: projectxData.totalPnL || 0,
          monthly_profit: projectxData.monthlyPnL || 0,
          win_rate: projectxData.winRate || 0,
          verified_payouts: projectxData.payoutsCount || 0,
        };

        await db
          .from('statistics')
          .upsert({
            trader_id: trader.id,
            ...stats,
            updated_at: new Date().toISOString()
          });

        results.successful++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          trader: trader.twitter_username,
          error: error.message
        });
      }
    }

    res.json({
      message: 'Sync completed',
      results
    });
  } catch (error) {
    console.error('Error syncing all traders:', error);
    res.status(500).json({ error: 'Failed to sync traders' });
  }
});

// ============================================
// ADD JIMMYFUTURES TO DATABASE
// ============================================
router.post('/add-jimmy', async (req, res) => {
  try {
    const username = 'LTX-1TQ6BC70';
    const apiKey = 'AFT5z0/nScmV4f8nBiPJIxRUQiucEHgT5etoVfAe4TE=';
    const apiUrl = process.env.PROJECTX_API_URL;

    console.log('Adding JimmyFutures to database with real stats...');

    // Get combined stats (same logic as test-combined-stats)
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

    // Calculate month start (Nov 1, 2025)
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
// GET COMBINED ACCOUNT STATISTICS
// ============================================
router.get('/test-combined-stats', async (req, res) => {
  try {
    const username = 'LTX-1TQ6BC70';
    const apiKey = 'AFT5z0/nScmV4f8nBiPJIxRUQiucEHgT5etoVfAe4TE=';
    const apiUrl = process.env.PROJECTX_API_URL;

    console.log('Fetching combined stats for all accounts...');

    // Authenticate
    const authResponse = await fetch(`${apiUrl}/Auth/loginKey`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userName: username,
        apiKey: apiKey
      })
    });

    const authData = await authResponse.json();
    if (!authData.success) {
      throw new Error('Auth failed');
    }
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

    console.log(`Found ${accounts.length} accounts`);

    // Calculate combined stats
    let totalBalance = 0;
    let totalProfit = 0;
    let totalTrades = 0;
    let winningTrades = 0;

    // Loop through each account
    for (const account of accounts) {
      totalBalance += account.balance;

      // Fetch trades for this account
      const tradesResponse = await fetch(`${apiUrl}/Trade/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          accountId: account.id
        })
      });

      const tradesData = await tradesResponse.json();
      const trades = tradesData.trades || [];

      // Calculate stats from trades
      for (const trade of trades) {
        if (trade.profitAndLoss !== null && trade.profitAndLoss !== undefined) {
          totalProfit += trade.profitAndLoss;
          totalTrades++;
          
          if (trade.profitAndLoss > 0) {
            winningTrades++;
          }
        }
      }
    }

    // Calculate win rate
    const winRate = totalTrades > 0 ? ((winningTrades / totalTrades) * 100).toFixed(2) : 0;

    const combinedStats = {
      numberOfAccounts: accounts.length,
      totalBalance: totalBalance.toFixed(2),
      totalProfit: totalProfit.toFixed(2),
      totalTrades: totalTrades,
      winningTrades: winningTrades,
      winRate: `${winRate}%`
    };

    res.json({
      message: 'Combined statistics calculated',
      stats: combinedStats
    });
  } catch (error) {
    console.error('Error calculating stats:', error);
    res.status(500).json({ 
      error: 'Failed to calculate stats',
      message: error.message
    });
  }
});

// ============================================
// TEST ACCOUNT STATISTICS
// ============================================
router.get('/test-stats/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;
    const username = 'LTX-1TQ6BC70';
    const apiKey = 'AFT5z0/nScmV4f8nBiPJIxRUQiucEHgT5etoVfAe4TE=';
    const apiUrl = process.env.PROJECTX_API_URL;

    console.log('Fetching stats for account:', accountId);

    // Authenticate first
    const authResponse = await fetch(`${apiUrl}/Auth/loginKey`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userName: username,
        apiKey: apiKey
      })
    });

    const authData = await authResponse.json();
    if (!authData.success) {
      throw new Error('Auth failed');
    }
    const token = authData.token;

    // Get trade history
    const tradesResponse = await fetch(`${apiUrl}/Trade/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        accountId: parseInt(accountId)
      })
    });

    const trades = await tradesResponse.json();

    res.json({
      message: 'Account statistics',
      accountId: accountId,
      trades: trades
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to fetch stats',
      message: error.message
    });
  }
});

// ============================================
// TEST PROJECTX CONNECTION (GET - for browser testing)
// ============================================
// WHAT THIS DOES:
// Simple GET endpoint you can visit in browser to test ProjectX
// Uses hardcoded credentials for quick testing
// 
// VISIT: http://localhost:3001/api/sync/test-get
// ============================================

router.get('/test-get', async (req, res) => {
  try {
    const username = 'LTX-1TQ6BC70';
    const apiKey = 'AFT5z0/nScmV4f8nBiPJIxRUQiucEHgT5etoVfAe4TE=';
    const apiUrl = process.env.PROJECTX_API_URL;

    console.log('Testing ProjectX with URL:', apiUrl);

    const data = await fetchProjectXData(username, apiKey, apiUrl);

    res.json({
      message: 'ProjectX connection successful!',
      data: data
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'ProjectX connection failed',
      message: error.message
    });
  }
});

// ============================================
// TEST PROJECTX CONNECTION
// ============================================
// WHAT THIS DOES:
// Test endpoint to verify ProjectX API works with given credentials
// Good for debugging
// 
// CALL THIS: POST /api/sync/test
// BODY: { "username": "...", "apiKey": "...", "apiUrl": "..." }
// ============================================

router.post('/test', async (req, res) => {
  try {
    const { username, apiKey, apiUrl } = req.body;

    if (!username || !apiKey || !apiUrl) {
      return res.status(400).json({ 
        error: 'username, apiKey, and apiUrl are required' 
      });
    }

    const data = await fetchProjectXData(username, apiKey, apiUrl);

    res.json({
      message: 'ProjectX connection successful!',
      data: data
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'ProjectX connection failed',
      message: error.message
    });
  }
});

module.exports = router;
