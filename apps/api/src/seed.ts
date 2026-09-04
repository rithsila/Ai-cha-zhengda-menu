import { PrismaClient } from '@prisma/client';
import { CATALOG } from './catalog-data';

const prisma = new PrismaClient();

export const INITIAL_CATEGORIES = [
  // Ai-Cha
  { brand: 'ai-cha', name: 'Cones', sortOrder: 0 },
  { brand: 'ai-cha', name: 'Milk Tea', sortOrder: 1 },
  { brand: 'ai-cha', name: 'Frappe', sortOrder: 2 },
  { brand: 'ai-cha', name: 'Fruit Tea', sortOrder: 3 },
  { brand: 'ai-cha', name: 'Ice Cream', sortOrder: 4 },
  // Zhengda
  { brand: 'zhengda', name: 'Signature', sortOrder: 0 },
  { brand: 'zhengda', name: 'Combos', sortOrder: 1 },
  { brand: 'zhengda', name: 'Rice Bowls', sortOrder: 2 },
];

export async function seedCategoriesIfEmpty(db: PrismaClient = prisma) {
  const count = await db.category.count();
  if (count === 0) {
    console.log('Category table empty. Seeding initial categories...');
    for (const cat of INITIAL_CATEGORIES) {
      await db.category.upsert({
        where: { brand_name: { brand: cat.brand, name: cat.name } },
        update: {},
        create: {
          brand: cat.brand,
          name: cat.name,
          sortOrder: cat.sortOrder,
          isActive: true,
        },
      });
    }
  }
}

export async function seedCatalog(db: PrismaClient = prisma) {
  console.log('Seeding database...');

  // Seed categories if empty
  await seedCategoriesIfEmpty(db);

  // Clear existing (FK-safe order)
  await db.orderItem.deleteMany({});
  await db.order.deleteMany({});
  await db.modifierOption.deleteMany({});
  await db.modifierGroup.deleteMany({});
  await db.menuItem.deleteMany({});

  // Seed Branches — the shop itself. Delivery is Arakawa-only for now, and the
  // pickup counter is the same address.
  const shop = await db.branch.upsert({
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
  await db.branch.updateMany({
    where: { id: { in: ['branch-toul-kork', 'branch-bkk1'] } },
    data: { isActive: false }
  });

  // Seed MenuItems from the static catalog, preserving static ids
  for (const item of CATALOG) {
    await db.menuItem.create({
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

export async function autoSeedIfEmpty(db: PrismaClient = prisma) {
  try {
    const count = await db.menuItem.count();
    if (count === 0) {
      console.log('Database empty. Auto-seeding catalog and branch...');
      await seedCatalog(db);
    }
    await seedCategoriesIfEmpty(db);
  } catch (err) {
    console.warn('Could not check or run auto-seed:', err);
  }
}

if (process.argv[1] && process.argv[1].endsWith('seed.ts')) {
  seedCatalog(prisma)
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
