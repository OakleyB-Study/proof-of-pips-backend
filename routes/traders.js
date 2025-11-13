// ============================================
// TRADERS ROUTES
// ============================================
// WHAT THIS FILE DOES:
// Handles all API requests related to traders
// - GET /api/traders - Get all traders (for leaderboard)
// - GET /api/traders/:username - Get single trader (for profile page)
// - POST /api/traders - Add a new trader
// ============================================

const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { encrypt } = require('../utils/encryption');

// ============================================
// GET ALL TRADERS (for leaderboard)
// ============================================
// WHAT THIS DOES:
// Fetches all traders from database with their latest stats
// Your React frontend calls this to display the leaderboard
// 
// FRONTEND WILL CALL: fetch('http://your-api.com/api/traders')
// ============================================

router.get('/', async (req, res) => {
  try {
    // Use raw SQL query with proper JOIN
    const { data, error } = await db.rpc('get_traders_with_stats');

    if (error) {
      // Fallback to manual query if RPC doesn't exist
      const query = `
        SELECT 
          t.id,
          t.twitter_username,
          t.avatar,
          t.account_created,
          COALESCE(s.total_profit, 0) as total_profit,
          COALESCE(s.verified_payouts, 0) as verified_payouts,
          COALESCE(s.monthly_profit, 0) as monthly_profit,
          COALESCE(s.win_rate, 0) as win_rate
        FROM traders t
        LEFT JOIN statistics s ON t.id = s.trader_id
        ORDER BY s.total_profit DESC NULLS LAST
      `;
      
      const { data: rawData, error: rawError } = await db.rpc('exec_sql', { sql: query });
      
      if (rawError) {
        // Last fallback - get traders and stats separately
        const { data: tradersData } = await db.from('traders').select('*');
        const { data: statsData } = await db.from('statistics').select('*');
        
        const traders = tradersData.map((trader, index) => {
          const stats = statsData.find(s => s.trader_id === trader.id);
          return {
            rank: index + 1,
            twitter: trader.twitter_username,
            avatar: trader.avatar,
            totalProfit: stats?.total_profit || 0,
            verifiedPayouts: stats?.verified_payouts || 0,
            monthlyProfit: stats?.monthly_profit || 0,
            winRate: stats?.win_rate || 0,
            accountCreated: trader.account_created,
          };
        });
        
        traders.sort((a, b) => b.totalProfit - a.totalProfit);
        traders.forEach((trader, index) => {
          trader.rank = index + 1;
        });
        
        return res.json(traders);
      }
      
      return res.json(rawData);
    }

    res.json(data);
  } catch (error) {
    console.error('Error fetching traders:', error);
    res.status(500).json({ error: 'Failed to fetch traders' });
  }
});

// ============================================
// GET SINGLE TRADER (for profile page)
// ============================================
// WHAT THIS DOES:
// Fetches detailed info for one trader
// 
// FRONTEND WILL CALL: fetch('http://your-api.com/api/traders/JimmyFutures')
// ============================================

router.get('/:username', async (req, res) => {
  try {
    const { username } = req.params;

    const { data, error } = await db
      .from('traders')
      .select(`
        *,
        statistics (*)
      `)
      .eq('twitter_username', username)
      .single();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({ error: 'Trader not found' });
    }

    // Transform to match frontend structure
    const trader = {
      twitter: data.twitter_username,
      avatar: data.avatar,
      totalProfit: data.statistics?.[0]?.total_profit || 0,
      verifiedPayouts: data.statistics?.[0]?.verified_payouts || 0,
      monthlyProfit: data.statistics?.[0]?.monthly_profit || 0,
      winRate: data.statistics?.[0]?.win_rate || 0,
      accountCreated: data.account_created,
    };

    res.json(trader);
  } catch (error) {
    console.error('Error fetching trader:', error);
    res.status(500).json({ error: 'Failed to fetch trader' });
  }
});

// ============================================
// ADD NEW TRADER
// ============================================
// POST /api/traders/add
// Validates API key, encrypts it, saves trader, runs initial sync
// ============================================

router.post('/add', async (req, res) => {
  try {
    const { twitterUsername, propFirm, projectxUsername, projectxApiKey } = req.body;

    // Validate required fields
    if (!twitterUsername || !projectxUsername || !projectxApiKey) {
      return res.status(400).json({ 
        error: 'All fields are required' 
      });
    }

    // Only Lucid is supported for now
    if (propFirm !== 'lucid') {
      return res.status(400).json({ 
        error: 'Only Lucid Trading is supported at this time' 
      });
    }

    // Check if Twitter username already exists
    const { data: existing } = await db
      .from('traders')
      .select('id')
      .eq('twitter_username', twitterUsername)
      .single();

    if (existing) {
      return res.status(400).json({ 
        error: 'This Twitter username is already registered' 
      });
    }

    // Validate API key by testing authentication with ProjectX
    const apiUrl = process.env.PROJECTX_API_URL;
    console.log(`Validating API key for ${twitterUsername}...`);

    try {
      const authResponse = await fetch(`${apiUrl}/Auth/loginKey`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userName: projectxUsername.trim(), 
          apiKey: projectxApiKey.trim() 
        })
      });

      const authData = await authResponse.json();
      
      if (!authData.success) {
        return res.status(401).json({ 
          error: 'Invalid ProjectX credentials. Please check your username and API key.' 
        });
      }

      console.log('✅ API key validated successfully');
    } catch (error) {
      console.error('API validation error:', error);
      return res.status(500).json({ 
        error: 'Failed to validate API key. Please try again.' 
      });
    }

    // Encrypt the API key before storing
    const encryptedApiKey = encrypt(projectxApiKey.trim());
    
    // Insert new trader
    const { data: newTrader, error: insertError } = await db
      .from('traders')
      .insert([
        {
          twitter_username: twitterUsername,
          projectx_username: projectxUsername.trim(),
          projectx_api_key: encryptedApiKey,
          avatar: '🏆', // Default avatar
          account_created: new Date().toISOString()
        }
      ])
      .select()
      .single();

    if (insertError) throw insertError;

    console.log(`✅ Trader ${twitterUsername} added successfully`);

    // Trigger initial sync (async - don't wait for it)
    fetch(`${process.env.BACKEND_URL || 'http://localhost:3001'}/api/sync/all`, {
      method: 'POST'
    }).catch(err => console.error('Initial sync failed:', err));

    res.status(201).json({ 
      message: 'Profile added successfully! Your stats are being synced.',
      trader: {
        twitter: newTrader.twitter_username,
        id: newTrader.id
      }
    });
  } catch (error) {
    console.error('Error adding trader:', error);
    res.status(500).json({ error: 'Failed to add profile. Please try again.' });
  }
});

// ============================================
// OLD ENDPOINT (DEPRECATED - Keep for backwards compatibility)
// ============================================

router.post('/', async (req, res) => {
  try {
    const { twitterUsername, projectxApiKey, projectxUsername } = req.body;

    // Validate required fields
    if (!projectxApiKey || !projectxUsername) {
      return res.status(400).json({ 
        error: 'ProjectX API key and username are required' 
      });
    }

    // Encrypt the API key before storing
    const encryptedApiKey = encrypt(projectxApiKey.trim());
    
    // Insert new trader
    const { data, error } = await db
      .from('traders')
      .insert([
        {
          twitter_username: twitterUsername,
          projectx_api_key: encryptedApiKey,
          projectx_username: projectxUsername.trim(),
          avatar: '👤', // Default avatar
          account_created: new Date().toISOString()
        }
      ])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ 
      message: 'Trader added successfully!',
      trader: data 
    });
  } catch (error) {
    console.error('Error adding trader:', error);
    res.status(500).json({ error: 'Failed to add trader' });
  }
});

module.exports = router;
