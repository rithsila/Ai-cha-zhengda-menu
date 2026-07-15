import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { setupBot, sendOrderNotification } from './bot';
import { ABAPayWay, generateKHQR, generateTransactionId } from 'aba-payway-sdk-unofficial';

const prisma = new PrismaClient();

const app = express();

// Middleware to parse raw body for webhook verification
app.use(express.json({
  verify: (req: any, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(cors());

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
    const { items, totalAmount: reqTotalAmount, paymentMethod, telegramUserId, branchId, orderType, deliveryAddress, deliveryLat, deliveryLng, usePoints } = req.body;
    
    // Check if user exists to handle points
    let user = null;
    if (telegramUserId) {
      user = await prisma.user.upsert({
        where: { telegramUserId },
        update: {},
        create: { telegramUserId, loyaltyPoints: 0 }
      });
    }

    let discountApplied = 0;
    let finalAmount = reqTotalAmount;

    if (usePoints && user && user.loyaltyPoints > 0) {
      // 100 points = $1
      const maxDiscountFromPoints = user.loyaltyPoints / 100;
      discountApplied = Math.min(maxDiscountFromPoints, finalAmount);
      finalAmount = finalAmount - discountApplied;
    }

    // Earn points on final amount: 10 points per $1
    const pointsEarned = Math.floor(finalAmount * 10);

    const order = await prisma.$transaction(async (tx) => {
      if (usePoints && user && user.loyaltyPoints > 0) {
        // Deduct points
        await tx.user.update({
          where: { telegramUserId },
          data: { loyaltyPoints: { decrement: discountApplied * 100 } }
        });
      }

      if (user && finalAmount > 0) {
        await tx.user.update({
          where: { telegramUserId },
          data: { loyaltyPoints: { increment: pointsEarned } }
        });
      }

      return tx.order.create({
        data: {
          totalAmount: finalAmount,
          paymentMethod,
          telegramUserId,
          status: 'pending',
          pickupCode: `A-${Math.floor(100 + Math.random() * 900)}`, // mock code
          orderType: orderType || 'pickup',
          deliveryAddress: deliveryAddress || null,
          deliveryLat: deliveryLat || null,
          deliveryLng: deliveryLng || null,
          branchId: branchId || null,
          pointsEarned,
          discountApplied,
          items: {
            create: items.map((item: any) => ({
              menuItemId: item.menuItemId,
              quantity: item.quantity,
              price: item.totalPrice,
              modifiers: JSON.stringify(item.selectedModifiers)
            }))
          }
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
    const orders = await prisma.order.findMany({
      where: { telegramUserId },
      include: {
        items: {
          include: {
            menuItem: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    res.json(orders);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch user orders' });
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
        
        // Notify user if possible
      }
    }
    
    res.json({ message: 'Webhook processed' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

setupBot();

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
