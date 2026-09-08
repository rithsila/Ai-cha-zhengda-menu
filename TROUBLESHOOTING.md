# Ai-Cha & Zhengda — Services Restart & Troubleshooting Guide

This guide provides simple, step-by-step commands to restart services, fix stuck ports, and deploy staging.

---

## 1. Quick Health Check

### Live Staging URLs:
- **API**: `https://staging-api.aichazhengdaarakawa.com/api/payment/methods` (should return `200 OK`)
- **Customer Menu**: `https://staging-menu.aichazhengdaarakawa.com`
- **Staff Dashboard**: `https://staging-staff.aichazhengdaarakawa.com`

### Run one command to test all 3 live staging endpoints:
```bash
curl -I https://staging-api.aichazhengdaarakawa.com/api/payment/methods && \
curl -I https://staging-menu.aichazhengdaarakawa.com && \
curl -I https://staging-staff.aichazhengdaarakawa.com
```

---

## 2. Local Development: How to Start and Restart

### Option A: Start all 3 services together
Run this in project root:
```bash
npm run dev
```
- API starts at: `http://localhost:4000`
- Customer Menu starts at: `http://localhost:5173`
- Staff Dashboard starts at: `http://localhost:5174`

### Option B: Start services separately (in 3 terminal tabs)

1. **Tab 1: API backend**
   ```bash
   npm --prefix apps/api run dev
   ```

2. **Tab 2: Customer Menu**
   ```bash
   npm --prefix apps/menu run dev
   ```

3. **Tab 3: Staff Dashboard**
   ```bash
   npm --prefix apps/staff run dev
   ```

---

## 3. How to Fix Stuck Ports (EADDRINUSE)

If you see `Error: listen EADDRINUSE: address already in use :::4000` (or `5173`, `5174`):

### Kill all stuck dev ports in one command:
```bash
lsof -ti:4000,5173,5174 | xargs kill -9
```

Then restart:
```bash
npm run dev
```

---

## 4. How to Deploy to Staging

### Step 1: Deploy API (Railway)
Pushing to the `staging` git branch automatically deploys the API to Railway:
```bash
git push origin staging
```

### Step 2: Build & Deploy Frontend (Cloudflare Workers)
Run this single command from root:
```bash
npm run deploy:staging
```
*Note: This automatically sets `VITE_API_URL="https://staging-api.aichazhengdaarakawa.com"` before building so the frontend connects to the live backend.*

---

## 5. Top 5 Common Issues & Exact Fixes

### Issue 1: "App loads blank or cannot reach API"
- **Cause**: Frontend was built without `VITE_API_URL`, defaulting to `http://localhost:4000`.
- **Fix (1 minute)**:
  ```bash
  npm run deploy:staging
  ```

### Issue 2: "Database error or missing tables"
- **Cause**: SQLite database schema is out of sync.
- **Fix (30 seconds)**:
  ```bash
  npx --prefix apps/api prisma db push
  ```

### Issue 3: "Port 4000/5173/5174 already in use"
- **Cause**: An old process is still running in the background.
- **Fix (10 seconds)**:
  ```bash
  lsof -ti:4000,5173,5174 | xargs kill -9
  ```

### Issue 4: "Telegram login fails or Mini App blank"
- **Cause**: Missing `TELEGRAM_BOT_TOKEN` in `apps/api/.env` or `WEBAPP_URL` mismatch.
- **Fix**: Verify `apps/api/.env` contains:
  ```env
  TELEGRAM_BOT_TOKEN="your-bot-token"
  WEBAPP_URL="https://staging-menu.aichazhengdaarakawa.com"
  ```

### Issue 5: "ABA KHQR returns 503 or Wrong Hash"
- **Cause**: `ABA_MERCHANT_ID` or `ABA_API_KEY` missing or wrong in Railway variables.
- **Fix**: Open Railway dashboard → API service → Variables. Ensure:
  - `ABA_MERCHANT_ID` matches your ABA merchant account
  - `ABA_API_KEY` matches your ABA API key
  - `ABA_BASE_URL=https://checkout-sandbox.payway.com.kh`
