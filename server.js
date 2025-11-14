// ============================================
// PROOF OF PIPS - BACKEND API SERVER
// ============================================
// WHAT THIS FILE DOES:
// This is your main backend server that handles requests from your React frontend
// It connects to your database and serves trader data
// ============================================

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const tradersRoutes = require('./routes/traders');
const syncRoutes = require('./routes/sync');
const authRoutes = require('./routes/auth'); // Twitter OAuth
const { startCronJobs } = require('./cron-sync'); // NEW: Import cron jobs
const { generalLimiter, syncLimiter } = require('./middleware/rateLimiter'); // Rate limiting

const app = express();
const PORT = process.env.PORT || 3001;

// ============================================
// MIDDLEWARE
// ============================================
// WHAT THIS DOES: Sets up the tools our server needs to work
// - cors: Allows your frontend (proofofpips.com) to talk to this API
// - express.json: Lets us receive JSON data in requests
// ============================================

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

// ============================================
// RATE LIMITING
// ============================================
// WHAT THIS DOES: Prevents API abuse by limiting requests per IP
// - General: 100 requests per 15 minutes
// - Sync endpoints: 10 requests per hour (more restrictive)
// ============================================

app.use(generalLimiter);

// ============================================
// LOGGING MIDDLEWARE (for debugging)
// ============================================
// WHAT THIS DOES: Logs every request so you can see what's happening
// ============================================

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ============================================
// ROUTES
// ============================================
// WHAT THIS DOES: Defines the API endpoints your frontend will call
// Example: GET /api/traders returns all traders for the leaderboard
// ============================================

app.use('/api/traders', tradersRoutes);
app.use('/api/sync', syncLimiter, syncRoutes); // Add rate limiter to sync routes
app.use('/api/auth', authRoutes); // Twitter OAuth routes

// ============================================
// HEALTH CHECK ENDPOINT
// ============================================
// WHAT THIS DOES: Simple endpoint to check if the server is running
// Visit: http://localhost:3001/health to test
// ============================================

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Proof of Pips API is running!',
    timestamp: new Date().toISOString()
  });
});

// ============================================
// ERROR HANDLING
// ============================================
// WHAT THIS DOES: Catches any errors and sends a proper response
// ============================================

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: err.message 
  });
});

// ============================================
// START SERVER
// ============================================
// WHAT THIS DOES: Starts listening for requests
// ============================================

app.listen(PORT, () => {
  console.log(`✅ Proof of Pips API server running on port ${PORT}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`📊 API endpoints available at: http://localhost:${PORT}/api`);
  
  // NEW: Start cron jobs after server is running
  startCronJobs();
});
