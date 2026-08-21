# Proxmox LXC UAT Deployment Guide

Complete step-by-step guide to deploy **Ai-Cha & Zhengda Menu** to a Proxmox LXC Container (Debian / Ubuntu).

---

## 1. Create Telegram Bot with @BotFather

1. Open Telegram and message `@BotFather`.
2. Send `/newbot`.
3. Set Name: `Ai-Cha Zhengda Menu UAT`.
4. Set Username: e.g. `aicha_zhengda_uat_bot`.
5. Copy your **Bot Token** (e.g. `123456789:ABCdef...`).
6. Enable Web Login Domain:
   - Send `/setdomain` to `@BotFather`.
   - Select your bot.
   - Enter your domain (e.g. `menu.yourdomain.com`).
7. Set Menu Button (Telegram Mini App):
   - Send `/setmenubutton` -> pick your bot -> enter URL `https://menu.yourdomain.com`.

---

## 2. Prepare Proxmox LXC Container

In your LXC shell (Ubuntu 22.04 / 24.04 or Debian 12):

```bash
apt update && apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs git nginx build-essential certbot python3-certbot-nginx
npm install -g pm2
```

---

## 3. Clone Repository & Install Dependencies

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

## 4. Configure Environment Variables

### 4.1 Backend (`apps/api/.env`)
```bash
DATABASE_URL="file:./prod.db"
PORT=4000
NODE_ENV="production"
TELEGRAM_BOT_TOKEN="YOUR_BOT_TOKEN_FROM_BOTFATHER"
WEBAPP_URL="https://menu.yourdomain.com"
STAFF_APP_URL="https://staff.yourdomain.com"

# Telegram IDs allowed to access Staff/Manager portal (comma-separated)
MANAGER_TELEGRAM_IDS="YOUR_TELEGRAM_USER_ID"
STAFF_TELEGRAM_IDS=""

# ABA PayWay Integration (Optional in sandbox/cash-only)
ABA_MERCHANT_ID=""
ABA_API_KEY=""
ABA_BASE_URL="https://checkout-sandbox.payway.com.kh"
ABA_WEBHOOK_SECRET=""
```

### 4.2 Customer Menu App (`apps/menu/.env.production`)
```bash
VITE_API_URL="https://api.yourdomain.com"
VITE_BOT_NAME="aicha_zhengda_uat_bot"
```

### 4.3 Staff Portal (`apps/staff/.env.production`)
```bash
VITE_API_URL="https://api.yourdomain.com"
VITE_BOT_NAME="aicha_zhengda_uat_bot"
```

---

## 5. Database Initialization & Build

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

## 6. Run API Backend with PM2

```bash
cd /var/www/aicha-uat/apps/api
pm2 start dist/index.js --name "aicha-api"
pm2 save
pm2 startup
```

---

## 7. Setup Nginx Reverse Proxy & Static Hosting

Create `/etc/nginx/sites-available/aicha.conf`:

```nginx
# 1. API Server
server {
    listen 80;
    server_name api.yourdomain.com;
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
    server_name menu.yourdomain.com;
    root /var/www/aicha-uat/apps/menu/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}

# 3. Staff & Manager Portal
server {
    listen 80;
    server_name staff.yourdomain.com;
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

## 8. Generate Free SSL Certificates (HTTPS)

```bash
certbot --nginx -d api.yourdomain.com -d menu.yourdomain.com -d staff.yourdomain.com
```

---

## 9. Verification Checklist

- [ ] `https://api.yourdomain.com/` returns `{"status":"ok"}`
- [ ] `https://menu.yourdomain.com/` opens the customer menu with real items
- [ ] `https://staff.yourdomain.com/` opens the Staff portal with Telegram login
- [ ] Manager can add/edit menu items and toppings
- [ ] Telegram Bot Mini App opens cleanly from Telegram app
