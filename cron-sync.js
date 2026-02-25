// backend/cron-sync.js
// Cron job that runs every hour to sync all traders

const cron = require('node-cron');
const axios = require('axios');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

// CST is UTC-6, so:
// 12:00 AM CST = 6:00 AM UTC (06:00)
// 8:30 AM CST = 2:30 PM UTC (14:30)
// 3:30 PM CST = 9:30 PM UTC (21:30)

async function syncAllTraders() {
  try {
    console.log(`🔄 [${new Date().toISOString()}] Running scheduled sync...`);
    
    const response = await axios.post(`${BACKEND_URL}/api/sync/all`);
    
    console.log(`✅ [${new Date().toISOString()}] Sync completed:`, response.data);
  } catch (error) {
    console.error(`❌ [${new Date().toISOString()}] Sync failed:`, error.message);
  }
}

// Schedule jobs
// Format: minute hour day month day-of-week
// '0 * * * *' = Every hour at minute 0 (1:00, 2:00, 3:00, etc.)

function startCronJobs() {
  console.log('🚀 Starting cron jobs...');
  
  // Every hour at minute 0
  cron.schedule('0 * * * *', () => {
    console.log('⏰ Hourly sync triggered');
    syncAllTraders();
  }, {
    timezone: "UTC"
  });

  console.log('✅ Cron job scheduled: Every hour at :00');
}

module.exports = { startCronJobs, syncAllTraders };