// ============================================
// DATABASE CONFIGURATION
// ============================================
// WHAT THIS FILE DOES:
// Sets up the connection to your Supabase database
// All other files import this to talk to the database
// ============================================

const { createClient } = require('@supabase/supabase-js');

// ============================================
// WHY WE USE ENVIRONMENT VARIABLES:
// We don't hardcode URLs/keys in the code for security
// They're stored in a .env file that doesn't get uploaded to GitHub
// ============================================

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ ERROR: Missing Supabase credentials!');
  console.error('Make sure you have SUPABASE_URL and SUPABASE_SERVICE_KEY in your .env file');
  process.exit(1);
}

// ============================================
// CREATE DATABASE CLIENT
// ============================================
// WHAT THIS DOES:
// Creates a connection to your Supabase database
// Other files will use this to query the database
// ============================================

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;
