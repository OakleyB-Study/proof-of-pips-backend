// backend/cron-sync.js
// Cron job that runs at 8:30 AM CST and 3:30 PM CST to sync all traders

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
// '0 6 * * *'  = 6:00 AM UTC (12:00 AM CST) every day
// '30 14 * * *' = 2:30 PM UTC (8:30 AM CST) every day
// '30 21 * * *' = 9:30 PM UTC (3:30 PM CST) every day

function startCronJobs() {
  console.log('🚀 Starting cron jobs...');
  
  // 12:00 AM CST (Midnight)
  cron.schedule('0 6 * * *', () => {
    console.log('⏰ 12:00 AM CST (Midnight) sync triggered');
    syncAllTraders();
  }, {
    timezone: "UTC"
  });

  // 8:30 AM CST
  cron.schedule('30 14 * * *', () => {
    console.log('⏰ 8:30 AM CST sync triggered');
    syncAllTraders();
  }, {
    timezone: "UTC"
  });

  // 3:30 PM CST
  cron.schedule('30 21 * * *', () => {
    console.log('⏰ 3:30 PM CST sync triggered');
    syncAllTraders();
  }, {
    timezone: "UTC"
  });

  console.log('✅ Cron jobs scheduled:');
  console.log('   - 12:00 AM CST (6:00 AM UTC)');
  console.log('   - 8:30 AM CST (2:30 PM UTC)');
  console.log('   - 3:30 PM CST (9:30 PM UTC)');
}

module.exports = { startCronJobs, syncAllTraders };
