# Staff Phone OTP Authentication & Plasgate SMS Setup Guide

This guide walks you through testing and deploying Phone Number OTP Login for the Staff Portal using **Plasgate SMS Gateway**.

---

## 1. Why Did the Error in the Screenshot Happen?

In your screenshot:
- **Error:** `Unexpected token '<', "<!DOCTYPE "... is not valid JSON`
- **Cause:** The frontend (`apps/staff`) was running, but the API backend (`apps/api` on port 4000) was not running.
- **Fix:** Start both with `npm run dev` at the root folder. We also configured a proxy in `apps/staff/vite.config.ts` and improved error messages.

---

## 2. Step-by-Step Testing in Development

### Step 1: Start All Services
From the project root folder:
```bash
npm run dev
```
*(This starts API on port 4000, Staff Portal on port 5174, and Customer Menu on port 5173).*

---

### Step 2: Authorize a Staff Phone Number

#### Method A: Via Manager Dashboard (Recommended)
1. Open `http://localhost:5174` in your browser.
2. Log in as Manager.
3. Click the **"Staff & Accounts"** tab.
4. Click **"Add Staff / Manager"**.
5. Enter:
   - **Name:** e.g., `Sok Dara`
   - **Phone Number:** e.g., `070433443` or `+85570433443`
   - **Role:** `Staff` or `Manager`
6. Click **"Save & Grant Access"**.

#### Method B: Via `.env` (Admin Fallback)
In `apps/api/.env`:
```env
ADMIN_PHONE_NUMBERS="+85570433443,070433443"
```

---

### Step 3: Test Staff Login with OTP

1. Open `http://localhost:5174` in your browser.
2. In **Authorized Phone Number**, enter your phone: `070433443`.
3. Click **"Send Verification Code"**.
4. If Plasgate keys are configured, you will receive an SMS. If in dev mode, check your **terminal console**:
   ```text
   ========================================
   [SMS-DEV-OTP] To Phone: 85570433443 (+85570433443)
   [SMS-DEV-OTP] 6-Digit Code: 384920
   [SMS-DEV-OTP] Message: [Ai-Cha & Zhengda] Your Staff Portal login code is: 384920. Valid for 5 minutes.
   ========================================
   ```
5. Type the 6-digit code into the screen and click **"Verify & Sign In"**.
6. ✅ You are now logged in to the Staff Portal!

---

### Step 4: Test Unauthorized Phone Rejection

1. Log out or open an incognito window.
2. Enter an unauthorized phone number (e.g., `012999999`).
3. Click **"Send Verification Code"**.
4. ✅ Result: Shows error: `Access denied: Phone number is not authorized by Admin.` (No SMS sent).

---

## 3. Production Setup for Plasgate SMS

To send real SMS to phones using your $5 Plasgate credits:

1. Log in to [Plasgate Dashboard](https://cloud.plasgate.com/).
2. Go to **SMPP & API** > **SMS Gateway**.
3. Copy your **Private Key** and **Secret**.
4. In `apps/api/.env`, add:
   ```env
   # Plasgate SMS Gateway
   PLASGATE_PRIVATE_KEY="your_private_key_here"
   PLASGATE_SECRET_KEY="your_secret_key_here"
   PLASGATE_SENDER_NAME="SMS Info"
   ```
5. Restart your API server (`npm run dev`). Real SMS will now be delivered to Cambodian phones (Smart, Cellcard, Metfone)!

---

## 4. Run Automated Tests

To verify everything:
```bash
npm --prefix apps/api test
```

---

## 5. Commit and Push to Main

When you are ready to push:
```bash
git add .
git commit -m "feat(staff): implement Plasgate SMS OTP login and manager controls"
git push origin main
```
