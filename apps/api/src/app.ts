import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { randomUUID } from 'crypto';
import { ABAPayWay, generateKHQR, generateTransactionId, getQRExpiration } from 'aba-payway-sdk-unofficial';
import { settleOrderPoints, refundOrderPoints, getConfigNumber, CONFIG_DEFAULTS } from './loyalty';
import { verifyTelegramLogin, isLoginFresh } from './telegram-auth';
import {
  isValidBuilding, isValidRoom, isValidName, isValidPhone, normalizePhone, formatAddress,
} from './address';
import {
  issueToken, requireStaff, requireManager,
  staffRoleOf, loginRateLimit, recordFailedLogin, clearFailedLogins,
  roleForTelegramId, resolveStaffAccount, adminTelegramIds,
  resolveStaffByPhone, createStaffOtp, verifyStaffOtpCode, canonicalPhone, adminPhoneNumbers,
} from './auth';
import { sendOtpSms } from './sms';
import {
  issueCustomerToken, requireCustomer, requireSelf, resolveCustomer,
} from './telegram-initdata';
import { prisma, withWriteRetry, WRITE_TX_OPTIONS } from './db';
import { sendTelegramNotification } from './bot';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { uploadToR2, isR2Configured } from './r2';

// The tuned SQLite client lives in db.ts; re-exported here because every
// caller (and every test) already imports it from this module.
export { prisma };

/** The only statuses an order may hold. */
const ORDER_STATUSES = ['pending', 'preparing', 'ready', 'completed', 'cancelled', 'paid'];

/** Browser origins allowed to call this API. Comma-separated in CORS_ORIGINS. */
function allowedOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:5174';
  return raw.split(',').map((o) => o.trim()).filter(Boolean);
}

function isOriginAllowed(origin?: string): boolean {
  if (!origin) return true;
  const list = allowedOrigins();
  if (list.includes(origin) || list.includes('*')) return true;
  try {
    const parsed = new URL(origin);
    if (
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname.endsWith('.localhost') ||
      parsed.hostname.endsWith('.workers.dev') ||
      parsed.hostname.endsWith('.pages.dev') ||
      parsed.hostname.includes('aichazhengdaarakawa.com')
    ) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

export function createApp() {
  const app = express();

  app.use(helmet());

  // Middleware to parse raw body for webhook verification
  app.use(express.json({
    verify: (req: any, res, buf) => {
      req.rawBody = buf;
    }
  }));

  // Only the shop's own front-ends may call the API from a browser. Requests
  // with no Origin (the ABA webhook, curl, the bot) are not browser requests
  // and are left alone; the routes' own auth still applies to them.
  app.use(cors({
    origin: (origin, callback) => callback(null, isOriginAllowed(origin)),
    credentials: true,
  }));

  app.get('/api/auth/telegram/callback', async (req, res) => {
    try {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (!token) return res.status(503).json({ error: 'Telegram login is not configured on this server' });

      const params: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.query)) {
        if (typeof v === 'string') params[k] = v;
      }
      if (!verifyTelegramLogin(params, token)) {
        return res.status(401).json({ error: 'Invalid Telegram login data' });
      }
      if (!isLoginFresh(params.auth_date)) {
        return res.status(401).json({ error: 'Login expired, please try again' });
      }

      const user = await prisma.user.upsert({
        where: { telegramUserId: params.id },
        update: {
          username: params.username || undefined,
          firstName: params.first_name || undefined,
          lastName: params.last_name || undefined,
        },
        create: {
          telegramUserId: params.id,
          username: params.username || null,
          firstName: params.first_name || null,
          lastName: params.last_name || null,
        },
      });

      // Hand back a session token, not the raw id. A raw id in the URL is only
      // a claim: anyone could paste someone else's number and be believed.
      const { token: customerToken } = issueCustomerToken(user.telegramUserId);
      const target = process.env.WEBAPP_URL || 'http://localhost:5173';
      res.redirect(`${target}#tg_token=${encodeURIComponent(customerToken)}`);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Login failed' });
    }
  });

  // Staff and Manager login via Telegram Auth Callback or Direct Telegram verification
  app.get('/api/auth/staff-telegram/callback', async (req, res) => {
    try {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      const params: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.query)) {
        if (typeof v === 'string') params[k] = v;
      }

      let telegramId = params.id;
      // In production, strictly verify Telegram signature
      if (token) {
        if (!verifyTelegramLogin(params, token)) {
          return res.status(401).json({ error: 'Invalid Telegram login data' });
        }
        if (!isLoginFresh(params.auth_date)) {
          return res.status(401).json({ error: 'Login expired, please try again' });
        }
      } else if (process.env.NODE_ENV === 'production') {
        return res.status(503).json({ error: 'Telegram login is not configured on this server' });
      }

      if (!telegramId) {
        return res.status(400).json({ error: 'Missing Telegram user ID' });
      }

      const account = await resolveStaffAccount(telegramId, prisma);
      if (!account) {
        return res.status(403).json({ error: 'Access denied: You are not authorized as staff or manager' });
      }

      const { token: staffAuthToken, expiresAt } = issueToken(account.role, { telegramUserId: telegramId, name: account.name });
      const target = process.env.STAFF_APP_URL || 'http://localhost:5174';
      res.redirect(`${target}#staff_token=${encodeURIComponent(staffAuthToken)}&role=${encodeURIComponent(account.role)}&name=${encodeURIComponent(account.name)}&expiresAt=${expiresAt}`);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Staff Telegram login failed' });
    }
  });

  // Direct Staff/Manager Login endpoint via Telegram ID / WebApp / Widget
  app.post('/api/auth/staff-telegram-login', loginRateLimit, async (req, res) => {
    try {
      const { telegramUserId, initData, telegramAuth } = req.body || {};
      let verifiedTelegramId: string | null = null;

      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      if (initData && botToken) {
        const { verifyInitData } = await import('./telegram-initdata');
        const verified = verifyInitData(initData, botToken);
        if (verified) verifiedTelegramId = String(verified.id);
      }

      if (telegramAuth && typeof telegramAuth === 'object' && botToken && !verifiedTelegramId) {
        const strFields: Record<string, string> = {};
        for (const [k, v] of Object.entries(telegramAuth)) {
          strFields[k] = String(v);
        }
        if (verifyTelegramLogin(strFields, botToken)) {
          verifiedTelegramId = String(strFields.id);
        }
      }

      // If user provided Telegram User ID directly from browser
      if (!verifiedTelegramId && telegramUserId) {
        verifiedTelegramId = String(telegramUserId).trim();
      }

      if (!verifiedTelegramId) {
        recordFailedLogin(req);
        return res.status(401).json({ error: 'Please provide a valid Telegram User ID' });
      }

      let account = await resolveStaffAccount(verifiedTelegramId, prisma);

      // Fallback in local dev if no admins/staff configured yet
      if (!account && process.env.ALLOW_UNVERIFIED_TELEGRAM === '1' && process.env.NODE_ENV !== 'production' && adminTelegramIds().length === 0) {
        account = { role: 'manager', name: 'Dev Admin' };
      }

      if (!account) {
        recordFailedLogin(req);
        return res.status(403).json({ error: 'Access denied: Telegram ID is not authorized. Please ask an Admin or Manager to add your account.' });
      }

      clearFailedLogins(req);
      const { token, expiresAt } = issueToken(account.role, { telegramUserId: verifiedTelegramId, name: account.name });
      res.json({ ok: true, token, role: account.role, name: account.name, expiresAt, telegramUserId: verifiedTelegramId });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Login error' });
    }
  });

  // Staff Phone OTP Login - Step 1: Send OTP code (only for admin-authorized phone numbers)
  app.post('/api/auth/staff/send-otp', loginRateLimit, async (req, res) => {
    try {
      const { phoneNumber } = req.body || {};
      const phone = canonicalPhone(phoneNumber);

      if (!phone || !isValidPhone(phone)) {
        return res.status(400).json({ error: 'Please enter a valid phone number.' });
      }

      const staff = await resolveStaffByPhone(phone, prisma);
      if (!staff) {
        recordFailedLogin(req);
        return res.status(403).json({
          error: 'Access denied: Phone number is not authorized. Please ask an Admin or Manager to grant access to your phone number.',
        });
      }

      const { code, allowed, waitSeconds } = createStaffOtp(phone);
      if (!allowed) {
        return res.status(429).json({
          error: `Please wait ${waitSeconds || 60} seconds before requesting a new code.`,
        });
      }

      const smsResult = await sendOtpSms(phone, code, staff.telegramUserId);
      if (!smsResult.success) {
        return res.status(500).json({
          error: smsResult.error || 'Failed to send verification code. Please try again later.',
        });
      }

      res.json({
        ok: true,
        message: 'Verification code sent successfully.',
        phone: phone,
      });
    } catch (error) {
      console.error('Error in send-otp:', error);
      res.status(500).json({ error: 'Internal server error while sending verification code.' });
    }
  });

  // Staff Phone OTP Login - Step 2: Verify OTP code & Issue session token
  app.post('/api/auth/staff/verify-otp', loginRateLimit, async (req, res) => {
    try {
      const { phoneNumber, code } = req.body || {};
      const phone = canonicalPhone(phoneNumber);

      if (!phone) {
        return res.status(400).json({ error: 'Phone number is required.' });
      }
      if (!code || typeof code !== 'string') {
        return res.status(400).json({ error: 'Verification code is required.' });
      }

      const staff = await resolveStaffByPhone(phone, prisma);
      if (!staff) {
        recordFailedLogin(req);
        return res.status(403).json({ error: 'Access denied: Phone number is not authorized.' });
      }

      const otpCheck = verifyStaffOtpCode(phone, code);
      if (!otpCheck.valid) {
        recordFailedLogin(req);
        return res.status(400).json({ error: otpCheck.reason || 'Invalid verification code.' });
      }

      clearFailedLogins(req);
      const { token, expiresAt } = issueToken(staff.role, { phoneNumber: phone, name: staff.name });

      res.json({
        ok: true,
        token,
        role: staff.role,
        name: staff.name,
        phoneNumber: phone,
        expiresAt,
      });
    } catch (error) {
      console.error('Error in verify-otp:', error);
      res.status(500).json({ error: 'Internal server error while verifying code.' });
    }
  });

  // ABA PayWay client. Built per call, not once at startup, so the server picks
  // up credentials without a restart and tests can vary the environment.
  // Returns null when unconfigured -- never fall back to fake credentials, which
  // only turns a missing-config problem into an unreadable "wrong hash" error.
  function getAbaClient(): ABAPayWay | null {
    const merchantId = process.env.ABA_MERCHANT_ID || '';
    const apiKey = process.env.ABA_API_KEY || '';
    if (!merchantId || !apiKey) return null;
    return new ABAPayWay({
      merchantId,
      apiKey,
      baseUrl: process.env.ABA_BASE_URL || 'https://checkout-sandbox.payway.com.kh',
      webhookSecret: process.env.ABA_WEBHOOK_SECRET || '',
    });
  }

  const ABA_NOT_CONFIGURED =
    'ABA PayWay is not configured. Set ABA_MERCHANT_ID and ABA_API_KEY in apps/api/.env.';

  app.get('/', (req, res) => {
    res.json({ status: 'ok', message: 'Ai-Cha & Zhengda API is running' });
  });

  app.get('/api/branches', async (req, res) => {
    try {
      const branches = await prisma.branch.findMany({
        where: { isActive: true }
      });
      res.json(branches);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch branches' });
    }
  });

  // The path id is kept for the client's sake, but it must match the verified
  // caller: reading it straight from the URL handed anyone else's phone number,
  // address and points to any anonymous caller. The upsert is now only ever the
  // caller's own row, so it can no longer be used to create junk users.
  app.get('/api/user/:telegramUserId', requireCustomer, requireSelf, async (req, res) => {
    try {
      // Express 5 widens a param to string | string[] once middleware is in
      // front of the handler; this route only ever matches one segment.
      const telegramUserId = String(req.params.telegramUserId);
      if (!telegramUserId) {
        return res.status(400).json({ error: 'Missing telegramUserId' });
      }
      const user = await prisma.user.upsert({
        where: { telegramUserId },
        update: {},
        create: { telegramUserId, loyaltyPoints: 0 }
      });
      res.json(user);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch user' });
    }
  });

  /**
   * The customer's own profile: who to call and which Arakawa room to deliver to.
   * Only the fields present in the body are written, so saving an address never
   * wipes a phone number the bot stored earlier (see bot.ts `on('contact')`).
   *
   * Only the signed-in customer may write their own row.
   */
  app.put('/api/user/:telegramUserId/profile', requireCustomer, requireSelf, async (req, res) => {
    try {
      const telegramUserId = String(req.params.telegramUserId);
      if (!telegramUserId) {
        return res.status(400).json({ error: 'Missing telegramUserId' });
      }
      const { contactName, phoneNumber, building, roomNumber } = req.body || {};
      const data: Record<string, string> = {};

      if (contactName !== undefined) {
        if (!isValidName(contactName)) {
          return res.status(400).json({ error: 'Name must be 2 to 60 characters.' });
        }
        data.contactName = contactName.trim();
      }
      if (phoneNumber !== undefined) {
        if (!isValidPhone(phoneNumber)) {
          return res.status(400).json({ error: 'Phone number must have 8 to 15 digits.' });
        }
        data.phoneNumber = normalizePhone(phoneNumber);
      }
      if (building !== undefined) {
        if (!isValidBuilding(building)) {
          return res.status(400).json({ error: 'Building must be A to G.' });
        }
        data.building = building.trim().toUpperCase();
      }
      if (roomNumber !== undefined) {
        if (!isValidRoom(roomNumber)) {
          return res.status(400).json({ error: 'Room must be 4 digits, floor 01 to 22 (example: 1110).' });
        }
        data.roomNumber = roomNumber.trim();
      }

      const user = await prisma.user.upsert({
        where: { telegramUserId },
        update: data,
        create: { telegramUserId, loyaltyPoints: 0, ...data }
      });
      res.json(user);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to save profile' });
    }
  });

  // Static folder for uploaded menu images
  const uploadDir = path.resolve(process.cwd(), 'public/uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  app.use('/uploads', express.static(uploadDir));

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (_req, file, cb) => {
      if (file.mimetype.startsWith('image/')) cb(null, true);
      else cb(new Error('Only image files are allowed'));
    },
  });

  app.post('/api/upload', requireStaff, upload.single('image'), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded' });
    }
    try {
      if (!isR2Configured()) {
        return res.status(503).json({ error: 'Image storage (R2) is not configured. Set R2_* env vars in .env' });
      }
      const publicUrl = await uploadToR2(req.file.buffer, req.file.originalname, req.file.mimetype);
      res.json({ url: publicUrl });
    } catch (err: any) {
      console.error('R2 upload error:', err);
      res.status(500).json({ error: 'Failed to upload image' });
    }
  });

  app.get('/api/catalog', async (req, res) => {
    try {
      const includeInactive = req.query.includeInactive === '1' || req.query.includeInactive === 'true';
      const catalog = await prisma.menuItem.findMany({
        where: includeInactive ? undefined : { isActive: true },
        include: {
          modifiers: {
            include: {
              options: true
            }
          }
        }
      });
      res.json(catalog);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch catalog' });
    }
  });

  app.post('/api/catalog', requireManager, async (req, res) => {
    try {
      const { brand, category, name, description, basePrice, image, modifiers, earnsStamp, canClaim } = req.body || {};
      if (!name || typeof name !== 'string' || !brand || typeof brand !== 'string' || !category || typeof category !== 'string') {
        return res.status(400).json({ error: 'Name, brand, and category are required' });
      }
      const parsedPrice = Number(basePrice);
      if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
        return res.status(400).json({ error: 'Valid basePrice is required' });
      }

      const item = await prisma.menuItem.create({
        data: {
          brand: brand.trim().toLowerCase(),
          category: category.trim(),
          name: name.trim(),
          description: typeof description === 'string' ? description.trim() : null,
          basePrice: parsedPrice,
          image: typeof image === 'string' && image.trim() ? image.trim() : null,
          isActive: true,
          isSoldOut: false,
          earnsStamp: earnsStamp !== undefined ? Boolean(earnsStamp) : true,
          canClaim: canClaim !== undefined ? Boolean(canClaim) : false,
          modifiers: Array.isArray(modifiers) && modifiers.length > 0 ? {
            create: modifiers.map((group: any) => ({
              key: group.key || group.id || randomUUID(),
              name: group.name,
              type: group.type || 'single',
              required: Boolean(group.required),
              options: {
                create: (group.options || []).map((opt: any) => ({
                  key: opt.key || opt.id || randomUUID(),
                  name: opt.name,
                  priceDelta: Number(opt.priceDelta) || 0,
                }))
              }
            }))
          } : undefined
        },
        include: {
          modifiers: {
            include: {
              options: true
            }
          }
        }
      });

      res.status(201).json(item);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to create menu item' });
    }
  });

  app.put('/api/catalog/:id', requireManager, async (req, res) => {
    try {
      const id = String(req.params.id);
      const { brand, category, name, description, basePrice, image, isActive, isSoldOut, earnsStamp, canClaim, modifiers } = req.body || {};

      const existing = await prisma.menuItem.findUnique({
        where: { id },
        include: { modifiers: { include: { options: true } } }
      });
      if (!existing) {
        return res.status(404).json({ error: 'Menu item not found' });
      }

      const data: any = {};
      if (brand !== undefined) data.brand = String(brand).trim().toLowerCase();
      if (category !== undefined) data.category = String(category).trim();
      if (name !== undefined) data.name = String(name).trim();
      if (description !== undefined) data.description = description ? String(description).trim() : null;
      if (basePrice !== undefined) {
        const parsed = Number(basePrice);
        if (Number.isNaN(parsed) || parsed < 0) return res.status(400).json({ error: 'Invalid base price' });
        data.basePrice = parsed;
      }
      if (image !== undefined) data.image = image ? String(image).trim() : null;
      if (isActive !== undefined) data.isActive = Boolean(isActive);
      if (isSoldOut !== undefined) data.isSoldOut = Boolean(isSoldOut);
      if (earnsStamp !== undefined) data.earnsStamp = Boolean(earnsStamp);
      if (canClaim !== undefined) data.canClaim = Boolean(canClaim);

      // If modifiers are supplied, sync them (delete removed, create new)
      if (Array.isArray(modifiers)) {
        await prisma.$transaction(async (tx) => {
          // Delete existing modifier groups & options for this item
          const groupIds = existing.modifiers.map(g => g.id);
          if (groupIds.length > 0) {
            await tx.modifierOption.deleteMany({
              where: { modifierGroupId: { in: groupIds } }
            });
            await tx.modifierGroup.deleteMany({
              where: { menuItemId: id }
            });
          }

          // Create new groups & options
          for (const group of modifiers) {
            await tx.modifierGroup.create({
              data: {
                key: group.key || group.id || randomUUID(),
                name: group.name,
                type: group.type || 'single',
                required: Boolean(group.required),
                menuItemId: id,
                options: {
                  create: (group.options || []).map((opt: any) => ({
                    key: opt.key || opt.id || randomUUID(),
                    name: opt.name,
                    priceDelta: Number(opt.priceDelta) || 0,
                  }))
                }
              }
            });
          }

          await tx.menuItem.update({
            where: { id },
            data
          });
        }, WRITE_TX_OPTIONS);
      } else {
        await prisma.menuItem.update({
          where: { id },
          data
        });
      }

      const updated = await prisma.menuItem.findUnique({
        where: { id },
        include: { modifiers: { include: { options: true } } }
      });
      res.json(updated);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to update menu item' });
    }
  });

  app.delete('/api/catalog/:id', requireManager, async (req, res) => {
    try {
      const id = String(req.params.id);
      const item = await prisma.menuItem.findUnique({
        where: { id },
        include: { orderItems: true }
      });
      if (!item) {
        return res.status(404).json({ error: 'Menu item not found' });
      }

      // If it was ordered before, soft delete to preserve receipts
      if (item.orderItems && item.orderItems.length > 0) {
        await prisma.menuItem.update({
          where: { id },
          data: { isActive: false }
        });
        return res.json({ ok: true, softDeleted: true });
      }

      // Otherwise clean delete with modifiers
      await prisma.$transaction(async (tx) => {
        const groups = await tx.modifierGroup.findMany({ where: { menuItemId: id } });
        const groupIds = groups.map(g => g.id);
        if (groupIds.length > 0) {
          await tx.modifierOption.deleteMany({
            where: { modifierGroupId: { in: groupIds } }
          });
          await tx.modifierGroup.deleteMany({
            where: { menuItemId: id }
          });
        }
        await tx.menuItem.delete({ where: { id } });
      }, WRITE_TX_OPTIONS);

      res.json({ ok: true, deleted: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to delete menu item' });
    }
  });

  app.put('/api/catalog/:id/sold-out', requireStaff, async (req, res) => {
    try {
      // Express 5 types a route param as string | string[]; these routes only
      // ever match one segment. Same coercion the user routes below use.
      const id = String(req.params.id);
      const { isSoldOut } = req.body;
      const item = await prisma.menuItem.update({
        where: { id },
        data: { isSoldOut }
      });
      res.json(item);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to update sold out status' });
    }
  });

  app.post('/api/orders', resolveCustomer, async (req, res) => {
    try {
      const { items, paymentMethod, branchId, orderType, building, roomNumber, contactName, contactPhone, pointsToUse, claimReward } = req.body;

      // The owner of an order is the verified caller, never a body field —
      // a body field let anyone attach an order to a stranger and spend their
      // points. Guest checkout stays open, it just earns and spends nothing.
      const telegramUserId = (req as any).telegramUserId as string | null;

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Order must contain at least one item' });
      }

      const menuItems = await prisma.menuItem.findMany({
        where: { id: { in: items.map((i: any) => i?.menuItemId).filter(Boolean) } },
        include: { modifiers: { include: { options: true } } },
      });

      let itemsTotal = 0;
      const pricedItems: { menuItemId: string; quantity: number; price: number; modifiers: string }[] = [];
      for (const item of items) {
        const menuItem = menuItems.find((m) => m.id === item?.menuItemId);
        if (!menuItem) {
          return res.status(400).json({ error: `Unknown menu item: ${item?.menuItemId}` });
        }
        if (menuItem.isSoldOut) {
          return res.status(400).json({ error: `Sold out: ${menuItem.name}` });
        }
        const quantity = Number.isInteger(item.quantity) && item.quantity > 0 ? item.quantity : 1;
        const selected = item.selectedModifiers && typeof item.selectedModifiers === 'object' ? item.selectedModifiers : {};
        let unitPrice = menuItem.basePrice;
        // The client sends static catalog ids ("toppings" -> "boba"); rows carry
        // those in `key` and a generated uuid in `id`. Match either one.
        for (const [groupKey, groupSelection] of Object.entries(selected)) {
          const group = menuItem.modifiers.find(
            (g) => g.key === groupKey || g.id === groupKey || g.name === groupKey
          );
          const pool = group ? group.options : menuItem.modifiers.flatMap((g) => g.options);
          for (const chosen of ([] as any[]).concat(groupSelection ?? [])) {
            const oid = chosen?.id;
            if (!oid) continue;
            const opt = pool.find((o) => o.key === oid || o.id === oid);
            if (!opt) {
              // Never silently drop an option — that is how a cart total and the
              // charged total drift apart.
              return res.status(400).json({ error: `Unknown modifier option: ${groupKey}/${oid}` });
            }
            unitPrice += opt.priceDelta;   // DB price, never the client's
          }
        }
        const lineTotal = Math.round(unitPrice * quantity * 100) / 100;
        itemsTotal += lineTotal;
        pricedItems.push({ menuItemId: menuItem.id, quantity, price: lineTotal, modifiers: JSON.stringify(selected) });
      }

      // Customer details: validated strictly for delivery, captured gracefully for pickup
      let delivery: { building: string; room: string; name: string; phone: string } | null = null;
      let orderContactName: string | null = null;
      let orderContactPhone: string | null = null;
      let orderBuilding: string | null = null;
      let orderRoom: string | null = null;

      const saved = telegramUserId
        ? await prisma.user.findUnique({ where: { telegramUserId } })
        : null;

      if (orderType === 'delivery') {
        const b = (building ?? saved?.building ?? '').toString().trim().toUpperCase();
        const r = (roomNumber ?? saved?.roomNumber ?? '').toString().trim();
        const n = (contactName ?? saved?.contactName ?? '').toString().trim();
        const p = normalizePhone(contactPhone ?? saved?.phoneNumber ?? '');

        if (!isValidBuilding(b)) {
          return res.status(400).json({ error: 'Please choose your building (A to G).' });
        }
        if (!isValidRoom(r)) {
          return res.status(400).json({ error: 'Room must be 4 digits, floor 01 to 22 (example: 1110).' });
        }
        if (!isValidName(n)) {
          return res.status(400).json({ error: 'Please add the name we should ask for at the door.' });
        }
        if (!isValidPhone(p)) {
          return res.status(400).json({ error: 'Please add a phone number we can call.' });
        }
        delivery = { building: b, room: r, name: n, phone: p };
        orderContactName = n;
        orderContactPhone = p;
        orderBuilding = b;
        orderRoom = r;
      } else {
        const b = (building ?? saved?.building ?? '').toString().trim().toUpperCase();
        const r = (roomNumber ?? saved?.roomNumber ?? '').toString().trim();
        const n = (contactName ?? saved?.contactName ?? [saved?.firstName, saved?.lastName].filter(Boolean).join(' ') ?? (saved?.username ? `@${saved.username}` : '')).toString().trim();
        const rawPhone = contactPhone ?? saved?.phoneNumber ?? '';
        const p = rawPhone ? normalizePhone(rawPhone) : '';

        if (b && isValidBuilding(b)) orderBuilding = b;
        if (r) orderRoom = r;
        if (n) orderContactName = n;
        if (p && isValidPhone(p)) orderContactPhone = p;
      }

      const DELIVERY_FEE = await getConfigNumber(prisma, 'deliveryFee', CONFIG_DEFAULTS.deliveryFee);
      const deliveryFee = orderType === 'delivery' ? DELIVERY_FEE : 0;
      const serverTotal = Math.round((itemsTotal + deliveryFee) * 100) / 100;

      const POINTS_PER_DOLLAR = await getConfigNumber(prisma, 'pointsPerDollar', CONFIG_DEFAULTS.pointsPerDollar);
      const EARN_POINTS_PER_DOLLAR = await getConfigNumber(prisma, 'earnPointsPerDollar', CONFIG_DEFAULTS.earnPointsPerDollar);

      let requestedPoints = 0;
      // An anonymous order has no balance to spend from.
      if (telegramUserId && typeof pointsToUse === 'number' && Number.isInteger(pointsToUse) && pointsToUse > 0) {
        requestedPoints = pointsToUse;
      }
      const maxByTotal = Math.floor(serverTotal * POINTS_PER_DOLLAR);

      // Make sure the customer row exists *before* the transaction. Creating it
      // is not something that has to be atomic with the order, and SQLite has a
      // single writer, so every statement kept out of the transaction is lock
      // time given back to the next checkout. Everything above (menu lookup,
      // pricing, address validation, config reads) is outside for the same reason.
      if (telegramUserId) {
        await withWriteRetry(() => prisma.user.upsert({
          where: { telegramUserId },
          update: {},
          create: { telegramUserId, loyaltyPoints: 0 },
        }));
      }

      // The id is minted here, before the first attempt, so that every attempt
      // writes the same row. That is what makes the retry below safe: a lock
      // timeout can in principle fire on a transaction that did commit, and if
      // it does, the next attempt finds the order already there and returns it
      // instead of creating a second one and spending the points twice. When
      // the transaction really was rolled back nothing exists under this id, so
      // the balance is re-read and the points are reserved exactly once.
      const orderId = randomUUID();

      // Points are reserved (deducted) the moment the order is created, inside one
      // transaction. Otherwise two pending orders could each redeem the same balance.
      const order = await withWriteRetry(async (attempt) => {
        if (attempt > 0) {
          const existing = await prisma.order.findUnique({ where: { id: orderId } });
          if (existing) return existing;
        }
        return prisma.$transaction(async (tx) => {
          let available = 0;
          if (telegramUserId) {
            const user = await tx.user.findUnique({ where: { telegramUserId } });
            available = user?.loyaltyPoints ?? 0;
          }

          let pointsRedeemed = 0;
          let discountApplied = 0;

          // 10-stamp free reward item claim (supports multiple items if customer has enough stamps)
          const stampCostForFreeItem = Math.round(POINTS_PER_DOLLAR); // e.g. 100 points = 10 stamps
          const claimableUnits: { name: string; unitPrice: number }[] = [];
          for (const p of pricedItems) {
            const m = menuItems.find((item) => item.id === p.menuItemId);
            if (m && m.canClaim) {
              const unitPrice = Math.round((p.price / p.quantity) * 100) / 100;
              for (let i = 0; i < p.quantity; i++) {
                claimableUnits.push({ name: m.name, unitPrice });
              }
            }
          }
          // Sort descending so highest value claimable items get discounted first
          claimableUnits.sort((a, b) => b.unitPrice - a.unitPrice);

          const maxStampsAvailable = Math.floor(available / stampCostForFreeItem);
          const maxClaimableCount = Math.min(claimableUnits.length, maxStampsAvailable);

          let claimCount = 0;
          if (typeof claimReward === 'number' && claimReward > 0) {
            claimCount = Math.min(Math.floor(claimReward), maxClaimableCount);
          } else if (Boolean(claimReward)) {
            claimCount = Math.min(1, maxClaimableCount);
          }

          if (claimCount > 0) {
            const claimedUnits = claimableUnits.slice(0, claimCount);
            const totalClaimDiscount = claimedUnits.reduce((sum, u) => sum + u.unitPrice, 0);
            discountApplied = Math.min(totalClaimDiscount, serverTotal);
            pointsRedeemed = claimCount * stampCostForFreeItem;
          } else if (requestedPoints > 0) {
            pointsRedeemed = Math.max(0, Math.min(requestedPoints, available, maxByTotal));
            discountApplied = pointsRedeemed / POINTS_PER_DOLLAR;
          }

          const finalAmount = Math.round((serverTotal - discountApplied) * 100) / 100;

          // Points/stamps earned: only from paid portion of items where earnsStamp !== false
          const totalItemsAmount = pricedItems.reduce((sum, p) => sum + p.price, 0);
          const eligibleItemsAmount = pricedItems.reduce((sum, p) => {
            const m = menuItems.find((item) => item.id === p.menuItemId);
            return sum + (m && m.earnsStamp !== false ? p.price : 0);
          }, 0);

          let pointsEarned = 0;
          if (claimCount > 0) {
            // Free item claimed: only remaining paid portion of stamp-eligible items earns stamps
            const paidStampAmount = Math.max(0, eligibleItemsAmount - discountApplied);
            pointsEarned = Math.floor(paidStampAmount * EARN_POINTS_PER_DOLLAR);
          } else {
            // Normal checkout (with or without points cash discount)
            const stampRatio = totalItemsAmount > 0 ? eligibleItemsAmount / totalItemsAmount : 1;
            pointsEarned = Math.floor(finalAmount * EARN_POINTS_PER_DOLLAR * stampRatio);
          }

          if (telegramUserId && pointsRedeemed > 0) {
            await tx.user.update({
              where: { telegramUserId },
              data: { loyaltyPoints: { decrement: pointsRedeemed } }
            });
          }

          return tx.order.create({
            data: {
              id: orderId,
              totalAmount: finalAmount,
              paymentMethod,
              telegramUserId,
              status: 'pending',
              pickupCode: `A-${Math.floor(100 + Math.random() * 900)}`,
              orderType: orderType || 'pickup',
              deliveryAddress: delivery ? formatAddress(delivery.building, delivery.room) : null,
              deliveryBuilding: orderBuilding,
              deliveryRoom: orderRoom,
              contactName: orderContactName,
              contactPhone: orderContactPhone,
              deliveryFee,
              branchId: branchId || null,
              pointsEarned,
              pointsRedeemed,
              discountApplied,
              items: { create: pricedItems }
            }
          });
        }, WRITE_TX_OPTIONS);
      });

      res.json(order);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to create order' });
    }
  });

  // Staff Dashboard APIs
  //
  // `since` (ISO timestamp) bounds the board to the current shift. Without it the
  // route returns every order ever placed, which the tablet then re-downloads every
  // 5 seconds and paints red because every row is hours old. The param is optional
  // so older clients keep working, but the staff dashboard always sends it.
  app.get('/api/orders', requireStaff, async (req, res) => {
    try {
      const { branchId, since } = req.query;

      const whereClause: any = {};
      if (branchId) {
        // Orders with no branch are included too. Delivery orders used to be
        // saved with branchId null, and because the dashboard auto-selects the
        // first branch they never appeared on the board at all — the kitchen
        // simply never saw them. An unassigned order showing on every board is
        // the safe failure; an order nobody can see is not.
        whereClause.OR = [{ branchId: String(branchId) }, { branchId: null }];
      }
      if (since) {
        const from = new Date(String(since));
        if (Number.isNaN(from.getTime())) {
          return res.status(400).json({ error: '`since` must be an ISO timestamp' });
        }
        whereClause.createdAt = { gte: from };
      }

      const orders = await prisma.order.findMany({
        where: whereClause,
        include: {
          items: {
            include: {
              menuItem: true
            }
          },
          branch: true
        },
        orderBy: {
          createdAt: 'desc'
        }
      });
      res.json(orders);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch orders' });
    }
  });

  // Order history carries the delivery address and phone of every past order,
  // so it is readable only by the customer it belongs to.
  app.get('/api/orders/user/:telegramUserId', requireCustomer, requireSelf, async (req, res) => {
    try {
      const telegramUserId = String(req.params.telegramUserId);
      const userOrders = await prisma.order.findMany({
        where: { telegramUserId },
        include: {
          items: {
            include: { menuItem: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
      res.json(userOrders);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch user orders' });
    }
  });

  app.get('/api/orders/:id', resolveCustomer, async (req, res) => {
    try {
      const id = String(req.params.id);
      const order = await prisma.order.findUnique({
        where: { id },
        include: {
          items: {
            include: { menuItem: true }
          }
        }
      });
      if (!order) return res.status(404).json({ error: 'Not found' });

      // Readable by the customer who placed it, or by staff working the board.
      // A guest order (telegramUserId null) stays readable by whoever holds its
      // id: there is no account to check it against, and the guest needs the
      // receipt. Accepted trade-off — the id is a random uuid, not a counter.
      const caller = (req as any).telegramUserId as string | null;
      const isOwner = order.telegramUserId != null && order.telegramUserId === caller;
      const isGuestOrder = order.telegramUserId == null;
      if (!isOwner && !isGuestOrder && !staffRoleOf(req as any)) {
        return res.status(403).json({ error: 'This order belongs to someone else' });
      }

      res.json(order);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch order' });
    }
  });

  app.put('/api/orders/:id/status', requireStaff, async (req, res) => {
    try {
      const id = String(req.params.id);
      const { status, cancelReason } = req.body;

      // Prisma stores whatever string it is given, so an unchecked status ends
      // up on the tablet and in the customer's order list verbatim.
      if (!ORDER_STATUSES.includes(status)) {
        return res.status(400).json({ error: `status must be one of: ${ORDER_STATUSES.join(', ')}` });
      }

      const updatedOrder = await prisma.order.update({
        where: { id },
        data: {
          status,
          ...(status === 'cancelled' && cancelReason ? { cancelReason: String(cancelReason).trim() } : {}),
        },
      });

      if (status === 'completed' || status === 'paid') {
        await settleOrderPoints(prisma, id);
      } else if (status === 'cancelled') {
        await refundOrderPoints(prisma, id);

        if (updatedOrder.telegramUserId) {
          const reasonMsg = updatedOrder.cancelReason ? `\n\n<b>Reason:</b> ${updatedOrder.cancelReason}` : '';
          const codeMsg = updatedOrder.pickupCode ? ` (#${updatedOrder.pickupCode})` : '';
          await sendTelegramNotification(
            updatedOrder.telegramUserId,
            `❌ <b>Order Cancelled</b>\n\nYour order${codeMsg} has been cancelled by the store.${reasonMsg}\n\nIf you have questions or paid via QR, please check with our counter staff.`,
          );
        }
      }

      res.json(updatedOrder);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to update order status' });
    }
  });

  // ---------------------------------------------------------------------------
  // ABA PayWay Integration
  //
  // Three routes:
  //   POST /api/payment/aba/create        -> start a payment, return QR + links
  //   POST /api/payment/aba/webhook       -> ABA tells us a payment landed
  //   GET  /api/payment/aba/status/:id    -> we ask ABA whether it landed
  //
  // The status route exists because webhooks cannot reach a laptop on
  // localhost. It is the only thing that makes the flow testable in dev.
  // ---------------------------------------------------------------------------

  const AMOUNT_TOLERANCE = 0.01; // one cent, for float comparison

  /**
   * May this caller start or watch the payment for this order?
   *
   * Holding an order id used to be enough, so a stranger who learned one could
   * open someone else's payment or poll its state. The rule now matches
   * GET /api/orders/:id:
   *   - the signed-in customer who placed it, or
   *   - any logged-in staff member (they work the board and take payments), or
   *   - anybody, if the order is a guest order.
   *
   * The guest hole is deliberate and the same trade-off as on the order route: a
   * guest never signed in, so there is no identity to check against, and they
   * still have to be able to pay. The id is a random uuid, not a counter.
   *
   * Returns null when the caller is allowed, otherwise the response to send:
   * 401 when nothing was proved at all, 403 when someone else's identity was.
   */
  function denyPaymentAccess(
    req: express.Request,
    order: { telegramUserId: string | null }
  ): { code: number; body: { error: string } } | null {
    if (order.telegramUserId == null) return null;
    const caller = (req as any).telegramUserId as string | null;
    if (caller === order.telegramUserId) return null;
    if (staffRoleOf(req as any)) return null;
    if (!caller) return { code: 401, body: { error: 'Telegram sign-in required' } };
    return { code: 403, body: { error: 'This order belongs to someone else' } };
  }

  /**
   * Confirm a transaction with ABA and, only if it really is approved for the
   * right amount, mark the order paid and settle its loyalty points.
   *
   * Never trusts a caller-supplied status: both the webhook and the status
   * route go back to ABA. Idempotent, because ABA retries webhooks.
   */
  async function confirmAbaPayment(aba: ABAPayWay, orderId: string, transactionId: string) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return { ok: false as const, code: 404, body: { error: 'Order not found' } };
    if (order.status === 'paid') {
      return { ok: true as const, status: 'APPROVED', orderStatus: order.status, order };
    }
    // A cancelled order has already had its reserved points handed back, so a
    // late payment must not quietly revive it. Do not test pointsSettled here:
    // refundOrderPoints sets that flag too, and treating it as "already paid"
    // would report a cancelled order as APPROVED.
    if (order.status === 'cancelled') {
      return { ok: false as const, code: 409, body: { error: 'This order was cancelled' } };
    }

    const result = await aba.checkStatus(transactionId);
    if (!result.success) {
      return { ok: false as const, code: 502, body: { error: result.error || 'Could not reach ABA PayWay' } };
    }
    if (result.status !== 'APPROVED') {
      return { ok: true as const, status: result.status, orderStatus: order.status, order };
    }

    // ABA says approved -- but for how much? A short payment must not settle
    // the order.
    if (result.amount != null && Math.abs(result.amount - order.totalAmount) > AMOUNT_TOLERANCE) {
      console.error(
        `ABA amount mismatch on order ${order.id}: paid ${result.amount}, expected ${order.totalAmount}`
      );
      return {
        ok: false as const,
        code: 400,
        body: { error: 'Paid amount does not match the order total' },
      };
    }

    const updated = await prisma.order.update({ where: { id: order.id }, data: { status: 'paid' } });
    await settleOrderPoints(prisma, order.id);
    return { ok: true as const, status: 'APPROVED', orderStatus: updated.status, order: updated };
  }

  /**
   * Which payment methods the shop can actually take right now.
   *
   * The customer app asks this before drawing the payment step, so KHQR is only
   * offered when ABA credentials really exist. Learning it from a failed payment
   * instead would mean the first customer on every device still picks KHQR and
   * hits an error. Public on purpose: it exposes no secret, only "can we take a
   * QR payment today", and the checkout screen needs it before anyone signs in.
   */
  app.get('/api/payment/methods', (req, res) => {
    res.json({ cash: true, online: getAbaClient() !== null });
  });

  app.post('/api/payment/aba/create', resolveCustomer, async (req, res) => {
    try {
      const aba = getAbaClient();
      if (!aba) return res.status(503).json({ error: ABA_NOT_CONFIGURED });

      const { orderId } = req.body || {};
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { items: { include: { menuItem: true } } },
      });
      if (!order) return res.status(404).json({ error: 'Order not found' });

      const denied = denyPaymentAccess(req, order);
      if (denied) return res.status(denied.code).json(denied.body);

      if (order.status === 'paid') {
        return res.status(409).json({ error: 'This order is already paid' });
      }
      if (order.totalAmount <= 0) {
        return res.status(409).json({ error: 'Order total must be greater than zero' });
      }

      // Reuse the transaction id if one exists, so refreshing the checkout page
      // does not leave an orphaned transaction behind at ABA.
      const transactionId = order.transactionId || generateTransactionId();
      const expiresAt = getQRExpiration();

      await prisma.order.update({
        where: { id: order.id },
        data: { transactionId, paymentExpiresAt: expiresAt },
      });

      const purchase = await aba.createPurchase({
        transactionId,
        amount: order.totalAmount,
        currency: 'USD',
        items: Buffer.from(
          JSON.stringify(
            order.items.map((line) => ({
              name: line.menuItem?.name ?? 'Item',
              quantity: line.quantity,
              price: line.price,
            }))
          )
        ).toString('base64'),
        // Without this ABA returns no qr_string and no deeplink, and the
        // customer is shown an empty QR box.
        paymentOption: 'abapay_khqr',
        firstName: 'Ai-Cha',
        lastName: 'Customer',
        returnUrl: process.env.ABA_WEBHOOK_URL || '',
        cancelUrl: process.env.WEBAPP_URL || '',
        continueSuccessUrl: process.env.WEBAPP_URL || '',
        returnParams: order.id,
      });

      if (!purchase.success) {
        // Pass ABA's own message through -- "wrong hash" and "invalid merchant"
        // are the two failures you actually hit, and hiding them wastes hours.
        console.error(`ABA createPurchase failed for order ${order.id}: ${purchase.error}`);
        return res.status(502).json({ error: purchase.error || 'Failed to create ABA purchase' });
      }

      const khqrSvg = await generateKHQR({
        emvData: purchase.qrString ?? '',
        amount: order.totalAmount,
        currency: 'USD',
        merchantName: 'Ai-Cha & Zhengda',
        headerColor: '#d42b2b',
      });

      res.json({
        checkoutUrl: purchase.checkoutUrl,
        abapayDeeplink: purchase.abapayDeeplink,
        qrString: purchase.qrString,
        khqrSvg,
        transactionId,
        expiresAt: expiresAt.toISOString(),
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to generate ABA payment' });
    }
  });

  app.post('/api/payment/aba/webhook', async (req: any, res) => {
    try {
      const aba = getAbaClient();
      if (!aba) return res.status(503).json({ error: ABA_NOT_CONFIGURED });

      // No secret means no way to tell ABA apart from anyone else on the
      // internet, so refuse rather than trust the payload.
      const secret = process.env.ABA_WEBHOOK_SECRET || '';
      if (!secret) {
        return res.status(503).json({
          error: 'ABA_WEBHOOK_SECRET is not set, so webhooks cannot be verified and are rejected.',
        });
      }

      const rawBody = req.rawBody?.toString('utf-8') ?? '';
      const signature = String(req.headers['x-payway-signature'] || '');
      const isValid = await aba.verifyWebhook(rawBody, signature, secret);
      if (!isValid) return res.status(401).json({ error: 'Invalid signature' });

      // ABA sends either a base64 'response' blob or flat fields.
      let tranId: string | undefined;
      if (req.body?.response) {
        const decoded = Buffer.from(req.body.response, 'base64').toString('utf-8');
        tranId = JSON.parse(decoded)?.tran_id;
      } else {
        tranId = req.body?.tran_id;
      }
      if (!tranId) return res.status(400).json({ error: 'Missing tran_id' });

      const order = await prisma.order.findUnique({ where: { transactionId: tranId } });
      if (!order) return res.status(404).json({ error: 'Order not found for that transaction' });

      const result = await confirmAbaPayment(aba, order.id, tranId);
      if (!result.ok) return res.status(result.code).json(result.body);

      res.json({ message: 'Webhook processed', status: result.status, orderStatus: result.orderStatus });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to process webhook' });
    }
  });

  app.get('/api/payment/aba/status/:orderId', resolveCustomer, async (req, res) => {
    try {
      const aba = getAbaClient();
      if (!aba) return res.status(503).json({ error: ABA_NOT_CONFIGURED });

      const order = await prisma.order.findUnique({ where: { id: String(req.params.orderId) } });
      if (!order) return res.status(404).json({ error: 'Order not found' });

      const denied = denyPaymentAccess(req, order);
      if (denied) return res.status(denied.code).json(denied.body);

      const base = {
        orderStatus: order.status,
        pickupCode: order.pickupCode,
        expiresAt: order.paymentExpiresAt?.toISOString() ?? null,
      };

      if (order.status === 'paid') return res.json({ status: 'APPROVED', ...base });
      if (!order.transactionId) {
        return res.status(409).json({ error: 'No ABA payment has been started for this order' });
      }
      if (order.paymentExpiresAt && order.paymentExpiresAt.getTime() < Date.now()) {
        return res.json({ status: 'EXPIRED', ...base });
      }

      const result = await confirmAbaPayment(aba, order.id, order.transactionId);
      if (!result.ok) return res.status(result.code).json(result.body);

      res.json({
        status: result.status,
        orderStatus: result.orderStatus,
        pickupCode: result.order.pickupCode,
        expiresAt: result.order.paymentExpiresAt?.toISOString() ?? null,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to check payment status' });
    }
  });

  // Loyalty & Rewards API
  app.get('/api/config', async (req, res) => {
    try {
      const configs = await prisma.systemConfig.findMany();
      res.json(configs);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch config' });
    }
  });

  app.put('/api/config', requireManager, async (req, res) => {
    try {
      const { key, value } = req.body || {};
      if (!(key in CONFIG_DEFAULTS)) {
        return res.status(400).json({ error: `Unknown config key. Allowed: ${Object.keys(CONFIG_DEFAULTS).join(', ')}` });
      }
      const num = Number(value);
      // deliveryFee may legitimately be 0 (free inside Arakawa); the rate keys may not.
      const min = key === 'deliveryFee' ? 0 : 1;
      if (!Number.isFinite(num) || num < min) {
        return res.status(400).json({ error: `value must be a number of at least ${min}` });
      }
      const config = await prisma.systemConfig.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) }
      });
      res.json(config);
    } catch (err) {
      res.status(500).json({ error: 'Failed to update config' });
    }
  });

  app.get('/api/rewards', async (req, res) => {
    try {
      const where = req.query.includeInactive === '1' ? {} : { isActive: true };
      const rewards = await prisma.reward.findMany({ where, orderBy: { pointsCost: 'asc' } });
      res.json(rewards);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch rewards' });
    }
  });

  app.post('/api/rewards', requireManager, async (req, res) => {
    try {
      const { name, description, pointsCost, image } = req.body || {};
      if (typeof name !== 'string' || !name.trim() || !Number.isInteger(pointsCost) || pointsCost <= 0) {
        return res.status(400).json({ error: 'name (text) and pointsCost (whole number above 0) are required' });
      }
      const reward = await prisma.reward.create({
        data: { name: name.trim(), description: description || null, pointsCost, image: image || null }
      });
      res.json(reward);
    } catch (err) {
      res.status(500).json({ error: 'Failed to create reward' });
    }
  });

  app.put('/api/rewards/:id', requireManager, async (req, res) => {
    try {
      // Handing req.body to Prisma let any column be written, including a
      // negative pointsCost. Copy across the editable fields only, checking
      // them the same way POST /api/rewards does.
      const { name, description, pointsCost, image, isActive } = req.body || {};
      const data: Record<string, unknown> = {};

      if (name !== undefined) {
        if (typeof name !== 'string' || !name.trim()) {
          return res.status(400).json({ error: 'name must be text' });
        }
        data.name = name.trim();
      }
      if (pointsCost !== undefined) {
        if (!Number.isInteger(pointsCost) || pointsCost <= 0) {
          return res.status(400).json({ error: 'pointsCost must be a whole number above 0' });
        }
        data.pointsCost = pointsCost;
      }
      if (description !== undefined) {
        if (description !== null && typeof description !== 'string') {
          return res.status(400).json({ error: 'description must be text' });
        }
        data.description = description || null;
      }
      if (image !== undefined) {
        if (image !== null && typeof image !== 'string') {
          return res.status(400).json({ error: 'image must be text' });
        }
        data.image = image || null;
      }
      if (isActive !== undefined) {
        if (typeof isActive !== 'boolean') {
          return res.status(400).json({ error: 'isActive must be true or false' });
        }
        data.isActive = isActive;
      }

      const reward = await prisma.reward.update({
        where: { id: String(req.params.id) },
        data
      });
      res.json(reward);
    } catch (err) {
      res.status(500).json({ error: 'Failed to update reward' });
    }
  });

  app.delete('/api/rewards/:id', requireManager, async (req, res) => {
    try {
      await prisma.reward.delete({ where: { id: String(req.params.id) } });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete reward' });
    }
  });

  // Analytics API
  app.get('/api/analytics/sales', requireManager, async (req, res) => {
    try {
      // `days` bounds the report to a recent window (1 = today). Omit for all time.
      const rawDays = req.query.days;
      let since: Date | null = null;
      if (rawDays != null && String(rawDays) !== '' && String(rawDays) !== 'all') {
        const days = Number(rawDays);
        if (!Number.isInteger(days) || days < 1) {
          return res.status(400).json({ error: '`days` must be a whole number of 1 or more' });
        }
        since = new Date();
        since.setHours(0, 0, 0, 0);
        since.setDate(since.getDate() - (days - 1));
      }

      // Cash pickup orders never pass through "paid" — they end as "completed".
      const paidOrders = await prisma.order.findMany({
        where: {
          status: { in: ['paid', 'completed'] },
          ...(since ? { createdAt: { gte: since } } : {})
        },
        select: { totalAmount: true, createdAt: true }
      });

      const totalRevenue = paidOrders.reduce((sum, o) => sum + o.totalAmount, 0);
      const orderCount = paidOrders.length;

      // Group by date string (YYYY-MM-DD)
      const byDate: Record<string, number> = {};
      paidOrders.forEach(o => {
        const d = o.createdAt.toISOString().split('T')[0];
        byDate[d] = (byDate[d] || 0) + o.totalAmount;
      });

      res.json({ totalRevenue, orderCount, byDate });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch analytics' });
    }
  });

  // Find-only user lookup (manager only — exposes PII)
  app.get('/api/users/:telegramUserId', requireManager, async (req, res) => {
    try {
      const user = await prisma.user.findUnique({
        where: { telegramUserId: String(req.params.telegramUserId) }
      });
      if (!user) return res.status(404).json({ error: 'User not found' });
      res.json(user);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch user' });
    }
  });

  // User Points Adjust
  app.put('/api/users/:telegramUserId/points', requireManager, async (req, res) => {
    try {
      const { points } = req.body || {};
      if (typeof points !== 'number' || !Number.isInteger(points) || points < 0) {
        return res.status(400).json({ error: 'points must be a whole number of 0 or more' });
      }
      const user = await prisma.user.update({
        where: { telegramUserId: String(req.params.telegramUserId) },
        data: { loyaltyPoints: points }
      });
      res.json(user);
    } catch (err) {
      res.status(500).json({ error: 'Failed to update user points' });
    }
  });

  // Staff Account Management Endpoints (Manager / Admin Only)
  app.get('/api/staff-accounts', requireManager, async (req, res) => {
    try {
      const dbAccounts = await prisma.staffAccount.findMany({
        orderBy: { createdAt: 'desc' }
      });
      const envAdmins = adminTelegramIds().map((id) => ({
        id: `env-${id}`,
        telegramUserId: id,
        phoneNumber: null,
        name: 'Admin',
        role: 'manager' as const,
        isActive: true,
        isEnvAdmin: true,
        createdAt: new Date().toISOString(),
      }));

      // Combine env admins and DB accounts without duplicate telegram user IDs
      const envIds = new Set(envAdmins.map((a) => a.telegramUserId));
      const filteredDb = dbAccounts.filter((a) => !a.telegramUserId || !envIds.has(a.telegramUserId));

      res.json([...envAdmins, ...filteredDb]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch staff accounts' });
    }
  });

  app.post('/api/staff-accounts', requireManager, async (req, res) => {
    try {
      const { telegramUserId, phoneNumber, name, role } = req.body || {};
      const cleanId = typeof telegramUserId === 'string' || typeof telegramUserId === 'number' ? String(telegramUserId).trim() : '';
      const cleanPhone = phoneNumber ? canonicalPhone(phoneNumber) : '';
      const cleanName = typeof name === 'string' ? name.trim() : '';
      const cleanRole = role === 'manager' ? 'manager' : 'staff';

      if (!cleanName) {
        return res.status(400).json({ error: 'Staff name is required' });
      }

      if (!cleanPhone && !cleanId) {
        return res.status(400).json({ error: 'Either a valid Phone Number or Telegram User ID is required' });
      }

      if (cleanId && !/^\d+$/.test(cleanId)) {
        return res.status(400).json({ error: 'Telegram User ID must be numeric' });
      }

      if (cleanPhone && !isValidPhone(cleanPhone)) {
        return res.status(400).json({ error: 'Invalid phone number format' });
      }

      let account;
      if (cleanPhone) {
        account = await prisma.staffAccount.upsert({
          where: { phoneNumber: cleanPhone },
          create: {
            phoneNumber: cleanPhone,
            telegramUserId: cleanId || null,
            name: cleanName,
            role: cleanRole,
            isActive: true,
          },
          update: {
            name: cleanName,
            role: cleanRole,
            telegramUserId: cleanId || undefined,
            isActive: true,
          },
        });
      } else {
        account = await prisma.staffAccount.upsert({
          where: { telegramUserId: cleanId },
          create: {
            telegramUserId: cleanId,
            phoneNumber: null,
            name: cleanName,
            role: cleanRole,
            isActive: true,
          },
          update: {
            name: cleanName,
            role: cleanRole,
            isActive: true,
          },
        });
      }

      res.json(account);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to create or update staff account' });
    }
  });

  app.put('/api/staff-accounts/:id', requireManager, async (req, res) => {
    try {
      const { name, phoneNumber, telegramUserId, role, isActive } = req.body || {};
      const updateData: any = {};
      if (typeof name === 'string' && name.trim()) updateData.name = name.trim();
      if (phoneNumber !== undefined) {
        const cleaned = phoneNumber ? canonicalPhone(phoneNumber) : null;
        if (cleaned && !isValidPhone(cleaned)) {
          return res.status(400).json({ error: 'Invalid phone number format' });
        }
        updateData.phoneNumber = cleaned;
      }
      if (telegramUserId !== undefined) {
        const cleanId = telegramUserId ? String(telegramUserId).trim() : null;
        if (cleanId && !/^\d+$/.test(cleanId)) {
          return res.status(400).json({ error: 'Telegram ID must be numeric' });
        }
        updateData.telegramUserId = cleanId;
      }
      if (role === 'staff' || role === 'manager') updateData.role = role;
      if (typeof isActive === 'boolean') updateData.isActive = isActive;

      const account = await prisma.staffAccount.update({
        where: { id: String(req.params.id) },
        data: updateData,
      });
      res.json(account);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to update staff account' });
    }
  });

  app.delete('/api/staff-accounts/:id', requireManager, async (req, res) => {
    try {
      await prisma.staffAccount.delete({
        where: { id: String(req.params.id) },
      });
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to remove staff account' });
    }
  });

  // Customer Feedback & Issue Reports Endpoints (Manager / Admin View)
  app.get('/api/feedback', requireManager, async (req, res) => {
    try {
      const reports = await prisma.feedbackReport.findMany({
        orderBy: { createdAt: 'desc' },
      });
      res.json(reports);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch feedback reports' });
    }
  });

  app.post('/api/feedback', async (req, res) => {
    try {
      const { message, telegramUserId, userName, userPhone } = req.body || {};
      const cleanMessage = typeof message === 'string' ? message.trim() : '';
      if (!cleanMessage) {
        return res.status(400).json({ error: 'Message is required' });
      }

      const report = await prisma.feedbackReport.create({
        data: {
          message: cleanMessage,
          telegramUserId: telegramUserId ? String(telegramUserId) : null,
          userName: userName ? String(userName) : null,
          userPhone: userPhone ? String(userPhone) : null,
          status: 'new',
        },
      });

      // Send Telegram alert to managers / admins if configured
      try {
        const { sendTelegramNotification } = await import('./bot');
        const envAdmins = adminTelegramIds();
        const dbManagers = await prisma.staffAccount.findMany({
          where: { role: 'manager', isActive: true },
          select: { telegramUserId: true },
        });
        const allManagerIds = Array.from(new Set([...envAdmins, ...dbManagers.map((m) => m.telegramUserId).filter((id): id is string => Boolean(id))]));
        const alertText = `🚨 <b>New Customer Report / Feedback</b>\n\n<b>From:</b> ${report.userName || 'Customer'}${report.telegramUserId ? ` (<code>${report.telegramUserId}</code>)` : ''}\n<b>Phone:</b> ${report.userPhone || 'Not provided'}\n\n<b>Message:</b>\n${report.message}`;
        for (const managerId of allManagerIds) {
          await sendTelegramNotification(managerId, alertText);
        }
      } catch (notifyErr) {
        console.error('Error sending feedback notification:', notifyErr);
      }

      res.status(201).json(report);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to submit feedback' });
    }
  });

  app.put('/api/feedback/:id/status', requireManager, async (req, res) => {
    try {
      const { status } = req.body || {};
      if (!['new', 'reviewed', 'resolved'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }
      const updated = await prisma.feedbackReport.update({
        where: { id: String(req.params.id) },
        data: { status },
      });
      res.json(updated);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to update feedback status' });
    }
  });

  app.delete('/api/feedback/:id', requireManager, async (req, res) => {
    try {
      await prisma.feedbackReport.delete({
        where: { id: String(req.params.id) },
      });
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to delete feedback' });
    }
  });

  return app;
}
