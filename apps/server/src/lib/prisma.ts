import { PrismaClient } from '@prisma/client';

// Prevent multiple instances in development (hot reload)
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Use DATABASE_URL_TEST when in test environment, if available
const databaseUrl = process.env.NODE_ENV === 'test' && process.env.DATABASE_URL_TEST
  ? process.env.DATABASE_URL_TEST
  : undefined;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    ...(databaseUrl ? { datasources: { db: { url: databaseUrl } } } : {}),
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// ============================================================================
// CONNECTION KEEPALIVE
// ============================================================================
//
// PostgreSQL closes idle connections after a timeout (typically 5-10 minutes
// on managed hosts like Railway). Prisma's connection pool doesn't detect
// this — it holds references to dead connections and only discovers the
// failure when a query is attempted. Under burst traffic after idle, all
// connections try to reconnect simultaneously, causing pool exhaustion.
//
// This keepalive sends a lightweight SELECT 1 every 4 minutes to keep at
// least one connection warm and trigger early detection of dead connections.
// ============================================================================

const KEEPALIVE_INTERVAL_MS = 4 * 60 * 1000; // 4 minutes
let keepaliveTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Start periodic connection keepalive pings.
 * Call once after the server starts listening.
 */
export function startConnectionKeepalive(): void {
  if (keepaliveTimer) return;

  keepaliveTimer = setInterval(() => {
    prisma.$queryRaw`SELECT 1`.catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[Prisma] Connection keepalive failed: ${message}`);
    });
  }, KEEPALIVE_INTERVAL_MS);

  keepaliveTimer.unref();
  console.log(`[Prisma] Connection keepalive started (${KEEPALIVE_INTERVAL_MS / 1000}s interval)`);
}

/**
 * Stop the keepalive timer.
 * Call during graceful shutdown before disconnecting Prisma.
 */
export function stopConnectionKeepalive(): void {
  if (keepaliveTimer) {
    clearInterval(keepaliveTimer);
    keepaliveTimer = null;
  }
}

export type { PrismaClient };
