const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const tradersRoutes = require('./routes/traders');
const syncRoutes = require('./routes/sync');
const authRoutes = require('./routes/auth');
const { startCronJobs } = require('./cron-sync');
const { generalLimiter, syncLimiter } = require('./middleware/rateLimiter');
const { securityHeaders } = require('./middleware/securityHeaders');
const { auditLogger } = require('./middleware/auditLogger');
const { syncAuth } = require('./middleware/syncAuth');

const app = express();
const PORT = process.env.PORT || 3001;

// STIG: Disable x-powered-by header (information disclosure)
app.disable('x-powered-by');

// STIG: Trust proxy for accurate IP logging behind Railway/load balancer
app.set('trust proxy', 1);

// STIG/CJIS: Security response headers
app.use(securityHeaders);

// CORS with strict origin validation
app.use(cors({
  origin: [
    'https://proofofpips.com',
    'https://www.proofofpips.com',
    'http://localhost:3000',
  ],
  credentials: true,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Sync-Key'],
  maxAge: 600, // Cache preflight for 10 minutes
}));

// STIG: Limit request body size to prevent DoS
app.use(express.json({ limit: '1mb' }));

// Cookie parser for JWT session cookies
app.use(cookieParser());

// Rate limiting
app.use(generalLimiter);

// CJIS 5.4: Structured audit logging (replaces basic console.log)
app.use(auditLogger);

// Routes
app.use('/api/traders', tradersRoutes);
app.use('/api/sync', syncLimiter, syncAuth, syncRoutes);
app.use('/api/auth', authRoutes);

// Health check - STIG: minimal information disclosure
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// STIG: Error handler must not leak internal details
app.use((err, req, res, next) => {
  // Log full error internally for debugging
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'ERROR',
    event: 'UNHANDLED_ERROR',
    message: err.message,
    stack: err.stack,
    path: req.originalUrl,
    method: req.method,
  }));

  // Return generic error to client (never expose internals)
  res.status(500).json({ error: 'An internal error occurred' });
});

// Start server
app.listen(PORT, () => {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'INFO',
    event: 'SERVER_START',
    port: PORT,
  }));
  startCronJobs();
});
