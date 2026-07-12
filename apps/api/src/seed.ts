import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');
  
  // Clear existing
  await prisma.modifierOption.deleteMany({});
  await prisma.modifierGroup.deleteMany({});
  await prisma.menuItem.deleteMany({});
  
  // Seed Branches
  const b1 = await prisma.branch.upsert({
    where: { id: 'branch-toul-kork' },
    update: {},
    create: {
      id: 'branch-toul-kork',
      name: 'Toul Kork Branch',
      address: 'Street 315, Toul Kork, Phnom Penh',
      isActive: true,
    }
  });

  const b2 = await prisma.branch.upsert({
    where: { id: 'branch-bkk1' },
    update: {},
    create: {
      id: 'branch-bkk1',
      name: 'BKK1 Branch',
      address: 'Street 51, BKK1, Phnom Penh',
      isActive: true,
    }
  });

  const ai1 = await prisma.menuItem.create({
    data: {
      brand: 'ai-cha',
      category: 'Milk Tea',
      name: 'Brown Sugar Boba Milk',
      description: 'Classic signature drink',
      basePrice: 1.35,
      modifiers: {
        create: [
          {
            name: 'Size / Cup Type',
            type: 'single',
            required: true,
            options: {
              create: [
                { name: 'Hot (400ml)', priceDelta: 0 },
                { name: 'Cold M (500ml)', priceDelta: 0 },
                { name: 'Cold L (700ml)', priceDelta: 0.25 },
              ]
            }
          },
          {
            name: 'Ice Level',
            type: 'single',
            required: true,
            options: {
              create: [
                { name: 'No Ice', priceDelta: 0 },
                { name: 'Less Ice', priceDelta: 0 },
                { name: 'Normal Ice', priceDelta: 0 },
              ]
            }
          }
        ]
      }
    }
  });

  const zh1 = await prisma.menuItem.create({
    data: {
      brand: 'zhengda',
      category: 'Signature',
      name: 'Signature XXL Crispy Chicken',
      description: 'Giant chicken breast',
      basePrice: 2.50,
      modifiers: {
        create: [
          {
            name: 'Flavor Powder',
            type: 'single',
            required: true,
            options: {
              create: [
                { name: 'Signature', priceDelta: 0 },
                { name: 'Mala', priceDelta: 0 },
                { name: 'Plum', priceDelta: 0 }
              ]
            }
          }
        ]
      }
    }
  });

  console.log('Seeded successfully!', { ai1, zh1, b1, b2 });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
