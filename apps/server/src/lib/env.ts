/**
 * Environment variable validation
 *
 * Validates all critical environment variables at startup.
 * Fail-fast: if a critical variable is missing in production, the server won't start.
 */

export interface EnvConfig {
  isProduction: boolean;
  port: number;
  host: string;
  databaseUrl: string;
  jwtSecret: string;
  cookieSecret: string;
  corsOrigins: string[];
  cloudinary: {
    cloudName: string | null;
    apiKey: string | null;
    apiSecret: string | null;
  };
}

// Development-only fallback secrets
const DEV_JWT_SECRET = 'moltverse-dev-only-secret-do-not-use-in-production';
const DEV_COOKIE_SECRET = 'moltverse-dev-cookie-secret-do-not-use-in-production';

// AUTH-005: Minimum secret length for cryptographic security
// 32 characters = 256 bits, recommended minimum for HMAC-SHA256
const MIN_SECRET_LENGTH = 32;

interface ValidationError {
  variable: string;
  message: string;
}

/**
 * Validate environment and return typed config
 * Throws on critical errors in production
 */
export function validateEnv(): EnvConfig {
  const isProduction = process.env.NODE_ENV === 'production';
  const errors: ValidationError[] = [];
  const warnings: string[] = [];

  // DATABASE_URL - Always required
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    errors.push({
      variable: 'DATABASE_URL',
      message: 'Database connection string is required',
    });
  }

  // DATABASE_URL - Require SSL in production (SEC-008)
  // Railway internal URLs (.railway.internal) do NOT support TLS — traffic stays
  // within Railway's private network. Only public proxy URLs support sslmode=require.
  if (isProduction && databaseUrl && !databaseUrl.includes('sslmode=require') && !databaseUrl.includes('ssl=true')) {
    const isInternalUrl = databaseUrl.includes('.railway.internal');
    if (isInternalUrl) {
      warnings.push('DATABASE_URL uses internal Railway network (no TLS available). Traffic is isolated within Railway\'s private network.');
    } else {
      errors.push({
        variable: 'DATABASE_URL',
        message: 'DATABASE_URL must include sslmode=require in production for encrypted database traffic (SEC-008)',
      });
    }
  }

  // JWT_SECRET - Required in production with minimum length
  let jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    if (isProduction) {
      errors.push({
        variable: 'JWT_SECRET',
        message: `JWT secret is required in production (at least ${MIN_SECRET_LENGTH} characters)`,
      });
    } else {
      warnings.push('JWT_SECRET not set - using development fallback');
      jwtSecret = DEV_JWT_SECRET;
    }
  } else if (isProduction && jwtSecret.length < MIN_SECRET_LENGTH) {
    // AUTH-005: Validate minimum secret length in production
    errors.push({
      variable: 'JWT_SECRET',
      message: `JWT secret must be at least ${MIN_SECRET_LENGTH} characters (current: ${jwtSecret.length})`,
    });
  }

  // COOKIE_SECRET - Required in production with minimum length
  let cookieSecret = process.env.COOKIE_SECRET;
  if (!cookieSecret) {
    if (isProduction) {
      errors.push({
        variable: 'COOKIE_SECRET',
        message: `Cookie secret is required in production (at least ${MIN_SECRET_LENGTH} characters)`,
      });
    } else {
      warnings.push('COOKIE_SECRET not set - using development fallback');
      cookieSecret = DEV_COOKIE_SECRET;
    }
  } else if (isProduction && cookieSecret.length < MIN_SECRET_LENGTH) {
    // AUTH-005: Validate minimum secret length in production
    errors.push({
      variable: 'COOKIE_SECRET',
      message: `Cookie secret must be at least ${MIN_SECRET_LENGTH} characters (current: ${cookieSecret.length})`,
    });
  }

  // ADMIN_SECRET - Required in production with minimum length
  const adminSecret = process.env.ADMIN_SECRET;
  if (isProduction) {
    if (!adminSecret) {
      errors.push({
        variable: 'ADMIN_SECRET',
        message: `Admin secret is required in production (at least ${MIN_SECRET_LENGTH} characters)`,
      });
    } else if (adminSecret.length < MIN_SECRET_LENGTH) {
      errors.push({
        variable: 'ADMIN_SECRET',
        message: `Admin secret must be at least ${MIN_SECRET_LENGTH} characters (current: ${adminSecret.length})`,
      });
    }
  }

  // WEBHOOK_ENCRYPTION_KEY - Required in production for encrypting webhook secrets at rest (SEC-007)
  const webhookEncKey = process.env.WEBHOOK_ENCRYPTION_KEY;
  if (isProduction) {
    if (!webhookEncKey) {
      errors.push({
        variable: 'WEBHOOK_ENCRYPTION_KEY',
        message: 'Webhook encryption key is required in production (64 hex chars = 256-bit AES key)',
      });
    } else if (!/^[0-9a-f]{64}$/i.test(webhookEncKey)) {
      errors.push({
        variable: 'WEBHOOK_ENCRYPTION_KEY',
        message: 'Webhook encryption key must be exactly 64 hex characters (256-bit AES key)',
      });
    }
  } else if (webhookEncKey && !/^[0-9a-f]{64}$/i.test(webhookEncKey)) {
    warnings.push('WEBHOOK_ENCRYPTION_KEY is set but invalid format (must be 64 hex chars) - webhook secrets will be stored in plaintext');
  }

  // DISABLE_RATE_LIMIT - Must not be set in production (SEC-005)
  if (isProduction && process.env.DISABLE_RATE_LIMIT === 'true') {
    errors.push({
      variable: 'DISABLE_RATE_LIMIT',
      message: 'Rate limiting cannot be disabled in production. Remove DISABLE_RATE_LIMIT or set to false.',
    });
  }

  // CORS_ORIGINS - Required in production
  const corsOriginsRaw = process.env.CORS_ORIGINS;
  let corsOrigins: string[] = [];
  if (corsOriginsRaw) {
    corsOrigins = corsOriginsRaw.split(',').map((o) => o.trim()).filter(Boolean);
  } else if (isProduction) {
    errors.push({
      variable: 'CORS_ORIGINS',
      message: 'CORS origins must be specified in production',
    });
  } else {
    corsOrigins = ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002'];
  }

  // PORT and HOST - Optional with defaults
  const port = parseInt(process.env.PORT ?? '4000', 10);
  const host = process.env.HOST ?? '0.0.0.0';

  // FRONTEND_URL - Required in production for email links (password reset, verification)
  const frontendUrl = process.env.FRONTEND_URL;
  if (!frontendUrl) {
    if (isProduction) {
      errors.push({
        variable: 'FRONTEND_URL',
        message: 'Frontend URL is required in production (used for password reset and verification emails)',
      });
    } else {
      warnings.push('FRONTEND_URL not set - using http://localhost:3000');
    }
  }

  // RESEND_API_KEY - Required for email functionality
  if (!process.env.RESEND_API_KEY) {
    if (isProduction) {
      warnings.push('RESEND_API_KEY not set - email features (password reset, verification) will fail');
    }
  }

  // ADMIN_*_IDS - Warn if no admin access configured in production
  if (isProduction) {
    const hasAdminUsers = !!process.env.ADMIN_USER_IDS?.trim();
    const hasAdminObservers = !!process.env.ADMIN_OBSERVER_IDS?.trim();
    const hasAdminAgents = !!process.env.ADMIN_AGENT_IDS?.trim();
    if (!hasAdminUsers && !hasAdminObservers && !hasAdminAgents) {
      warnings.push('No ADMIN_USER_IDS, ADMIN_OBSERVER_IDS, or ADMIN_AGENT_IDS configured - admin dashboard will be inaccessible');
    }
  }

  // Cloudinary - Optional (features requiring upload will fail gracefully)
  const cloudinaryCloudName = process.env.CLOUDINARY_CLOUD_NAME || null;
  const cloudinaryApiKey = process.env.CLOUDINARY_API_KEY || null;
  const cloudinaryApiSecret = process.env.CLOUDINARY_API_SECRET || null;

  if (!cloudinaryCloudName || !cloudinaryApiKey || !cloudinaryApiSecret) {
    warnings.push('Cloudinary not configured - photo uploads will be disabled');
  }

  // Output warnings
  if (warnings.length > 0) {
    warnings.forEach((warning) => {
      console.warn(`\x1b[33m[ENV WARNING]\x1b[0m ${warning}`);
    });
  }

  // Fail on errors
  if (errors.length > 0) {
    console.error('\x1b[31m[ENV ERROR] Missing required environment variables:\x1b[0m');
    errors.forEach((error) => {
      console.error(`  - ${error.variable}: ${error.message}`);
    });
    console.error('\nPlease set these variables in your .env file or environment.');
    process.exit(1);
  }

  return {
    isProduction,
    port,
    host,
    databaseUrl: databaseUrl!,
    jwtSecret: jwtSecret!,
    cookieSecret: cookieSecret!,
    corsOrigins,
    cloudinary: {
      cloudName: cloudinaryCloudName,
      apiKey: cloudinaryApiKey,
      apiSecret: cloudinaryApiSecret,
    },
  };
}

// Singleton config - validated once at startup
let envConfig: EnvConfig | null = null;

/**
 * Get validated environment config
 * Call validateEnv() first at startup
 */
export function getEnvConfig(): EnvConfig {
  if (!envConfig) {
    envConfig = validateEnv();
  }
  return envConfig;
}
