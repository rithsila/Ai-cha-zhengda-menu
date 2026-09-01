# Production Go-Live Deployment Guide

This guide explains step-by-step how to deploy the entire Ai-Cha & Zhengda platform from scratch.

---

## 1. Production Architecture

| Part | Component | Hosting | Price |
| :--- | :--- | :--- | :--- |
| **Customer App** | `apps/menu` | **Cloudflare Pages** | **$0 (Free)** |
| **Kitchen App** | `apps/staff` | **Cloudflare Pages** | **$0 (Free)** |
| **Backend API** | `apps/api` | **Railway** (Hobby) | **$5 / month** |
| **Database** | SQLite (`production.db`) | **Railway Volume** (`/data`) | **Included** |
| **Image Storage** | Cloudflare R2 | **Cloudflare R2** | **$0 (Free tier)** |

---

## Phase 1: Deploy Backend to Railway (10 minutes)

### Step 1.1: Push Your Code to GitHub
Make sure all your latest changes are pushed to your GitHub repository:
```bash
git push origin main
```

### Step 1.2: Create Railway Project
1. Log in to [railway.com](https://railway.com/) with your GitHub account.
2. Click **New Project** > **Deploy from GitHub repo**.
3. Select your repository: `Ai-cha-zhengda-menu`.

### Step 1.3: Add Persistent Disk (Volume for SQLite)
1. Click your service in Railway.
2. Go to the **Volumes** tab.
3. Click **Add Volume**.
4. Set **Mount Path** to: `/data`
5. Click **Save**.

### Step 1.4: Set Environment Variables
Go to the **Variables** tab > click **Raw Editor** > paste and fill in your values:

```env
DATABASE_URL="file:/data/production.db"
PORT="4000"
TELEGRAM_BOT_TOKEN="your_bot_token_from_botfather"
WEBAPP_URL="https://ai-cha-menu.pages.dev"
STAFF_APP_URL="https://ai-cha-staff.pages.dev"
CORS_ORIGINS="https://ai-cha-menu.pages.dev,https://ai-cha-staff.pages.dev"

# Optional Cloudflare R2 (for item pictures)
R2_ACCOUNT_ID="your_r2_account_id"
R2_ACCESS_KEY_ID="your_r2_access_key"
R2_SECRET_ACCESS_KEY="your_r2_secret_key"
R2_BUCKET_NAME="your_r2_bucket_name"
R2_PUBLIC_URL="https://pub-xxxx.r2.dev"

# Optional ABA PayWay (for KHQR production)
ABA_MERCHANT_ID="your_merchant_id"
ABA_API_KEY="your_api_key"
ABA_BASE_URL="https://checkout.payway.com.kh"
```

### Step 1.5: Generate Public API URL
1. Go to the **Settings** tab.
2. Under **Networking** > **Public Networking**, click **Generate Domain**.
3. Copy your live API URL (e.g. `https://ai-cha-api-production.up.railway.app`).

---

## Phase 2: Deploy Customer Menu to Cloudflare Pages (5 minutes)

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com/) > **Compute (Workers & Pages)**.
2. Click **Create** > **Pages** > **Connect to Git**.
3. Select your GitHub repository.
4. Set the following build settings:
   - **Project Name**: `ai-cha-menu`
   - **Framework preset**: `Vite`
   - **Root directory**: `apps/menu`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
5. Add **Environment Variable**:
   - Variable name: `VITE_API_URL`
   - Value: Your Railway API URL from Phase 1 (e.g. `https://ai-cha-api-production.up.railway.app`)
6. Click **Save and Deploy**.

---

## Phase 3: Deploy Kitchen Staff App to Cloudflare Pages (5 minutes)

1. In Cloudflare, click **Create** > **Pages** > **Connect to Git** again.
2. Select your GitHub repository.
3. Set the following build settings:
   - **Project Name**: `ai-cha-staff`
   - **Framework preset**: `Vite`
   - **Root directory**: `apps/staff`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
5. Add **Environment Variable**:
   - Variable name: `VITE_API_URL`
   - Value: Your Railway API URL (e.g. `https://ai-cha-api-production.up.railway.app`)
6. Click **Save and Deploy**.

---

## Phase 4: Configure Telegram Bot (2 minutes)

1. Open Telegram and message [@BotFather](https://t.me/BotFather).
2. Type `/mybots` > select your bot.
3. Click **Bot Settings** > **Menu Button** > **Configure menu button**.
4. Enter the URL of your Customer Menu from Phase 2:
   ```text
   https://ai-cha-menu.pages.dev
   ```
5. Set the button title: `Order Now 📋`.

---

## Phase 5: Verification Checklist

1. [ ] **Menu loads**: Open `https://ai-cha-menu.pages.dev` in browser/Telegram and see menu items.
2. [ ] **Place order**: Place a test cash order and get a 4-digit pickup code.
3. [ ] **Kitchen board**: Open `https://ai-cha-staff.pages.dev` and verify the test order appears in the Pending list.
4. [ ] **Data persistence**: Restart Railway service and confirm your test order still exists.
