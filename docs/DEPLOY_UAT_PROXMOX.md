# Proxmox LXC UAT Deployment Guide

Complete step-by-step guide to deploy **Ai-Cha & Zhengda Menu** to your Proxmox LXC container using your domain: `aichazhengdaarakawa.com`.

---

## 1. Cloudflare DNS Setup

In your Cloudflare Dashboard for `aichazhengdaarakawa.com`:
Add 3 **A Records** pointing to your Proxmox LXC public IP address:

| Type | Name      | Content / Target           | Proxy status                                                         |
| ---- | --------- | -------------------------- | -------------------------------------------------------------------- |
| A    | `api`   | `YOUR_PROXMOX_PUBLIC_IP` | DNS only (grey cloud) initially for SSL, then Proxied (orange cloud) |
| A    | `menu`  | `YOUR_PROXMOX_PUBLIC_IP` | DNS only (grey cloud) initially for SSL, then Proxied (orange cloud) |
| A    | `staff` | `YOUR_PROXMOX_PUBLIC_IP` | DNS only (grey cloud) initially for SSL, then Proxied (orange cloud) |

---

## 2. Create & Configure Telegram Bot with @BotFather

1. Open Telegram and message `@BotFather`.
2. Send `/newbot`.
3. Set Bot Name: `Ai-Cha & Zhengda Arakawa`.
4. Set Username: e.g. `aicha_zhengda_arakawa_bot`.
5. Copy your **Bot Token** (e.g. `123456789:ABCdef...`).
6. Set Web Login Domain:
   - Send `/setdomain` to `@BotFather`.
   - Select your bot.
   - Enter: `menu.aichazhengdaarakawa.com`.
7. Set Menu Button (Telegram Mini App):
   - Send `/setmenubutton` -> pick your bot -> enter URL: `https://menu.aichazhengdaarakawa.com`.

---

## 3. Prepare Proxmox LXC Container

In your LXC terminal (Ubuntu 22.04 / 24.04 or Debian 12):

```bash
apt update && apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt install -y nodejs git nginx build-essential certbot python3-certbot-nginx
npm install -g pm2
```

---

## 4. Clone Repository & Install Dependencies

```bash
mkdir -p /var/www
cd /var/www
git clone https://github.com/rithsila/Ai-cha-zhengda-menu.git aicha-uat
cd /var/www/aicha-uat

# Initialize SDK submodules & build
git submodule update --init --recursive
npm install
npm --prefix packages/aba-payway-sdk-unofficial run build
```

---

## 5. Configure Production Environment Files

### 5.1 Backend (`apps/api/.env`)

```bash
DATABASE_URL="file:./prod.db"
PORT=4000
NODE_ENV="production"
TELEGRAM_BOT_TOKEN="YOUR_BOT_TOKEN_FROM_BOTFATHER"
WEBAPP_URL="https://menu.aichazhengdaarakawa.com"
STAFF_APP_URL="https://staff.aichazhengdaarakawa.com"

# Set your Telegram User ID here for Manager Access (comma-separated for multiple)
MANAGER_TELEGRAM_IDS="YOUR_TELEGRAM_USER_ID"
STAFF_TELEGRAM_IDS=""

# CORS Allowed Origins
CORS_ORIGINS="https://menu.aichazhengdaarakawa.com,https://staff.aichazhengdaarakawa.com"

# ABA PayWay Integration (Optional if sandbox or cash-only)
ABA_MERCHANT_ID=""
ABA_API_KEY=""
ABA_BASE_URL="https://checkout-sandbox.payway.com.kh"
ABA_WEBHOOK_SECRET=""
```

### 5.2 Customer Menu App (`apps/menu/.env.production`)

```bash
VITE_API_URL="https://api.aichazhengdaarakawa.com"
VITE_BOT_NAME="aicha_zhengda_arakawa_bot"
```

### 5.3 Staff & Manager Portal (`apps/staff/.env.production`)

```bash
VITE_API_URL="https://api.aichazhengdaarakawa.com"
VITE_BOT_NAME="aicha_zhengda_arakawa_bot"
```

---

## 6. Database Initialization & Production Build

```bash
# Push Prisma SQLite database and seed 48 items
cd /var/www/aicha-uat/apps/api
npx prisma db push
npx tsx src/seed.ts

# Build all applications for production
cd /var/www/aicha-uat
npm run build --workspaces
```

---

## 7. Run API Backend with PM2

```bash
cd /var/www/aicha-uat/apps/api
pm2 start dist/index.js --name "aicha-api"
pm2 save
pm2 startup
```

---

## 8. Configure Nginx Reverse Proxy & Static Hosting

Create `/etc/nginx/sites-available/aicha.conf`:

```nginx
# 1. API Server
server {
    listen 80;
    server_name api.aichazhengdaarakawa.com;
    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# 2. Customer Menu WebApp
server {
    listen 80;
    server_name menu.aichazhengdaarakawa.com;
    root /var/www/aicha-uat/apps/menu/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}

# 3. Staff & Manager Portal
server {
    listen 80;
    server_name staff.aichazhengdaarakawa.com;
    root /var/www/aicha-uat/apps/staff/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Enable site configuration:

```bash
ln -s /etc/nginx/sites-available/aicha.conf /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

---

## 9. Generate SSL Certificates with Certbot (HTTPS)

```bash
certbot --nginx -d api.aichazhengdaarakawa.com -d menu.aichazhengdaarakawa.com -d staff.aichazhengdaarakawa.com
```

*(Note: In Cloudflare, set SSL/TLS encryption mode to **Full** or **Full (strict)**).*

---

## 10. Verification & Live URLs

- **Customer Menu**: `https://menu.aichazhengdaarakawa.com`
- **Staff & Manager Hub**: `https://staff.aichazhengdaarakawa.com`
- **Backend API**: `https://api.aichazhengdaarakawa.com`
