const express = require('express');
const cors = require('cors');
require('dotenv').config();

const tradersRoutes = require('./routes/traders');
const syncRoutes = require('./routes/sync');
const authRoutes = require('./routes/auth');
const { startCronJobs } = require('./cron-sync');
const { generalLimiter, syncLimiter } = require('./middleware/rateLimiter');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: [
    'https://proofofpips.com',
    'http://localhost:3000',
    'http://localhost:3001',
  ],
  credentials: true,
}));
app.use(express.json());
app.use(generalLimiter);

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api/traders', tradersRoutes);
app.use('/api/sync', syncLimiter, syncRoutes);
app.use('/api/auth', authRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Proof of Pips API is running',
    version: '2.0.0',
    integrations: ['tradovate', 'tradesyncer'],
    timestamp: new Date().toISOString(),
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Something went wrong', message: err.message });
});

// Start server
app.listen(PORT, () => {
  console.log(`Proof of Pips API v2.0 running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Integrations: Tradovate + TradeSyncer`);
  startCronJobs();
});
