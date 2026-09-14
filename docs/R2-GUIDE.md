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
R2_PUBLIC_URL=https://menu-img.aichazhengdaarakawa.com
```

> **Important:** Use the custom domain `https://menu-img.aichazhengdaarakawa.com`, not the `pub-xxx.r2.dev` URL. The custom domain goes through the Image CDN Worker which adds cache headers.

### 5. Install SDK
```bash
cd apps/api && npm install @aws-sdk/client-s3
```

## Architecture

```
Manager uploads image (apps/staff)
    → POST /api/upload (apps/api/src/app.ts)
    → r2.ts uploads to R2 bucket with Cache-Control header
    → Returns URL: https://menu-img.aichazhengdaarakawa.com/menu/{timestamp}-{random}.ext
    → URL saved in database (MenuItem.image field)

Customer opens menu (apps/menu)
    → SWR fetches /api/catalog (menu data with image URLs)
    → <img src="https://menu-img.aichazhengdaarakawa.com/menu/...">
    → Image CDN Worker (apps/image-cdn) reads from R2
    → Worker adds Cache-Control: public, max-age=31536000, immutable
    → Browser caches image for 1 year
    → Next visit: instant load from browser cache (no network)
```

## Cost
- Free tier: 10 GB storage + 10M reads/month
- ~100 menu items × 200KB = 20 MB (well under free tier)
- Workers free tier: 100,000 requests/day

---

# Image CDN Worker ⚡

> Cloudflare Worker that serves R2 images with cache headers for fast loading.

## Why This Exists

| Problem | Cause |
|---|---|
| Images load slow on repeat visits | R2 custom domains return no `Cache-Control` header |
| Browser re-downloads images every time | R2 returns `cf-cache-status: DYNAMIC` (no CDN caching) |
| Cloudflare Cache Rules don't work | R2 custom domain responses bypass Cache Rules |

**Solution:** A Cloudflare Worker sits between the browser and R2. It reads the image from R2 and adds proper cache headers.

## How It Works

```
Browser → menu-img.aichazhengdaarakawa.com → Image CDN Worker → R2 Bucket
                                                    ↓
                                         Adds cache headers:
                                         Cache-Control: public, max-age=31536000, immutable
                                         CDN-Cache-Control: public, max-age=31536000
                                                    ↓
                                         Browser caches for 1 year
```

### Cache Headers Explained

| Header | What it does |
|---|---|
| `Cache-Control: public, max-age=31536000, immutable` | Browser caches image for 1 year. `immutable` = don't even check if changed. |
| `CDN-Cache-Control: public, max-age=31536000` | Cloudflare edge caches image for 1 year. |
| `Access-Control-Allow-Origin: *` | Allows any website to load images (CORS). |

### Why `immutable` Is Safe

Each image URL contains a unique timestamp + random string:
```
menu/1789187759184-6is8c3.png
     └── timestamp ──┘└ random ┘
```
When manager uploads a new image, a **new URL** is created. Old cached images never go stale.

## Files

| File | Purpose |
|---|---|
| `apps/image-cdn/src/index.ts` | Worker code — reads R2, adds cache headers |
| `apps/image-cdn/wrangler.json` | Worker config — R2 binding, custom domain route |
| `apps/image-cdn/package.json` | Dependencies (wrangler, cloudflare types) |
| `apps/api/src/r2.ts` | Upload helper — also sets `CacheControl` on upload |

## Deploy

```bash
cd apps/image-cdn
npm install
npx wrangler deploy
```

The worker deploys to `menu-img.aichazhengdaarakawa.com` (configured in `wrangler.json`).

## Verify Cache Is Working

Run this command twice:
```bash
curl -sI "https://menu-img.aichazhengdaarakawa.com/menu/YOUR_IMAGE.png" | grep -i cache
```

You should see:
```
cache-control: public, max-age=31536000, immutable
cdn-cache-control: public, max-age=31536000
```

## Upload Cache Headers

When the API uploads a new image to R2, it also sets `CacheControl` on the object itself (in `apps/api/src/r2.ts`):

```ts
await client.send(new PutObjectCommand({
  Bucket: config.bucket,
  Key: key,
  Body: fileBuffer,
  ContentType: mimeType,
  CacheControl: 'public, max-age=31536000, immutable',  // ← this line
}));
```

This is a backup — even if the Worker is removed, R2 will still send cache headers for newly uploaded images.

## Troubleshooting

### Images return 404
- Check that the image key exists in the R2 bucket
- Check the URL path matches the R2 key (e.g. `/menu/1789187759184-6is8c3.png`)

### Cache-Control header missing
- Check the Worker is deployed: `npx wrangler deploy`
- Check DNS: `menu-img.aichazhengdaarakawa.com` should show as "Worker" type in Cloudflare DNS

### Images still slow on first visit
- First visit always downloads from R2 (normal)
- Only repeat visits are instant (cached in browser)
- If images are large (>500KB), consider compressing them before upload
