// MUST be first: initialises Sentry before any other module loads so
// auto-instrumentation can wrap http/fetch/etc. before they're used.
import './instrument.js';

import * as Sentry from '@sentry/node';
import Fastify, { type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import cookie from '@fastify/cookie';
import crypto from 'crypto';
import { createYoga } from 'graphql-yoga';
import { useDisableIntrospection } from '@graphql-yoga/plugin-disable-introspection';
import { schema } from './graphql/schema.js';
import { createContext } from './graphql/context.js';
import { registerRoutes } from './routes/index.js';
import { validateEnv } from './lib/env.js';
import {
  cleanupExpiredRefreshTokens,
  cleanupExpiredObserverRefreshTokens,
  cleanupExpiredPasswordResetTokens,
  cleanupExpiredEmailVerificationCodes,
} from './lib/auth.js';
import { prisma, startConnectionKeepalive, stopConnectionKeepalive } from './lib/prisma.js';
import { initCloudinary } from './lib/cloudinary.js';
import graphqlRateLimitPlugin from './plugins/graphql-rate-limit.js';
import oauthCleanupPlugin from './plugins/oauth-cleanup.js';
import webhookRetryPlugin from './plugins/webhook-retry.js';
import requestMetricsPlugin from './plugins/request-metrics.js';
import metricsRetentionPlugin from './plugins/metrics-retention.js';
import dataRetentionPlugin from './plugins/data-retention.js';
import identityAnalysisPlugin from './plugins/identity-analysis.js';
import { tierEvaluator } from './plugins/tier-evaluator.js';
import { attestationVerifier } from './plugins/attestation-verifier.js';
import { attestationLifecycle } from './plugins/attestation-lifecycle.js';
import { snapshotBuilder } from './plugins/snapshot-builder.js';
import botFilterPlugin from './plugins/bot-filter.js';
import { useQueryGuards } from './plugins/graphql-query-guards.js';
import { liveEvents } from './lib/live-events.js';
import { webhookDispatcher } from './lib/webhook-dispatcher.js';
import { initExternalMetrics, stopExternalMetricsFlush, flushMetrics as flushExternalMetrics } from './lib/external-service-metrics.js';
import { startAlerting, stopAlerting, seedAlertThresholds } from './lib/alerting.js';
import { closeSentry, isSentryInitialized } from './lib/sentry.js';
import 'dotenv/config';

// ============================================================================
// API VERSION
// ============================================================================

const API_VERSION = '2.0.0';

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

let isShuttingDown = false;
const SHUTDOWN_TIMEOUT = parseInt(process.env.SHUTDOWN_TIMEOUT ?? '30000', 10);
let tokenCleanupTimer: ReturnType<typeof setInterval> | null = null;

// Validate environment variables first - fail fast if missing
const env = validateEnv();

// Initialize Cloudinary (if configured)
const cloudinaryConfigured = initCloudinary();
if (cloudinaryConfigured) {
  console.log('[CLOUDINARY] Image upload service initialized');
}

const PORT = env.port;
const HOST = env.host;
const IS_PRODUCTION = env.isProduction;
const CORS_ORIGINS = env.corsOrigins;

async function main() {
  const fastify = Fastify({
    logger: {
      level: IS_PRODUCTION ? 'warn' : 'info',
    },
    // Trust proxy headers (X-Forwarded-For) for accurate client IP behind Railway/CDN
    trustProxy: true,
    // SEC-010: Explicit 1MB body limit for all routes.
    // The GraphQL route overrides this to 10MB for base64 image uploads.
    bodyLimit: 1_048_576,
  });

  // ============================================================================
  // SECURITY MIDDLEWARE
  // ============================================================================

  // CORS - Cross-Origin Resource Sharing
  await fastify.register(cors, {
    origin: CORS_ORIGINS.length > 0 ? CORS_ORIGINS : false,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Moltverse-Client'],
    maxAge: 86400, // 24 hours
  });

  // Helmet - Security headers (CSP, HSTS, X-Frame-Options, etc.)
  await fastify.register(helmet, {
    contentSecurityPolicy: IS_PRODUCTION
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'https://res.cloudinary.com'],
            connectSrc: ["'self'"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            frameAncestors: ["'none'"],
          },
        }
      : false, // Disable CSP in development for GraphiQL
    crossOriginEmbedderPolicy: false, // Needed for GraphiQL in development
    // SEG-002: HSTS with 1 year max-age and preload
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },
    // SEG-003: Deny framing entirely (clickjacking protection)
    frameguard: { action: 'deny' },
  });

  // SEG-001: Add Permissions-Policy header manually (not supported by @fastify/helmet)
  fastify.addHook('onSend', async (_request, reply) => {
    reply.header(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=()'
    );
  });

  // Sentry error capture — tag expected 4xx so they get filtered out
  // before hitting quota. The sentry.ts beforeSend hook drops events
  // tagged `expected_4xx=true`.
  fastify.addHook('onError', (request, reply, error, done) => {
    if (isSentryInitialized()) {
      const status = reply.statusCode;
      const isExpected = status >= 400 && status < 500;
      Sentry.withScope((scope) => {
        scope.setTag('expected_4xx', isExpected ? 'true' : 'false');
        scope.setTag('http_method', request.method);
        scope.setTag('http_route', request.routeOptions?.url ?? request.url);
        scope.setContext('request', {
          id: request.id,
          method: request.method,
          url: request.url,
          statusCode: status,
        });
        Sentry.captureException(error);
      });
    }
    done();
  });

  // Bot/scanner filtering - reject known attack paths immediately
  await fastify.register(botFilterPlugin);

  // Rate limiting - Prevent brute force and DoS
  // Use RATE_LIMIT_MAX env var to override, or DISABLE_RATE_LIMIT=true to disable
  if (process.env.DISABLE_RATE_LIMIT !== 'true') {
    const rateLimitMax = parseInt(process.env.RATE_LIMIT_MAX || '0', 10) || (IS_PRODUCTION ? 300 : 1000);
    await fastify.register(rateLimit, {
      global: true,
      max: rateLimitMax, // requests per window
      timeWindow: '1 minute',
      // Stricter limits for auth endpoints
      keyGenerator: (request: FastifyRequest) => {
        return request.ip;
      },
      errorResponseBuilder: () => ({
        statusCode: 429,
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please try again later.',
      }),
    });
  } else {
    fastify.log.warn('Global rate limiting DISABLED via DISABLE_RATE_LIMIT env var');
  }

  // Cookie support - Required for HTTP-only auth cookies
  // Cookie secret is validated by env.ts at startup
  await fastify.register(cookie, {
    secret: env.cookieSecret,
    parseOptions: {},
  });

  // ============================================================================
  // GRAPHQL RATE LIMITING
  // ============================================================================

  // Per-mutation rate limiting for GraphQL endpoints
  // Protects against brute force (login) and spam (createUser, createScrap)
  await fastify.register(graphqlRateLimitPlugin);

  // ============================================================================
  // OAUTH CLEANUP
  // ============================================================================

  // Periodic cleanup of expired OAuth PKCE states
  // Prevents accumulation of abandoned OAuth flows in the database
  await fastify.register(oauthCleanupPlugin);

  // ============================================================================
  // WEBHOOK RETRY
  // ============================================================================

  // Periodic retry of failed webhook deliveries
  // Also handles cleanup of old delivery records (7 day retention)
  await fastify.register(webhookRetryPlugin);

  // ============================================================================
  // REQUEST METRICS
  // ============================================================================

  // Track request metrics (latency, error rates, rate limits)
  await fastify.register(requestMetricsPlugin);

  // ============================================================================
  // METRICS RETENTION
  // ============================================================================

  // Cleanup old metrics and create aggregations
  await fastify.register(metricsRetentionPlugin);

  // ============================================================================
  // DATA RETENTION (LGPD)
  // ============================================================================

  // Purge soft-deleted records, old profile visitors, expired OAuth states
  await fastify.register(dataRetentionPlugin);

  // ============================================================================
  // IDENTITY ANALYSIS
  // ============================================================================

  // Periodic analysis of agent behavior for social identity profiles
  await fastify.register(identityAnalysisPlugin);

  // ============================================================================
  // TIER EVALUATOR (Camada 4 §3.4)
  // ============================================================================

  // Periodic walk over ACTIVE+SUSPENDED agents to apply tier promotions
  // and demotions. Disabled under NODE_ENV=test.
  await fastify.register(tierEvaluator);

  // ============================================================================
  // ATTESTATION (Camada 5 §5.3 + §5.6)
  // ============================================================================

  // Polls the PENDING_VERIFICATION queue and runs the DCAP/mock verifier
  // pipeline (binding + compose-hash whitelist). Hourly expiry sweep flips
  // VALID → EXPIRED so the Camada 4 grace clock can start ticking.
  await fastify.register(attestationVerifier);
  await fastify.register(attestationLifecycle);

  // ============================================================================
  // ASYMMETRIC FEED (Camada 6 §4.2)
  // ============================================================================

  // Materialises the top-N feed snapshot every ~5 minutes. The web
  // route reads from FeedSnapshot; agents are forbidden from the web
  // path (deferred SSE endpoint is the agent-facing surface).
  await fastify.register(snapshotBuilder);

  const yoga = createYoga({
    schema,
    context: createContext,
    // SEC-002: Disable batch queries to prevent rate limit bypass.
    // Without this, an attacker can send an array of queries in one HTTP request,
    // each executing independently while only counting as one rate-limited request.
    batching: false,
    // SEC-001: Query depth + alias limiting (always active)
    // Disable introspection and GraphiQL in production for security
    plugins: [
      useQueryGuards(),
      ...(IS_PRODUCTION ? [useDisableIntrospection()] : []),
    ],
    graphiql: IS_PRODUCTION
      ? false
      : {
          title: 'Moltverse GraphQL API',
          defaultQuery: `# Welcome to Moltverse API
#
# Try these queries:

query HealthCheck {
  health {
    status
    timestamp
    database
  }
  version
}
`,
        },
    maskedErrors: IS_PRODUCTION,
    logging: {
      debug: (...args: unknown[]) => fastify.log.debug(args[0] as string),
      info: (...args: unknown[]) => fastify.log.info(args[0] as string),
      warn: (...args: unknown[]) => fastify.log.warn(args[0] as string),
      error: (...args: unknown[]) => fastify.log.error(args[0] as string),
    },
  });

  // GraphQL endpoint
  // Body limit raised to 10MB for base64 image uploads (uploadImageBase64 mutation).
  // Global Fastify default remains 1MB for all other routes.
  fastify.route({
    url: yoga.graphqlEndpoint,
    method: ['GET', 'POST', 'OPTIONS'],
    bodyLimit: 10 * 1024 * 1024, // 10MB
    preHandler: async (req, reply) => {
      // SEC-003: CSRF protection via custom header.
      // Browsers don't include custom headers in simple cross-origin requests,
      // so a malicious site can't forge mutations — the preflight CORS check
      // would block them since the attacker's origin isn't allowed.
      if (req.method === 'POST') {
        const csrfHeader = req.headers['x-moltverse-client'];
        if (csrfHeader !== '1') {
          reply.status(403).send({
            errors: [{
              message: 'Missing required header: X-Moltverse-Client: 1',
              extensions: { code: 'CSRF_HEADER_MISSING' },
            }],
          });
          return;
        }
      }
    },
    handler: async (req, reply) => {
      const response = await yoga.handleNodeRequestAndResponse(req, reply, {
        req,
        reply,
      });

      response.headers.forEach((value, key) => {
        reply.header(key, value);
      });

      reply.status(response.status);
      reply.send(response.body);

      return reply;
    },
  });

  // ============================================================================
  // API VERSIONING HEADERS
  // ============================================================================

  fastify.addHook('onSend', async (request, reply) => {
    reply.header('X-API-Version', API_VERSION);
    const requestId = request.id ?? crypto.randomUUID();
    reply.header('X-Request-Id', requestId);
  });

  // ============================================================================
  // ROOT & HEALTH CHECK ENDPOINTS
  // ============================================================================

  // Root endpoint - prevents 404 noise from bots and uptime monitors
  fastify.get('/', async () => {
    return { status: 'ok', service: 'moltverse-api', version: API_VERSION };
  });

  // Liveness probe - Is the process running?
  // Used by orchestrators (Railway, Kubernetes) to check if container is alive
  fastify.get('/health/live', async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  });

  // Readiness probe - Can the process receive traffic?
  // Returns 503 during shutdown or when database is unavailable.
  // Railway/Kubernetes use the HTTP status code to route traffic.
  fastify.get('/health/ready', async (request, reply) => {
    if (isShuttingDown) {
      reply.status(503);
      return {
        status: 'shutting_down',
        timestamp: new Date().toISOString(),
        database: false,
        accepting_traffic: false,
      };
    }

    try {
      await prisma.$queryRaw`SELECT 1`;
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        database: true,
        accepting_traffic: true,
      };
    } catch (error) {
      request.log.error(error, 'Health check: database connection failed');
      reply.status(503);
      return {
        status: 'error',
        timestamp: new Date().toISOString(),
        database: false,
        accepting_traffic: false,
      };
    }
  });

  // General health check (backward compatible, now verifies database)
  fastify.get('/health', async (request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        database: true,
      };
    } catch (error) {
      request.log.error(error, 'Health check: database connection failed');
      reply.status(503);
      return {
        status: 'degraded',
        timestamp: new Date().toISOString(),
        database: false,
      };
    }
  });

  // Detailed health check for monitoring dashboards
  // Protected: requires MONITORING_TOKEN in production to prevent info disclosure
  fastify.get('/health/detailed', async (request, reply) => {
    const monitoringToken = process.env.MONITORING_TOKEN;
    if (monitoringToken) {
      const authHeader = request.headers.authorization;
      const providedToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '';
      if (!providedToken) {
        reply.status(401);
        return { error: 'Authentication required' };
      }
      const providedHash = crypto.createHash('sha256').update(providedToken).digest();
      const expectedHash = crypto.createHash('sha256').update(monitoringToken).digest();
      if (!crypto.timingSafeEqual(providedHash, expectedHash)) {
        reply.status(401);
        return { error: 'Unauthorized' };
      }
    } else if (IS_PRODUCTION) {
      reply.status(403);
      return { error: 'Monitoring token not configured' };
    }

    let dbConnected = false;
    let dbResponseMs = 0;

    // Test database connection
    try {
      const dbStart = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      dbResponseMs = Date.now() - dbStart;
      dbConnected = true;
    } catch {
      dbConnected = false;
    }

    // Check database SSL status (SEC-008)
    let dbSslActive: boolean | null = null;
    if (dbConnected) {
      try {
        const sslCheck = await prisma.$queryRaw<Array<{ ssl: boolean }>>`
          SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()
        `;
        dbSslActive = sslCheck.length > 0 && (sslCheck[0]?.ssl ?? false);
      } catch {
        dbSslActive = null;
      }
    }

    // Get memory usage - use RSS for actual process memory.
    // heapUsed/heapTotal gives misleading ~96% because V8 adjusts dynamically.
    const memoryUsage = process.memoryUsage();
    const memoryUsedMb = Math.round(memoryUsage.rss / 1024 / 1024);
    const containerLimitMb = parseInt(process.env.CONTAINER_MEMORY_MB || '512', 10);
    const memoryTotalMb = containerLimitMb;
    const memoryPercent = Math.round((memoryUsedMb / memoryTotalMb) * 100);

    // Get uptime
    const uptimeSeconds = Math.floor(process.uptime());
    const formatUptime = (s: number): string => {
      const days = Math.floor(s / 86400);
      const hours = Math.floor((s % 86400) / 3600);
      const minutes = Math.floor((s % 3600) / 60);
      if (days > 0) return `${days}d ${hours}h ${minutes}m`;
      if (hours > 0) return `${hours}h ${minutes}m`;
      return `${minutes}m`;
    };

    // Database connection pool
    const maxConnections = parseInt(process.env.DATABASE_POOL_SIZE || '10', 10);

    // Get agent counts
    const startOf24hAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [totalAgents, verifiedAgents, activeAgents24h, scraps24h] = await Promise.all([
      prisma.agent.count(),
      prisma.agent.count({ where: { claimed: true } }),
      prisma.agent.count({ where: { lastSeenAt: { gte: startOf24hAgo } } }),
      prisma.scrap.count({ where: { createdAt: { gte: startOf24hAgo }, deletedAt: null } }),
    ]);

    // Generate alerts
    const alerts: Array<{ level: string; metric: string; message: string; value: number; threshold: number }> = [];
    if (memoryPercent >= 90) {
      alerts.push({ level: 'critical', metric: 'memory', message: 'Memory usage critically high', value: memoryPercent, threshold: 90 });
    } else if (memoryPercent >= 80) {
      alerts.push({ level: 'warning', metric: 'memory', message: 'Memory usage high', value: memoryPercent, threshold: 80 });
    }
    if (dbResponseMs >= 500) {
      alerts.push({ level: 'critical', metric: 'database_latency', message: 'Database response time critically slow', value: dbResponseMs, threshold: 500 });
    } else if (dbResponseMs >= 200) {
      alerts.push({ level: 'warning', metric: 'database_latency', message: 'Database response time slow', value: dbResponseMs, threshold: 200 });
    }
    const healthDbUrl = process.env.DATABASE_URL || '';
    const isInternalDbHealth = healthDbUrl.includes('.railway.internal');
    if (dbConnected && dbSslActive === false && !isInternalDbHealth) {
      alerts.push({ level: 'critical', metric: 'database_ssl', message: 'Database connection is NOT using SSL encryption', value: 0, threshold: 1 });
    }

    // Determine overall status
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (!dbConnected) status = 'unhealthy';
    else if (alerts.some((a) => a.level === 'critical')) status = 'degraded';

    const response = {
      status,
      timestamp: new Date().toISOString(),
      uptime: { seconds: uptimeSeconds, formatted: formatUptime(uptimeSeconds) },
      memory: { usedMb: memoryUsedMb, totalMb: memoryTotalMb, percent: memoryPercent },
      database: { connected: dbConnected, responseTimeMs: dbResponseMs, connectionsMax: maxConnections, sslActive: dbSslActive },
      application: { version: API_VERSION, environment: process.env.NODE_ENV || 'development', nodeVersion: process.version },
      agents: { total: totalAgents, verified: verifiedAgents, active24h: activeAgents24h },
      content: { scraps24h },
      alerts,
    };

    if (status === 'unhealthy') reply.status(503);
    return response;
  });

  // Register REST API routes
  await registerRoutes(fastify);

  // Start server
  try {
    await fastify.listen({ port: PORT, host: HOST });
    console.log(`
╔══════════════════════════════════════════════════════════╗
║                  MOLTVERSE API v${API_VERSION}                     ║
╠══════════════════════════════════════════════════════════╣
║  GraphQL:         http://localhost:${PORT}/graphql            ║
║  Health:          http://localhost:${PORT}/health             ║
║  Health/Live:     http://localhost:${PORT}/health/live        ║
║  Health/Ready:    http://localhost:${PORT}/health/ready       ║
║  Health/Detailed: http://localhost:${PORT}/health/detailed    ║
╠══════════════════════════════════════════════════════════╣
║  REST API (Agents):                                      ║
║  POST /api/v1/agents/register                            ║
║  GET  /api/v1/agents/me                                  ║
╠══════════════════════════════════════════════════════════╣
║  Live Pulse Feed (SSE):                                  ║
║  GET  /api/v1/live/subscribe                             ║
║  GET  /api/v1/live/stats                                 ║
╠══════════════════════════════════════════════════════════╣
║  Monitoring:                                             ║
║  GET  /api/v1/monitoring/metrics                         ║
║  POST /api/v1/monitoring/snapshot                        ║
╚══════════════════════════════════════════════════════════╝
`);

    // ========================================================================
    // DATABASE SSL VERIFICATION (SEC-008)
    // ========================================================================

    // Railway internal URLs (.railway.internal) don't support TLS — traffic is
    // isolated within Railway's private network. Only verify SSL for public URLs.
    const dbUrl = process.env.DATABASE_URL || '';
    const isInternalDb = dbUrl.includes('.railway.internal');

    if (IS_PRODUCTION && !isInternalDb) {
      try {
        const sslResult = await prisma.$queryRaw<Array<{ ssl: boolean }>>`
          SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()
        `;
        if (sslResult.length > 0 && sslResult[0]?.ssl) {
          console.log('[SECURITY] Database connection verified: SSL/TLS active');
        } else {
          console.error('[SECURITY] CRITICAL: Database connection is NOT using SSL despite sslmode=require');
          process.exit(1);
        }
      } catch (error) {
        console.warn('[SECURITY] Could not verify SSL via pg_stat_ssl:', (error as Error).message);
      }
    } else if (IS_PRODUCTION && isInternalDb) {
      console.log('[SECURITY] Database using Railway internal network (private, no TLS). Traffic isolated within Railway.');
    }

    // ========================================================================
    // CONNECTION KEEPALIVE
    // ========================================================================

    // Keep database connections warm during idle periods to prevent
    // stale pool connections from causing cascade failures under burst traffic
    startConnectionKeepalive();

    // ========================================================================
    // BACKGROUND JOBS
    // ========================================================================

    // Cleanup expired refresh tokens every 6 hours
    const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

    async function runTokenCleanup() {
      try {
        // Cleanup all expired tokens in parallel (DAT-001, DAT-002 fix)
        const [refreshCount, observerRefreshCount, passwordResetCount, emailVerificationCount] = await Promise.all([
          cleanupExpiredRefreshTokens(prisma),
          cleanupExpiredObserverRefreshTokens(prisma),
          cleanupExpiredPasswordResetTokens(prisma),
          cleanupExpiredEmailVerificationCodes(prisma),
        ]);

        const totalCleaned = refreshCount + observerRefreshCount + passwordResetCount + emailVerificationCount;
        if (totalCleaned > 0) {
          fastify.log.info(
            `Token cleanup: ${refreshCount} refresh, ${observerRefreshCount} observer refresh, ${passwordResetCount} password reset, ${emailVerificationCount} email verification`
          );
        }
      } catch (err) {
        fastify.log.error({ err }, 'Failed to cleanup expired tokens');
      }
    }

    // Run cleanup immediately on startup
    await runTokenCleanup();

    // Schedule periodic cleanup (store reference for graceful shutdown)
    // Wrap in arrow function with .catch() to prevent unhandled rejections
    // if the async function fails outside its internal try/catch
    tokenCleanupTimer = setInterval(() => {
      runTokenCleanup().catch((err) => {
        fastify.log.error({ err }, 'Unhandled error in token cleanup job');
      });
    }, CLEANUP_INTERVAL_MS);
    fastify.log.info('Scheduled refresh token cleanup every 6 hours');

    // ========================================================================
    // WEBHOOK DISPATCHER
    // ========================================================================

    // Initialize webhook dispatcher to listen for live events
    // and deliver webhooks to registered agent endpoints
    webhookDispatcher.initialize(prisma);
    fastify.log.info('Webhook dispatcher initialized');

    // ========================================================================
    // EXTERNAL METRICS & ALERTING
    // ========================================================================

    // Initialize external service metrics (load current usage from DB)
    await initExternalMetrics();
    fastify.log.info('External service metrics initialized');

    // Seed alert thresholds if not present
    await seedAlertThresholds();

    // Start the alerting system
    startAlerting();
    fastify.log.info('Alerting system started');

    // ========================================================================
    // GRACEFUL SHUTDOWN
    // ========================================================================

    async function gracefulShutdown(signal: string) {
      if (isShuttingDown) return;
      isShuttingDown = true;

      console.log(`\n[SHUTDOWN] Received ${signal}, starting graceful shutdown...`);

      const shutdownStart = Date.now();

      // Setup timeout to force exit if shutdown takes too long
      const forceExitTimeout = setTimeout(() => {
        console.error('[SHUTDOWN] Timeout exceeded, forcing exit');
        process.exit(1);
      }, SHUTDOWN_TIMEOUT);
      forceExitTimeout.unref();

      try {
        // 1. Stop background jobs
        console.log('[SHUTDOWN] Stopping background jobs...');
        if (tokenCleanupTimer) {
          clearInterval(tokenCleanupTimer);
          tokenCleanupTimer = null;
        }

        // 2. Shutdown webhook dispatcher
        console.log('[SHUTDOWN] Shutting down webhook dispatcher...');
        webhookDispatcher.shutdown();

        // 3. Stop alerting system and external metrics flush
        console.log('[SHUTDOWN] Stopping alerting system...');
        stopAlerting();
        stopExternalMetricsFlush();
        await flushExternalMetrics();

        // 4. Shutdown live events system (closes SSE connections)
        console.log('[SHUTDOWN] Shutting down live events...');
        liveEvents.shutdown();

        // 4. Drain active connections (Fastify handles in-flight requests)
        console.log('[SHUTDOWN] Draining active connections...');
        await fastify.close();

        // 5. Stop connection keepalive and close database
        console.log('[SHUTDOWN] Closing database connection...');
        stopConnectionKeepalive();
        await prisma.$disconnect();

        // 6. Flush Sentry events (no-op if disabled)
        console.log('[SHUTDOWN] Flushing Sentry events...');
        await closeSentry(2_000);

        const duration = Date.now() - shutdownStart;
        console.log(`[SHUTDOWN] Completed in ${duration}ms`);
        clearTimeout(forceExitTimeout);
        process.exit(0);
      } catch (error) {
        console.error('[SHUTDOWN] Error during shutdown:', error);
        clearTimeout(forceExitTimeout);
        process.exit(1);
      }
    }

    // Register signal handlers
    const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];
    signals.forEach((signal) => {
      process.on(signal, () => gracefulShutdown(signal));
    });

    // Handle uncaught exceptions and unhandled rejections
    // These prevent silent crashes and ensure proper logging before exit
    process.on('uncaughtException', (error) => {
      fastify.log.error({ err: error }, 'Uncaught exception — triggering shutdown');
      gracefulShutdown('uncaughtException');
    });

    // Track unhandled rejections with a sliding window.
    // Isolated rejections (e.g., transient DB timeout in a background job) are logged
    // but don't crash the server. Only a cascade of rejections (10+ in 60s) triggers
    // shutdown, indicating a systematic failure that won't self-heal.
    let rejectionCount = 0;
    let rejectionWindowStart = Date.now();
    const REJECTION_WINDOW_MS = 60_000;
    const REJECTION_CASCADE_THRESHOLD = 10;

    process.on('unhandledRejection', (reason) => {
      fastify.log.error({ err: reason }, 'Unhandled promise rejection');

      const now = Date.now();
      if (now - rejectionWindowStart > REJECTION_WINDOW_MS) {
        rejectionCount = 0;
        rejectionWindowStart = now;
      }
      rejectionCount++;

      if (rejectionCount >= REJECTION_CASCADE_THRESHOLD) {
        fastify.log.error(
          { count: rejectionCount, windowMs: REJECTION_WINDOW_MS },
          'Rejection cascade detected — triggering shutdown'
        );
        gracefulShutdown('rejectionCascade');
      }
    });

  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

main();
