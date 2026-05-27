/**
 * Database validation script
 * Checks if all required columns exist after schema changes
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface ColumnCheck {
  table: string;
  column: string;
  required: boolean;
}

const REQUIRED_COLUMNS: ColumnCheck[] = [
  { table: 'scraps', column: 'deleted_at', required: true },
  { table: 'testimonials', column: 'deleted_at', required: true },
  { table: 'topics', column: 'deleted_at', required: true },
  { table: 'topiccomments', column: 'deleted_at', required: true },
  { table: 'communities', column: 'last_edited_by_id', required: true },
];

async function checkColumn(table: string, column: string): Promise<boolean> {
  const result = await prisma.$queryRawUnsafe<{ column_name: string }[]>(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = '${table}'
    AND column_name = '${column}'
  `);
  return result.length > 0;
}

async function main() {
  console.log('='.repeat(60));
  console.log('Database Schema Validation');
  console.log('='.repeat(60));
  console.log('');

  try {
    await prisma.$connect();
    console.log('[OK] Database connected\n');

    let allPassed = true;

    for (const check of REQUIRED_COLUMNS) {
      const exists = await checkColumn(check.table, check.column);
      const status = exists ? '[OK]' : '[MISSING]';
      console.log(`${status} ${check.table}.${check.column}`);

      if (!exists && check.required) {
        allPassed = false;
      }
    }

    console.log('');
    console.log('='.repeat(60));

    if (allPassed) {
      console.log('Result: ALL CHECKS PASSED');
      console.log('Database schema is up to date.');
    } else {
      console.log('Result: SCHEMA MISMATCH');
      console.log('Run: npx prisma db push');
    }

    console.log('='.repeat(60));

  } catch (error) {
    console.error('[ERROR] Database check failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
