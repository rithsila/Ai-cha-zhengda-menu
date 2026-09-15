import Database from 'better-sqlite3';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Fields that are stored as integers (timestamps) in SQLite but need to be Dates in PostgreSQL
const dateFields = ['createdAt', 'updatedAt', 'paymentExpiresAt', 'expiresAt', 'claimedAt'];

// Fields that are stored as 1/0 in SQLite but need to be booleans in PostgreSQL
const booleanFields = [
  'isActive', 'isSoldOut', 'earnsStamp', 'canClaim', 'required', 'pointsSettled', 'reviewed'
];

function transformRow(row: any) {
  const transformed = { ...row };
  
  for (const field of dateFields) {
    if (transformed[field] !== null && transformed[field] !== undefined) {
      transformed[field] = new Date(transformed[field]);
    }
  }

  for (const field of booleanFields) {
    if (transformed[field] !== null && transformed[field] !== undefined) {
      transformed[field] = transformed[field] === 1;
    }
  }
  
  return transformed;
}

export async function migrateDataFromSqlite(sqliteFilePath: string) {
  console.log(`Starting data migration from SQLite (${sqliteFilePath}) to PostgreSQL...`);
  
  const sqlite = new Database(sqliteFilePath, { readonly: true });
  
  const tables = [
    'User',
    'Branch',
    'Category',
    'MenuItem',
    'ModifierGroup',
    'ModifierOption',
    'Order',
    'OrderItem',
    'Reward',
    'SystemConfig',
    'StaffAccount',
    'FeedbackReport',
    'PrizeClaim',
    'LocalizedText',
    'LocalizedTextValue',
    'AuditLog'
  ];

  try {
    for (const table of tables) {
      console.log(`Migrating table: ${table}...`);
      
      const rows = sqlite.prepare(`SELECT * FROM "${table}"`).all();
      if (rows.length === 0) {
        console.log(`  Skipped ${table} (0 rows)`);
        continue;
      }
      
      const transformedRows = rows.map(transformRow);
      
      // Use createMany to insert rows in bulk
      // TypeScript requires ignoring the exact model name dynamically, so we cast to any
      const model = (prisma as any)[table.charAt(0).toLowerCase() + table.slice(1)];
      
      // We process in batches of 500 to avoid query size limits
      const batchSize = 500;
      for (let i = 0; i < transformedRows.length; i += batchSize) {
        const batch = transformedRows.slice(i, i + batchSize);
        await model.createMany({
          data: batch,
          skipDuplicates: true, // In case we run it multiple times
        });
      }
      
      console.log(`  Migrated ${rows.length} rows for ${table}`);
    }
    
    console.log('Data migration completed successfully!');
    
    // Mark migration as done so we don't run it again
    await (prisma as any).systemConfig.upsert({
      where: { key: 'postgres_migration_done' },
      update: { value: 'true' },
      create: { key: 'postgres_migration_done', value: 'true' }
    });
    
  } catch (err) {
    console.error('Error during data migration:', err);
    throw err;
  } finally {
    sqlite.close();
  }
}
