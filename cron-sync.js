// backend/cron-sync.js
// Cron job that runs every hour to sync all traders
// CJIS 5.4: All sync operations are logged with structured audit entries

const cron = require('node-cron');
const axios = require('axios');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const SYNC_API_KEY = process.env.SYNC_API_KEY;

async function syncAllTraders() {
  if (!SYNC_API_KEY) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      event: 'CRON_SYNC_SKIPPED',
      reason: 'SYNC_API_KEY not configured',
    }));
    return;
  }

  try {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      event: 'CRON_SYNC_START',
    }));

    const response = await axios.post(`${BACKEND_URL}/api/sync/all`, {}, {
      headers: {
        'Authorization': `Bearer ${SYNC_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      event: 'CRON_SYNC_COMPLETE',
      traderssynced: response.data?.results?.length || 0,
    }));
  } catch (error) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      event: 'CRON_SYNC_FAILED',
      message: error.message,
    }));
  }
}

function startCronJobs() {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'INFO',
    event: 'CRON_JOBS_STARTED',
    schedule: 'Every hour at :00 UTC',
  }));

  cron.schedule('0 * * * *', async () => {
    await syncAllTraders();
  }, {
    timezone: "UTC"
  });
}

module.exports = { startCronJobs, syncAllTraders };
