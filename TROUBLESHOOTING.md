# Ai-Cha & Zhengda — Runbook & Troubleshooting Guide

Simple runbook to check services, read logs, find bugs, restart services, and deploy.

---

## 1. Quick Health Checks

### Check Staging (all 3 endpoints)
```bash
curl -I https://staging-api.aichazhengdaarakawa.com/health && \
curl -I https://staging-menu.aichazhengdaarakawa.com && \
curl -I https://staging-staff.aichazhengdaarakawa.com
```

### Check Production (all 3 endpoints)
```bash
curl -I https://api.aichazhengdaarakawa.com/health && \
curl -I https://menu.aichazhengdaarakawa.com && \
curl -I https://staff.aichazhengdaarakawa.com
```

### Check Payment API Status (Must show `online: true`)
```bash
# Staging
curl -s https://staging-api.aichazhengdaarakawa.com/api/payment/methods

# Production
curl -s https://api.aichazhengdaarakawa.com/api/payment/methods
```
*Expected result:* `{"cash":true,"online":true}`

---

## 2. Check Railway Logs & Status

Use these commands to view real-time server logs and find errors.

### 1. View live server logs
```bash
# Production live logs
npx @railway/cli logs -e production

# Staging live logs
npx @railway/cli logs -e staging
```

### 2. View recent build logs (if deployment failed)
```bash
# Production build logs
npx @railway/cli logs -e production --build

# Staging build logs
npx @railway/cli logs -e staging --build
```

### 3. Check deployment status
```bash
# Production latest deployment
npx @railway/cli deployment list -e production --json | jq '.[0] | {id, status, createdAt}'

# Staging latest deployment
npx @railway/cli deployment list -e staging --json | jq '.[0] | {id, status, createdAt}'
```

### 4. Check environment variables
```bash
# List variable keys in production
npx @railway/cli variables -e production --json | jq 'keys'

# List variable keys in staging
npx @railway/cli variables -e staging --json | jq 'keys'
```

---

## 3. How to Restart Services

### Restart Railway API (trigger fresh redeploy)
```bash
# Restart Production API
npx @railway/cli redeploy --environment production --yes --from-source

# Restart Staging API
npx @railway/cli redeploy --environment staging --yes --from-source
```

### Restart Local Development Services
```bash
# 1. Kill any stuck dev ports (4000, 5173, 5174)
lsof -ti:4000,5173,5174 | xargs kill -9

# 2. Start all services again
npm run dev
```

---

## 4. Top 5 Issues & Fixes

### Issue 1: "No payment methods available right now" / ABA KHQR fails
- **Cause**: Production is missing `ABA_MERCHANT_ID`, `ABA_API_KEY`, or `ABA_BASE_URL`.
- **Fix (1 minute)**:
  1. Test the payment endpoint:
     ```bash
     curl -s https://api.aichazhengdaarakawa.com/api/payment/methods
     ```
  2. If `online` is `false`, set the ABA keys in Railway:
     ```bash
     npx @railway/cli variable set --environment production "ABA_MERCHANT_ID=ec460802"
     npx @railway/cli variable set --environment production "ABA_BASE_URL=https://checkout-sandbox.payway.com.kh"
     ```
  3. Redeploy:
     ```bash
     npx @railway/cli redeploy --environment production --yes --from-source
     ```

### Issue 2: "Cannot read properties of undefined (reading 'findMany')"
- **Cause**: Prisma client is outdated after schema changes.
- **Fix (30 seconds)**:
  ```bash
  cd apps/api && npx prisma generate && npx prisma db push
  ```

### Issue 3: "Port 4000/5173/5174 already in use (EADDRINUSE)"
- **Cause**: A previous dev server process did not shut down.
- **Fix (10 seconds)**:
  ```bash
  lsof -ti:4000,5173,5174 | xargs kill -9
  ```

### Issue 4: "npm ci fails: package.json and package-lock.json out of sync"
- **Cause**: Package lock file differs across sub-apps in the monorepo.
- **Fix (1 minute)**:
  ```bash
  npm install --package-lock-only
  ```
  *(Note: `.npmrc` has `legacy-peer-deps=true` so CI never crashes on peer deps).*

### Issue 5: "Frontend loads blank or cannot connect to backend"
- **Cause**: Frontend was built with wrong `VITE_API_URL`.
- **Fix (1 minute)**:
  ```bash
  # For Staging:
  npm run deploy:staging

  # For Production:
  npm run deploy:prod
  ```

---

## 5. Deployment Commands

### Deploy to Staging:
```bash
# 1. API: push code to staging branch
git push origin staging

# 2. Frontend: deploy Customer Menu & Staff to Cloudflare
npm run deploy:staging
```

### Deploy to Production:
```bash
# 1. API: push code to main branch
git push origin main

# 2. Frontend: deploy Customer Menu & Staff to Cloudflare
npm run deploy:prod
```
