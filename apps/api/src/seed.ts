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

  console.log(`Seeded successfully! ${CATALOG.length} menu items, branches:`, { b1, b2 });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
