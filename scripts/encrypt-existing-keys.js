// backend/scripts/encrypt-existing-keys.js
// ONE-TIME SCRIPT: Run this once to encrypt all existing API keys in database

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { encrypt } = require('../utils/encryption');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function encryptExistingKeys() {
  try {
    console.log('🔐 Starting encryption of existing API keys...\n');

    // Get all traders
    const { data: traders, error } = await supabase
      .from('traders')
      .select('id, twitter_username, projectx_api_key');

    if (error) throw error;

    if (!traders || traders.length === 0) {
      console.log('No traders found in database.');
      return;
    }

    console.log(`Found ${traders.length} trader(s)\n`);

    let successCount = 0;
    let skipCount = 0;

    for (const trader of traders) {
      console.log(`Processing: ${trader.twitter_username}`);
      
      if (!trader.projectx_api_key) {
        console.log('  ⚠️  No API key found, skipping\n');
        skipCount++;
        continue;
      }

      // Check if already encrypted (encrypted keys have format: iv:authTag:data)
      if (trader.projectx_api_key.includes(':')) {
        console.log('  ℹ️  Already encrypted, skipping\n');
        skipCount++;
        continue;
      }

      // Encrypt the key
      const encryptedKey = encrypt(trader.projectx_api_key.trim());
      
      // Update in database
      const { error: updateError } = await supabase
        .from('traders')
        .update({ projectx_api_key: encryptedKey })
        .eq('id', trader.id);

      if (updateError) {
        console.log(`  ❌ Error encrypting: ${updateError.message}\n`);
        continue;
      }

      console.log('  ✅ Encrypted successfully\n');
      successCount++;
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ Encryption complete!`);
    console.log(`   - Successfully encrypted: ${successCount}`);
    console.log(`   - Skipped: ${skipCount}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run the script
encryptExistingKeys();
