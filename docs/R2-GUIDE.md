# Cloudflare R2 Image Upload Guide 🪣

> Replace local image upload with Cloudflare R2 cloud storage.

## Setup Steps

### 1. Create R2 Bucket
- Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → R2 Object Storage → Create Bucket
- Name: `aicha-menu-images`, Region: **APAC**

### 2. Enable Public Access
- Bucket Settings → Public access → Allow Access
- Enable `r2.dev` subdomain → copy the URL (e.g. `https://pub-xxx.r2.dev`)

### 3. Create API Token
- R2 → Manage R2 API Tokens → Create API token
- Permissions: **Object Read & Write**, Bucket: `aicha-menu-images`
- Save the Account ID, Access Key ID, and Secret Access Key

### 4. Add to `apps/api/.env`
```env
R2_ACCOUNT_ID=your_account_id_here
R2_ACCESS_KEY_ID=your_access_key_id_here
R2_SECRET_ACCESS_KEY=your_secret_access_key_here
R2_BUCKET_NAME=aicha-menu-images
R2_PUBLIC_URL=https://pub-xxxxxxxxxx.r2.dev
```

### 5. Install SDK
```bash
cd apps/api && npm install @aws-sdk/client-s3
```

## Architecture

- Upload helper: `apps/api/src/r2.ts`
- Upload route: `POST /api/upload` in `apps/api/src/app.ts`
- Images stored in R2 bucket under `menu/` prefix
- Public URLs returned to frontend as `https://pub-xxx.r2.dev/menu/filename.png`

## Cost
- Free tier: 10 GB storage + 10M reads/month
- ~100 menu items × 200KB = 20 MB (well under free tier)
