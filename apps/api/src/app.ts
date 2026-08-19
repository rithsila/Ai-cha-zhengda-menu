import express from 'express';
import type { RequestHandler } from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { ABAPayWay, generateKHQR, generateTransactionId } from 'aba-payway-sdk-unofficial';
import { settleOrderPoints, getConfigNumber, CONFIG_DEFAULTS } from './loyalty';
import { verifyTelegramLogin, isLoginFresh } from './telegram-auth';

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

  const staffPin = () => process.env.STAFF_PIN || '1234';
  const managerPin = () => process.env.MANAGER_PIN || '9999';

  const requireManager: RequestHandler = (req, res, next) => {
    if (req.headers['x-manager-pin'] !== managerPin()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  };

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
    res.json({ ok: true });
  });

  // Initialize ABA PayWay client
  const aba = new ABAPayWay({
    merchantId: process.env.ABA_MERCHANT_ID || 'rithsila_sandbox', // mock sandbox
    apiKey: process.env.ABA_API_KEY || 'sandbox_api_key_mock',
    baseUrl: process.env.ABA_BASE_URL || 'https://checkout-sandbox.payway.com.kh',
    webhookSecret: process.env.ABA_WEBHOOK_SECRET || 'sandbox_secret_mock',
  });

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

  app.put('/api/catalog/:id/sold-out', async (req, res) => {
    try {
      const { id } = req.params;
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
      const { items, paymentMethod, telegramUserId, branchId, orderType, deliveryAddress, deliveryLat, deliveryLng, pointsToUse } = req.body;

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
        const quantity = Number.isInteger(item.quantity) && item.quantity > 0 ? item.quantity : 1;
        const allOptions = menuItem.modifiers.flatMap((g) => g.options);
        const selected = item.selectedModifiers && typeof item.selectedModifiers === 'object' ? item.selectedModifiers : {};
        const optionIds = Object.values(selected).flat().map((o: any) => o?.id).filter(Boolean);
        let unitPrice = menuItem.basePrice;
        for (const oid of optionIds) {
          const opt = allOptions.find((o) => o.id === oid);
          if (opt) unitPrice += opt.priceDelta;   // DB price, never the client's
        }
        const lineTotal = Math.round(unitPrice * quantity * 100) / 100;
        itemsTotal += lineTotal;
        pricedItems.push({ menuItemId: menuItem.id, quantity, price: lineTotal, modifiers: JSON.stringify(selected) });
      }

      const DELIVERY_FEE = 1.0;
      const serverTotal = Math.round((itemsTotal + (orderType === 'delivery' ? DELIVERY_FEE : 0)) * 100) / 100;

      // Check if user exists to handle points
      let user = null;
      if (telegramUserId) {
        user = await prisma.user.upsert({
          where: { telegramUserId },
          update: {},
          create: { telegramUserId, loyaltyPoints: 0 }
        });
      }

      const POINTS_PER_DOLLAR = await getConfigNumber(prisma, 'pointsPerDollar', CONFIG_DEFAULTS.pointsPerDollar);
      const EARN_POINTS_PER_DOLLAR = await getConfigNumber(prisma, 'earnPointsPerDollar', CONFIG_DEFAULTS.earnPointsPerDollar);

      let requestedPoints = 0;
      if (typeof pointsToUse === 'number' && Number.isInteger(pointsToUse) && pointsToUse > 0) {
        requestedPoints = pointsToUse;
      }

      const available = user?.loyaltyPoints ?? 0;
      const maxByTotal = Math.floor(serverTotal * POINTS_PER_DOLLAR);
      const pointsRedeemed = Math.min(requestedPoints, available, maxByTotal);
      const discountApplied = pointsRedeemed / POINTS_PER_DOLLAR;
      const finalAmount = Math.round((serverTotal - discountApplied) * 100) / 100;
      const pointsEarned = Math.floor(finalAmount * EARN_POINTS_PER_DOLLAR);

      const order = await prisma.order.create({
        data: {
          totalAmount: finalAmount,
          paymentMethod,
          telegramUserId,
          status: 'pending',
          pickupCode: `A-${Math.floor(100 + Math.random() * 900)}`,
          orderType: orderType || 'pickup',
          deliveryAddress: deliveryAddress || null,
          deliveryLat: deliveryLat || null,
          deliveryLng: deliveryLng || null,
          branchId: branchId || null,
          pointsEarned,
          pointsRedeemed,
          discountApplied,
          items: { create: pricedItems }
        }
      });

      res.json(order);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to create order' });
    }
  });

  // Staff Dashboard APIs
  app.get('/api/orders', async (req, res) => {
    try {
      const { branchId } = req.query;

      const whereClause: any = {};
      if (branchId) {
        whereClause.branchId = String(branchId);
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

  app.put('/api/orders/:id/status', async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const updatedOrder = await prisma.order.update({
        where: { id },
        data: { status }
      });

      if (status === 'completed' || status === 'paid') {
        await settleOrderPoints(prisma, id);
      }

      // In a real app, you might notify the user via Telegram bot here that their order status changed

      res.json(updatedOrder);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to update order status' });
    }
  });

  // ABA PayWay Integration
  app.post('/api/payment/aba/create', async (req, res) => {
    try {
      const { orderId } = req.body;
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      if (!order) return res.status(404).json({ error: 'Order not found' });

      const transactionId = generateTransactionId();

      // Update order with transactionId
      await prisma.order.update({
        where: { id: orderId },
        data: { transactionId }
      });

      const purchase = await aba.createPurchase({
        transactionId,
        amount: order.totalAmount,
        currency: "USD",
        items: `Order ${order.pickupCode}`,
        firstName: "Ai Cha",
        lastName: "Customer",
        email: "customer@aichamenu.com",
        returnUrl: process.env.WEBAPP_URL || "https://t.me/your_bot/menu",
        cancelUrl: process.env.WEBAPP_URL || "https://t.me/your_bot/menu",
      });

      if (purchase.success) {
        const khqrSvg = await generateKHQR({
          emvData: purchase.qrString ?? "",
          amount: order.totalAmount,
          currency: "USD",
          merchantName: "Ai Cha Zhengda",
          headerColor: "#d42b2b",
        });

        res.json({
          checkoutUrl: purchase.checkoutUrl,
          qrString: purchase.qrString,
          khqrSvg,
          transactionId
        });
      } else {
        res.status(400).json({ error: 'Failed to create ABA purchase' });
      }
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to generate ABA payment' });
    }
  });

  app.post('/api/payment/aba/webhook', async (req: any, res) => {
    try {
      const rawBody = req.rawBody?.toString('utf-8');
      const signatureHeader = req.headers['x-payway-signature'] || '';

      // In dev mode without real webhook secret, we might bypass verify for testing
      // but we use the SDK to verify if available
      if (process.env.ABA_WEBHOOK_SECRET) {
        const isValid = await aba.verifyWebhook(
          rawBody,
          signatureHeader as string,
          process.env.ABA_WEBHOOK_SECRET
        );
        if (!isValid) return res.status(401).json({ error: 'Invalid signature' });
      }

      // Usually ABA sends tran_id and status in a base64 encoded 'response' field
      // For simplicity, assuming body has tran_id directly or we parse response
      let tran_id;
      let status;

      if (req.body.response) {
        const decoded = Buffer.from(req.body.response, 'base64').toString('utf-8');
        const parsed = JSON.parse(decoded);
        tran_id = parsed.tran_id;
        status = parsed.status;
      } else {
        tran_id = req.body.tran_id;
        status = req.body.status;
      }

      if (status === 'APPROVED' || status === '0') {
        const order = await prisma.order.findUnique({
          where: { transactionId: tran_id }
        });

        if (order) {
          await prisma.order.update({
            where: { id: order.id },
            data: { status: 'paid' }
          });

          await settleOrderPoints(prisma, order.id);

          // Notify user if possible
        }
      }

      res.json({ message: 'Webhook processed' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to process webhook' });
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
      if (!Number.isFinite(num) || num <= 0) {
        return res.status(400).json({ error: 'value must be a number greater than 0' });
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
      const paidOrders = await prisma.order.findMany({
        where: { status: 'paid' },
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
