# Proxmox LXC Deployment with Cloudflare Tunnel (Recommended)

Using **Cloudflare Tunnel (`cloudflared`)** is the **safest and best method** because:
1. **No open ports** needed on your home/office router (No port 80/443 forwarding).
2. **Hides your Proxmox server IP** completely behind Cloudflare DDoS protection.
3. **Automatic SSL/HTTPS**: Cloudflare provides and renews SSL certificates automatically.
4. **Works behind CGNAT** and dynamic public IPs without port forwarding.

---

## 1. Step-by-Step Setup Guide

### Step 1: Install `cloudflared` on your Proxmox LXC

In your Proxmox LXC terminal:

```bash
# Add Cloudflare GPG key and repository
mkdir -p --mode=0755 /usr/share/keyrings
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' | tee /etc/apt/sources.list.d/cloudflared.list

# Install cloudflared
apt update && apt install -y cloudflared
```

---

### Step 2: Create Tunnel from Cloudflare Dashboard (Easiest & Best)

1. Open **[Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/)**.
2. Go to **Networks** -> **Tunnels**.
3. Click **Add a tunnel** -> Select **Cloudflared** -> Click **Next**.
4. Name your tunnel: `aicha-arakawa-tunnel` -> Click **Save tunnel**.
5. Choose **Debian / Ubuntu** and copy the one-line install command, for example:
   ```bash
   cloudflared service install eyJhIjoi...TOKEN...
   ```
6. Paste and run that command in your Proxmox LXC terminal.
7. Click **Next** on the Cloudflare dashboard.

---

### Step 3: Add Public Hostnames in Cloudflare Dashboard

In the **Public Hostname** tab of your tunnel, add 3 routes:

| Subdomain | Domain | Service Type | URL |
|---|---|---|---|
| `api` | `aichazhengdaarakawa.com` | `HTTP` | `http://localhost:4000` |
| `menu` | `aichazhengdaarakawa.com` | `HTTP` | `http://localhost:80` (or Nginx port) |
| `staff` | `aichazhengdaarakawa.com` | `HTTP` | `http://localhost:80` (or Nginx port) |

*Cloudflare creates the DNS records automatically!*

---

### Step 4: Configure Local Nginx on Proxmox LXC

In `/etc/nginx/sites-available/aicha.conf`:

```nginx
# 1. Customer Menu WebApp
server {
    listen 80;
    server_name menu.aichazhengdaarakawa.com;
    root /var/www/aicha-uat/apps/menu/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}

# 2. Staff & Manager Portal
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

Enable Nginx:
```bash
ln -s /etc/nginx/sites-available/aicha.conf /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

---

### Step 5: Start Backend API with PM2

```bash
cd /var/www/aicha-uat/apps/api
pm2 start dist/index.js --name "aicha-api"
pm2 save
pm2 startup
```

---

## 2. Summary Comparison

| Feature | Direct IP / Port Forward | Cloudflare Tunnel (Recommended) |
|---|---|---|
| **Security** | Low (exposes home/office IP) | **Maximum** (IP completely hidden) |
| **Router Ports** | Needs 80 and 443 open | **0 ports open** |
| **SSL Setup** | Manual Certbot / renewal | **100% Automatic by Cloudflare** |
| **Works on CGNAT** | No | **Yes** |
