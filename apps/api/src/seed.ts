import { PrismaClient } from '@prisma/client';
import { CATALOG } from './catalog-data';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Clear existing (FK-safe order)
  await prisma.orderItem.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.modifierOption.deleteMany({});
  await prisma.modifierGroup.deleteMany({});
  await prisma.menuItem.deleteMany({});

  // Seed Branches — the shop itself. Delivery is Arakawa-only for now, and the
  // pickup counter is the same address.
  const shop = await prisma.branch.upsert({
    where: { id: 'branch-arakawa' },
    update: { name: 'Ai-Cha & Zhengda — Arakawa', address: 'Shop J03, Ground Floor, Arakawa', isActive: true },
    create: {
      id: 'branch-arakawa',
      name: 'Ai-Cha & Zhengda — Arakawa',
      address: 'Shop J03, Ground Floor, Arakawa',
      isActive: true,
    }
  });

  // The two invented branches from the first prototype are hidden, not deleted:
  // old orders still point at them with a foreign key.
  await prisma.branch.updateMany({
    where: { id: { in: ['branch-toul-kork', 'branch-bkk1'] } },
    data: { isActive: false }
  });

  // Seed MenuItems from the static catalog, preserving static ids
  for (const item of CATALOG) {
    await prisma.menuItem.create({
      data: {
        id: item.id,
        brand: item.brand,
        category: item.category,
        name: item.name,
        description: item.description,
        basePrice: item.basePrice,
        image: item.imageFallback ?? null,
        isSoldOut: false,
        modifiers: {
          create: (item.modifiers ?? []).map((group) => ({
            // `key` keeps the static catalog id so the API can price the
            // option ids the client sends (row ids are generated uuids).
            key: group.id,
            name: group.name,
            type: group.type,
            required: group.required ?? false,
            options: {
              create: group.options.map((option) => ({
                key: option.id,
                name: option.name,
                priceDelta: option.priceDelta,
              }))
            }
          }))
        }
      }
    });
  }

  console.log(`Seeded successfully! ${CATALOG.length} menu items, branch:`, shop);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
