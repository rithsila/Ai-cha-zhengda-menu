import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

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

app.post('/api/orders', async (req, res) => {
  try {
    const { items, totalAmount, paymentMethod } = req.body;
    
    // In a real app, you would re-calculate totalAmount server-side to prevent tampering.
    
    const order = await prisma.order.create({
      data: {
        totalAmount,
        paymentMethod,
        status: 'pending',
        pickupCode: `A-${Math.floor(100 + Math.random() * 900)}`, // mock code
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

    res.json(order);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
