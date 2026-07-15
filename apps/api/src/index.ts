import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { setupBot } from './bot';
const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

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

// Mock KHQR Integration
app.post('/api/payment/khqr', async (req, res) => {
  try {
    const { amount, orderId } = req.body;
    // Simulating a request to ABA PayWay to generate KHQR
    const mockKhqrString = `00020101021229300016aicha_and_zhengda0104test5204481453038405404${amount}5802KH5915Ai Cha Zhengda6010Phnom Penh63041A2B`;
    
    res.json({
      khqrString: mockKhqrString,
      paymentId: `PAY-${Date.now()}`
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to generate KHQR' });
  }
});

setupBot();

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
