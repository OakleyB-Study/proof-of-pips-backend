const express = require('express');
const router = express.Router();
const { supabase } = require('../config/database');

// Middleware to verify auth token (reuse from auth.js pattern)
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  // Verify token with your existing auth system
  try {
    const response = await fetch(`${process.env.API_URL || 'http://localhost:3001'}/api/auth/verify`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const data = await response.json();
    req.user = data; // { twitter_username, twitter_id }
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token verification failed' });
  }
};

// GET /api/journal - Get all journal entries for a user
router.get('/', verifyToken, async (req, res) => {
  try {
    const { twitter_username } = req.user;

    // Get trader ID from twitter_username
    const { data: trader, error: traderError } = await supabase
      .from('traders')
      .select('id')
      .eq('twitter_username', twitter_username)
      .single();

    if (traderError || !trader) {
      return res.status(404).json({ error: 'Trader not found' });
    }

    // Get journal entries
    const { data: entries, error } = await supabase
      .from('journal_entries')
      .select('*')
      .eq('trader_id', trader.id)
      .order('date', { ascending: false });

    if (error) throw error;

    res.json({ entries: entries || [] });
  } catch (error) {
    console.error('Error fetching journal entries:', error);
    res.status(500).json({ error: 'Failed to fetch journal entries' });
  }
});

// GET /api/journal/:username - Get journal entries for any user (public)
router.get('/user/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    // Get trader ID from twitter_username
    const { data: trader, error: traderError } = await supabase
      .from('traders')
      .select('id, twitter_username, twitter_avatar, created_at')
      .eq('twitter_username', username)
      .single();

    if (traderError || !trader) {
      return res.status(404).json({ error: 'Trader not found' });
    }

    // Get journal entries
    const { data: entries, error, count } = await supabase
      .from('journal_entries')
      .select('*', { count: 'exact' })
      .eq('trader_id', trader.id)
      .order('date', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (error) throw error;

    res.json({
      trader: {
        twitter_username: trader.twitter_username,
        twitter_avatar: trader.twitter_avatar,
        joined_date: trader.created_at
      },
      entries: entries || [],
      total: count || 0
    });
  } catch (error) {
    console.error('Error fetching journal entries:', error);
    res.status(500).json({ error: 'Failed to fetch journal entries' });
  }
});

// POST /api/journal - Create a new journal entry
router.post('/', verifyToken, async (req, res) => {
  try {
    const { twitter_username } = req.user;
    const {
      date,
      daily_pnl,
      ticker,
      session,
      contracts,
      entry_price,
      exit_price,
      stop_loss,
      notes,
      chart_images,
      tags
    } = req.body;

    // Validate required fields
    if (daily_pnl === undefined || daily_pnl === null || daily_pnl === '') {
      return res.status(400).json({ error: 'daily_pnl is required' });
    }

    if (!date) {
      return res.status(400).json({ error: 'date is required' });
    }

    // Get trader ID
    const { data: trader, error: traderError } = await supabase
      .from('traders')
      .select('id')
      .eq('twitter_username', twitter_username)
      .single();

    if (traderError || !trader) {
      return res.status(404).json({ error: 'Trader not found. Please register first.' });
    }

    // Insert journal entry
    const { data: entry, error } = await supabase
      .from('journal_entries')
      .insert({
        trader_id: trader.id,
        date,
        daily_pnl: parseFloat(daily_pnl),
        ticker: ticker || null,
        session: session || null,
        contracts: contracts ? parseInt(contracts) : null,
        entry_price: entry_price ? parseFloat(entry_price) : null,
        exit_price: exit_price ? parseFloat(exit_price) : null,
        stop_loss: stop_loss ? parseFloat(stop_loss) : null,
        notes: notes || null,
        chart_images: chart_images || null,
        tags: tags || null
      })
      .select()
      .single();

    if (error) throw error;

    // Update statistics after new entry
    await updateTraderStats(trader.id);

    res.status(201).json({ entry });
  } catch (error) {
    console.error('Error creating journal entry:', error);
    res.status(500).json({ error: 'Failed to create journal entry' });
  }
});

// PUT /api/journal/:id - Update a journal entry
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { twitter_username } = req.user;
    const { id } = req.params;
    const updates = req.body;

    // Get trader ID
    const { data: trader, error: traderError } = await supabase
      .from('traders')
      .select('id')
      .eq('twitter_username', twitter_username)
      .single();

    if (traderError || !trader) {
      return res.status(404).json({ error: 'Trader not found' });
    }

    // Verify entry belongs to this trader
    const { data: existing, error: existingError } = await supabase
      .from('journal_entries')
      .select('trader_id')
      .eq('id', id)
      .single();

    if (existingError || !existing) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    if (existing.trader_id !== trader.id) {
      return res.status(403).json({ error: 'Not authorized to edit this entry' });
    }

    // Update entry
    const { data: entry, error } = await supabase
      .from('journal_entries')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Update statistics
    await updateTraderStats(trader.id);

    res.json({ entry });
  } catch (error) {
    console.error('Error updating journal entry:', error);
    res.status(500).json({ error: 'Failed to update journal entry' });
  }
});

// DELETE /api/journal/:id - Delete a journal entry
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { twitter_username } = req.user;
    const { id } = req.params;

    // Get trader ID
    const { data: trader, error: traderError } = await supabase
      .from('traders')
      .select('id')
      .eq('twitter_username', twitter_username)
      .single();

    if (traderError || !trader) {
      return res.status(404).json({ error: 'Trader not found' });
    }

    // Verify entry belongs to this trader
    const { data: existing, error: existingError } = await supabase
      .from('journal_entries')
      .select('trader_id')
      .eq('id', id)
      .single();

    if (existingError || !existing) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    if (existing.trader_id !== trader.id) {
      return res.status(403).json({ error: 'Not authorized to delete this entry' });
    }

    // Delete entry
    const { error } = await supabase
      .from('journal_entries')
      .delete()
      .eq('id', id);

    if (error) throw error;

    // Update statistics
    await updateTraderStats(trader.id);

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting journal entry:', error);
    res.status(500).json({ error: 'Failed to delete journal entry' });
  }
});

// Helper function to update trader statistics from journal entries
async function updateTraderStats(traderId) {
  try {
    // Get all journal entries for this trader
    const { data: entries, error: entriesError } = await supabase
      .from('journal_entries')
      .select('daily_pnl, date')
      .eq('trader_id', traderId);

    if (entriesError) throw entriesError;

    if (!entries || entries.length === 0) {
      // No entries, set stats to zero
      await supabase
        .from('statistics')
        .upsert({
          trader_id: traderId,
          total_profit: 0,
          monthly_profit: 0,
          win_rate: 0,
          total_payout: 0,
          updated_at: new Date().toISOString()
        }, { onConflict: 'trader_id' });
      return;
    }

    // Calculate stats
    const totalProfit = entries.reduce((sum, e) => sum + parseFloat(e.daily_pnl), 0);

    // Monthly profit (current month)
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const monthlyProfit = entries
      .filter(e => {
        const entryDate = new Date(e.date);
        return entryDate.getMonth() === currentMonth && entryDate.getFullYear() === currentYear;
      })
      .reduce((sum, e) => sum + parseFloat(e.daily_pnl), 0);

    // Win rate
    const winningDays = entries.filter(e => parseFloat(e.daily_pnl) > 0).length;
    const winRate = entries.length > 0 ? (winningDays / entries.length) * 100 : 0;

    // Update statistics
    await supabase
      .from('statistics')
      .upsert({
        trader_id: traderId,
        total_profit: totalProfit,
        monthly_profit: monthlyProfit,
        win_rate: winRate,
        total_payout: totalProfit, // Using total_profit as payout for journal-based system
        updated_at: new Date().toISOString()
      }, { onConflict: 'trader_id' });

  } catch (error) {
    console.error('Error updating trader stats:', error);
  }
}

module.exports = router;
