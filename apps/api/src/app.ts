import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { ABAPayWay, generateKHQR, generateTransactionId, getQRExpiration } from 'aba-payway-sdk-unofficial';
import { settleOrderPoints, refundOrderPoints, getConfigNumber, CONFIG_DEFAULTS } from './loyalty';
import { verifyTelegramLogin, isLoginFresh } from './telegram-auth';
import {
  isValidBuilding, isValidRoom, isValidName, isValidPhone, normalizePhone, formatAddress,
} from './address';
import { issueToken, requireStaff, requireManager, staffPin, managerPin } from './auth';

export const prisma = new PrismaClient();

export function createApp() {
  const app = express();

  // Middleware to parse raw body for webhook verification
  app.use(express.json({
    verify: (req: any, res, buf) => {
      req.rawBody = buf;
    }
  }));
  app.use(cors());

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

      const target = process.env.WEBAPP_URL || 'http://localhost:5173';
      res.redirect(`${target}#tg_id=${encodeURIComponent(user.telegramUserId)}`);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Login failed' });
    }
  });

  app.post('/api/auth/staff-login', (req, res) => {
    const { pin, role } = req.body || {};
    if (typeof pin !== 'string' || (role !== 'staff' && role !== 'manager')) {
      return res.status(400).json({ error: 'pin and role are required' });
    }
    const expected = role === 'manager' ? managerPin() : staffPin();
    if (pin !== expected) return res.status(401).json({ error: 'Invalid PIN' });
    const { token, expiresAt } = issueToken(role);
    res.json({ ok: true, token, role, expiresAt });
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

  app.get('/api/user/:telegramUserId', async (req, res) => {
    try {
      const { telegramUserId } = req.params;
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
   */
  app.put('/api/user/:telegramUserId/profile', async (req, res) => {
    try {
      const { telegramUserId } = req.params;
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

  app.get('/api/catalog', async (req, res) => {
    try {
      const catalog = await prisma.menuItem.findMany({
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

  app.post('/api/orders', async (req, res) => {
    try {
      const { items, paymentMethod, telegramUserId, branchId, orderType, building, roomNumber, contactName, contactPhone, pointsToUse } = req.body;

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

      // Delivery details are validated and formatted server-side: the client may
      // send anything, and an old order must keep the address it was sent to.
      let delivery: { building: string; room: string; name: string; phone: string } | null = null;
      if (orderType === 'delivery') {
        const saved = telegramUserId
          ? await prisma.user.findUnique({ where: { telegramUserId } })
          : null;
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
      }

      const DELIVERY_FEE = await getConfigNumber(prisma, 'deliveryFee', CONFIG_DEFAULTS.deliveryFee);
      const deliveryFee = orderType === 'delivery' ? DELIVERY_FEE : 0;
      const serverTotal = Math.round((itemsTotal + deliveryFee) * 100) / 100;

      const POINTS_PER_DOLLAR = await getConfigNumber(prisma, 'pointsPerDollar', CONFIG_DEFAULTS.pointsPerDollar);
      const EARN_POINTS_PER_DOLLAR = await getConfigNumber(prisma, 'earnPointsPerDollar', CONFIG_DEFAULTS.earnPointsPerDollar);

      let requestedPoints = 0;
      if (typeof pointsToUse === 'number' && Number.isInteger(pointsToUse) && pointsToUse > 0) {
        requestedPoints = pointsToUse;
      }
      const maxByTotal = Math.floor(serverTotal * POINTS_PER_DOLLAR);

      // Points are reserved (deducted) the moment the order is created, inside one
      // transaction. Otherwise two pending orders could each redeem the same balance.
      const order = await prisma.$transaction(async (tx) => {
        let available = 0;
        if (telegramUserId) {
          const user = await tx.user.upsert({
            where: { telegramUserId },
            update: {},
            create: { telegramUserId, loyaltyPoints: 0 }
          });
          available = user.loyaltyPoints;
        }

        const pointsRedeemed = Math.max(0, Math.min(requestedPoints, available, maxByTotal));
        const discountApplied = pointsRedeemed / POINTS_PER_DOLLAR;
        const finalAmount = Math.round((serverTotal - discountApplied) * 100) / 100;
        const pointsEarned = Math.floor(finalAmount * EARN_POINTS_PER_DOLLAR);

        if (telegramUserId && pointsRedeemed > 0) {
          await tx.user.update({
            where: { telegramUserId },
            data: { loyaltyPoints: { decrement: pointsRedeemed } }
          });
        }

        return tx.order.create({
          data: {
            totalAmount: finalAmount,
            paymentMethod,
            telegramUserId,
            status: 'pending',
            pickupCode: `A-${Math.floor(100 + Math.random() * 900)}`,
            orderType: orderType || 'pickup',
            deliveryAddress: delivery ? formatAddress(delivery.building, delivery.room) : null,
            deliveryBuilding: delivery ? delivery.building : null,
            deliveryRoom: delivery ? delivery.room : null,
            contactName: delivery ? delivery.name : null,
            contactPhone: delivery ? delivery.phone : null,
            deliveryFee,
            branchId: branchId || null,
            pointsEarned,
            pointsRedeemed,
            discountApplied,
            items: { create: pricedItems }
          }
        });
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
        whereClause.branchId = String(branchId);
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

  app.get('/api/orders/user/:telegramUserId', async (req, res) => {
    try {
      const { telegramUserId } = req.params;
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

  app.get('/api/orders/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const order = await prisma.order.findUnique({
        where: { id },
        include: {
          items: {
            include: { menuItem: true }
          }
        }
      });
      if (!order) return res.status(404).json({ error: 'Not found' });
      res.json(order);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch order' });
    }
  });

  app.put('/api/orders/:id/status', requireStaff, async (req, res) => {
    try {
      const id = String(req.params.id);
      const { status } = req.body;

      const updatedOrder = await prisma.order.update({
        where: { id },
        data: { status }
      });

      if (status === 'completed' || status === 'paid') {
        await settleOrderPoints(prisma, id);
      } else if (status === 'cancelled') {
        await refundOrderPoints(prisma, id);
      }

      // In a real app, you might notify the user via Telegram bot here that their order status changed

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

  app.post('/api/payment/aba/create', async (req, res) => {
    try {
      const aba = getAbaClient();
      if (!aba) return res.status(503).json({ error: ABA_NOT_CONFIGURED });

      const { orderId } = req.body || {};
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { items: { include: { menuItem: true } } },
      });
      if (!order) return res.status(404).json({ error: 'Order not found' });
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
        // ABA wants a real item list; the SDK base64-encodes it as JSON.
        items: order.items.map((line) => ({
          name: line.menuItem?.name ?? 'Item',
          quantity: line.quantity,
          price: line.price,
        })),
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

  app.get('/api/payment/aba/status/:orderId', async (req, res) => {
    try {
      const aba = getAbaClient();
      if (!aba) return res.status(503).json({ error: ABA_NOT_CONFIGURED });

      const order = await prisma.order.findUnique({ where: { id: req.params.orderId } });
      if (!order) return res.status(404).json({ error: 'Order not found' });

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
      const reward = await prisma.reward.update({
        where: { id: String(req.params.id) },
        data: req.body
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

  return app;
}
