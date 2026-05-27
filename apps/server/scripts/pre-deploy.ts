/**
 * Pre-deploy validation script
 *
 * Validates the environment before deployment:
 * 1. Required environment variables
 * 2. Database connectivity
 * 3. Schema validation (critical tables exist)
 *
 * Usage: npm run predeploy
 * Exit codes: 0 = success, 1 = failure
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

interface CheckResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function validatePreDeploy(): Promise<void> {
  console.log('=== Pre-Deploy Validation ===\n');

  const checks: CheckResult[] = [];
  const prisma = new PrismaClient();

  try {
    // ========================================================================
    // 1. Required environment variables
    // ========================================================================
    console.log('Checking environment variables...');

    const requiredEnvVars = [
      'DATABASE_URL',
      'JWT_SECRET',
      'COOKIE_SECRET',
    ];

    for (const envVar of requiredEnvVars) {
      const value = process.env[envVar];
      checks.push({
        name: `ENV: ${envVar}`,
        passed: !!value && value.length > 0,
        error: value ? undefined : `Missing or empty: ${envVar}`,
      });
    }

    // SSL validation for DATABASE_URL (SEC-008)
    // Railway internal URLs (.railway.internal) don't support TLS — traffic is
    // isolated within Railway's private network. Only enforce SSL for public URLs.
    const databaseUrl = process.env.DATABASE_URL || '';
    const isInternalUrl = databaseUrl.includes('.railway.internal');
    const isProductionUrl = !databaseUrl.includes('localhost') && !databaseUrl.includes('127.0.0.1');
    if (isProductionUrl && !isInternalUrl) {
      const hasSSL = databaseUrl.includes('sslmode=require') || databaseUrl.includes('ssl=true');
      checks.push({
        name: 'ENV: DATABASE_URL SSL (SEC-008)',
        passed: hasSSL,
        error: hasSSL ? undefined : 'DATABASE_URL must include sslmode=require for production database traffic',
      });
    } else if (isInternalUrl) {
      console.log('  [INFO] Using Railway internal network (no TLS available, traffic isolated)');
    }

    // Optional but recommended variables
    const recommendedEnvVars = ['FRONTEND_URL', 'CORS_ORIGINS'];
    for (const envVar of recommendedEnvVars) {
      const value = process.env[envVar];
      if (!value) {
        console.log(`  [WARN] ${envVar} not set (optional but recommended)`);
      }
    }

    // ========================================================================
    // 2. Database connectivity
    // ========================================================================
    console.log('Checking database connection...');

    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.push({ name: 'Database connection', passed: true });
    } catch (error) {
      checks.push({
        name: 'Database connection',
        passed: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Verify SSL is active on the connection (SEC-008)
    if (isProductionUrl && !isInternalUrl) {
      try {
        const sslCheck = await prisma.$queryRaw<Array<{ ssl: boolean }>>`
          SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()
        `;
        const sslActive = sslCheck.length > 0 && (sslCheck[0]?.ssl ?? false);
        checks.push({
          name: 'Database SSL active (SEC-008)',
          passed: sslActive,
          error: sslActive ? undefined : 'Database connection is not using SSL encryption',
        });
      } catch {
        console.log('  [WARN] Could not verify SSL status via pg_stat_ssl');
      }
    }

    // ========================================================================
    // 3. Schema validation (critical tables)
    // ========================================================================
    console.log('Checking database schema...');

    // Table names as defined in schema.prisma with @@map()
    const criticalTables = ['users', 'agents', 'scraps', 'communities'];

    for (const table of criticalTables) {
      try {
        // Query using actual PostgreSQL table names (lowercase, from @@map)
        await prisma.$queryRawUnsafe(`SELECT 1 FROM "${table}" LIMIT 1`);
        checks.push({ name: `Table: ${table}`, passed: true });
      } catch {
        checks.push({
          name: `Table: ${table}`,
          passed: false,
          error: `Table "${table}" not found - run prisma db push`,
        });
      }
    }

    // ========================================================================
    // Results
    // ========================================================================
    console.log('\n--- Results ---\n');

    let allPassed = true;
    let passedCount = 0;
    let failedCount = 0;

    for (const check of checks) {
      const status = check.passed ? '[PASS]' : '[FAIL]';
      console.log(`  ${status} ${check.name}`);
      if (check.error) {
        console.log(`         Error: ${check.error}`);
      }
      if (check.passed) {
        passedCount++;
      } else {
        failedCount++;
        allPassed = false;
      }
    }

    console.log(`\n--- Summary ---`);
    console.log(`  Passed: ${passedCount}`);
    console.log(`  Failed: ${failedCount}`);
    console.log(`  Total:  ${checks.length}\n`);

    if (allPassed) {
      console.log('All checks passed! Ready to deploy.');
      process.exit(0);
    } else {
      console.error('Some checks failed. Please fix before deploying.');
      process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

validatePreDeploy().catch((error) => {
  console.error('Pre-deploy validation failed unexpectedly:', error);
  process.exit(1);
});
