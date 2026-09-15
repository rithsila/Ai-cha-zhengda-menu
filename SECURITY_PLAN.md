# API Security & Scaling Plan

This is a prioritized, step-by-step plan to secure the API for public exposure via Cloudflare and prepare it for multi-replica scaling on Proxmox.

## Phase 1: Infrastructure & Ingress (Cloudflare Tunnel)
*Goal: Prevent attackers from bypassing Cloudflare to hit your server directly.*

- [ ] **Setup Cloudflare Tunnel (`cloudflared`)**: Install the tunnel on your Proxmox server. Route your domain directly to the local API port via the tunnel.
- [ ] **Close Public Ports**: Ensure your Proxmox firewall does not expose the API's port (e.g., `4000`) to the public internet. All traffic must come through the Tunnel.
- [ ] **Configure Express Proxies**: Keep `app.set('trust proxy', 1)` but ensure it only trusts the local Cloudflare Tunnel daemon's IP, so `req.ip` reflects the real visitor accurately for rate-limiting.

## Phase 2: Multi-Replica Scaling Fixes
*Goal: Ensure the app works correctly when running 2+ instances.*

- [ ] **Externalize Sessions & OTPs**: Replace the in-memory `Map` objects in `auth.ts` and `telegram-initdata.ts`. Move session tokens, OTPs, and rate limits to a **Redis** instance (or SQLite if using a shared network drive, though Redis is highly recommended for multi-node).
- [ ] **Fix Telegram Bot Polling**: Running `bot.launch()` (long-polling) on multiple instances will crash the bots. Change Telegraf to use Webhooks (`bot.createWebhook({ domain: 'api.yourdomain.com' })`) handled by an Express route.
- [ ] **Shared Upload Storage**: If using `multer.diskStorage` in the future, ensure uploaded files go directly to R2. The current R2 upload logic is good, but relies on memory.

## Phase 3: Application Hardening (Quick Wins)
*Goal: Patch immediate vulnerabilities in `app.ts`.*

- [ ] **Add Global Error Handler**: Add this to the very bottom of `app.ts` to stop leaking HTML stack traces on crash:
  ```typescript
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  });
  ```
- [ ] **Limit JSON Body Size**: Prevent memory exhaustion from huge payloads. Change `app.use(express.json())` to:
  ```typescript
  app.use(express.json({ limit: '100kb' }));
  ```
- [ ] **Fix Image Upload Memory Leak**: In `/api/upload`, `multer.memoryStorage()` holds the entire image in RAM. For 5MB limits with multiple concurrent users, this can cause Out of Memory (OOM) crashes. Switch to `multer({ dest: '/tmp/uploads' })` to buffer to disk before uploading to R2.
- [ ] **Remove Dev Backdoors**: Ensure `POST /api/auth/dev-customer-login` and the unverified Telegram ID headers are completely removed or heavily guarded by a strong secret key, regardless of `NODE_ENV`.

## Phase 4: Input Validation (Zod)
*Goal: Prevent bad data from causing 500 errors or database issues.*

- [ ] **Install Zod**: Run `npm install zod`.
- [ ] **Validate Core Endpoints**: Create Zod schemas for the most critical routes first:
  - `POST /api/orders` (Validate `items` array, `paymentMethod`, customer details).
  - `POST /api/catalog` & `PUT /api/catalog/:id` (Ensure pricing is positive, names are strings).
- [ ] **Example Zod Middleware**:
  ```typescript
  const validate = (schema) => (req, res, next) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (e) {
      res.status(400).json({ error: e.errors });
    }
  };
  ```
