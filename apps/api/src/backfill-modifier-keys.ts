/**
 * One-off backfill: fill ModifierGroup.key / ModifierOption.key on rows created
 * before those columns existed.
 *
 * Rows are matched to the static catalog by name (names are unique inside a menu
 * item), so no order data is touched. Safe to run more than once.
 *
 *   npx tsx src/backfill-modifier-keys.ts
 */
import { PrismaClient } from '@prisma/client';
import { CATALOG } from './catalog-data';

const prisma = new PrismaClient();

async function main() {
  let groupsFixed = 0;
  let optionsFixed = 0;
  const unmatched: string[] = [];

  for (const item of CATALOG) {
    const groups = await prisma.modifierGroup.findMany({
      where: { menuItemId: item.id },
      include: { options: true },
    });

    for (const group of groups) {
      const staticGroup = (item.modifiers ?? []).find((g) => g.name === group.name);
      if (!staticGroup) {
        unmatched.push(`group ${item.id}/${group.name}`);
        continue;
      }
      if (group.key !== staticGroup.id) {
        await prisma.modifierGroup.update({ where: { id: group.id }, data: { key: staticGroup.id } });
        groupsFixed++;
      }

      for (const option of group.options) {
        const staticOption = staticGroup.options.find((o) => o.name === option.name);
        if (!staticOption) {
          unmatched.push(`option ${item.id}/${group.name}/${option.name}`);
          continue;
        }
        if (option.key !== staticOption.id) {
          await prisma.modifierOption.update({ where: { id: option.id }, data: { key: staticOption.id } });
          optionsFixed++;
        }
      }
    }
  }

  const blankGroups = await prisma.modifierGroup.count({ where: { key: '' } });
  const blankOptions = await prisma.modifierOption.count({ where: { key: '' } });

  console.log(`Backfilled ${groupsFixed} groups and ${optionsFixed} options.`);
  console.log(`Remaining blank keys: ${blankGroups} groups, ${blankOptions} options.`);
  if (unmatched.length) console.log('No catalog match for:', unmatched);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
