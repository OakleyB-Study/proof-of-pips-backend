# Proof of Pips - Backend API

## 📋 What This Is

This is the backend API server for your Proof of Pips leaderboard. It:
- Stores trader data in a database
- Fetches trading stats from ProjectX API
- Serves data to your React frontend

## 🏗️ File Structure

```
proof-of-pips-backend/
├── server.js              # Main API server (START HERE)
├── package.json           # Dependencies list
├── .env.example          # Environment variables template
├── routes/
│   ├── traders.js        # Trader endpoints (/api/traders)
│   └── sync.js           # ProjectX sync (/api/sync)
├── config/
│   └── database.js       # Supabase connection
└── database/
    └── schema.sql        # Database tables
```

## 🚀 Setup Instructions

### Step 1: Install Dependencies

```bash
cd proof-of-pips-backend
npm install
```

This installs:
- `express` - Web server
- `cors` - Allows frontend to talk to backend
- `dotenv` - Loads environment variables
- `@supabase/supabase-js` - Database connection

### Step 2: Set Up Environment Variables

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Open `.env` and fill in your values:
   - Get Supabase credentials from Step 4 below
   - Set `FRONTEND_URL` to your website (e.g., `https://proofofpips.com`)

### Step 3: Create Supabase Account

1. Go to https://supabase.com
2. Click "Start your project"
3. Sign up (it's free)
4. Click "New Project"
5. Fill in:
   - Name: `proof-of-pips`
   - Database Password: (save this!)
   - Region: Choose closest to you
6. Click "Create new project" (takes ~2 minutes)

### Step 4: Get Supabase Credentials

1. In your Supabase project, go to Settings → API
2. Copy these values to your `.env` file:
   - `Project URL` → `SUPABASE_URL`
   - `service_role key` → `SUPABASE_SERVICE_KEY`

⚠️ **IMPORTANT:** Use the `service_role` key, not the `anon` key!

### Step 5: Create Database Tables

1. In Supabase, click "SQL Editor" in the left menu
2. Click "New query"
3. Copy the entire contents of `database/schema.sql`
4. Paste it in the SQL editor
5. Click "Run" (bottom right)

You should see: "Success. No rows returned"

### Step 6: Verify Database

1. In Supabase, click "Table Editor"
2. You should see two tables:
   - `traders` (with 3 sample traders)
   - `statistics` (with 3 sample stats)

### Step 7: Start the Server

```bash
npm start
```

You should see:
```
✅ Proof of Pips API server running on port 3001
🔗 Health check: http://localhost:3001/health
📊 API endpoints available at: http://localhost:3001/api
```

### Step 8: Test It Works

Open your browser and go to:
```
http://localhost:3001/health
```

You should see:
```json
{
  "status": "ok",
  "message": "Proof of Pips API is running!",
  "timestamp": "2025-..."
}
```

### Step 9: Test Traders Endpoint

Go to:
```
http://localhost:3001/api/traders
```

You should see JSON with 3 sample traders!

## 🧪 Testing ProjectX API

To test your ProjectX API key:

```bash
# Use a tool like Postman or curl
curl -X POST http://localhost:3001/api/sync/test \
  -H "Content-Type: application/json" \
  -d '{
    "username": "YOUR_PROJECTX_USERNAME",
    "apiKey": "YOUR_PROJECTX_API_KEY",
    "apiUrl": "https://gateway-api-demo.s2f.projectx.com/api"
  }'
```

If it works, you'll see the account data from ProjectX!

## 📡 API Endpoints

### GET /api/traders
Returns all traders for the leaderboard
```json
[
  {
    "rank": 1,
    "twitter": "JimmyFutures",
    "avatar": "🏆",
    "totalProfit": 127500,
    "verifiedPayouts": 8,
    "monthlyProfit": 18200,
    "winRate": 68.5,
    "accountCreated": "2023-03-01"
  }
]
```

### GET /api/traders/:username
Returns single trader profile

### POST /api/traders
Add a new trader
```json
{
  "twitterUsername": "YourTwitter",
  "projectxUsername": "your_projectx_user",
  "projectxApiKey": "your_api_key"
}
```

### POST /api/sync/trader/:username
Sync one trader's data from ProjectX

### POST /api/sync/all
Sync all traders (use this in a cron job)

### POST /api/sync/test
Test ProjectX API connection

## 🐛 Troubleshooting

### "Module not found"
Run `npm install` again

### "Missing Supabase credentials"
Check your `.env` file exists and has the correct values

### "Failed to fetch traders"
1. Check Supabase is running
2. Verify database tables exist
3. Check your `SUPABASE_SERVICE_KEY` is correct

### Port already in use
Change `PORT=3001` to something else in `.env` (like `PORT=3002`)

## 🔐 Security Notes

- ⚠️ **Never commit `.env` to GitHub**
- ⚠️ ProjectX API keys should be encrypted in database (TODO)
- ⚠️ Add rate limiting before going live
- ⚠️ Add authentication for POST endpoints

## 📚 Next Steps

1. ✅ Get backend running locally
2. ✅ Test with sample data
3. Test your ProjectX API key
4. Deploy to Railway
5. Update frontend to use real API
6. Set up automatic sync (cron job)

## 🆘 Need Help?

If something isn't working, check:
1. Is the server running? (check terminal)
2. Is Supabase online? (check dashboard)
3. Are environment variables correct? (check `.env`)
4. Did you run the SQL schema? (check Table Editor)
