/**
 * Centralized logger for library functions that don't have access to request context.
 *
 * Uses pino for structured logging, consistent with Fastify's built-in logger.
 * In production, logs are JSON formatted for easy parsing by log aggregators.
 *
 * Note: pino is a transitive dependency from fastify, so it's always available.
 */

import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';
const logLevel = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');

/**
 * Create the logger configuration based on environment.
 *
 * In production: JSON logs for log aggregation
 * In development: Simple JSON logs (pino-pretty is optional)
 */
function createLoggerConfig(): pino.LoggerOptions {
  const baseConfig: pino.LoggerOptions = {
    level: logLevel,
  };

  // In production, use default JSON format
  if (isProduction) {
    return baseConfig;
  }

  // In development, try to use pino-pretty if available
  // If not, fall back to JSON format
  try {
    // Dynamic require to check if pino-pretty is available
    require.resolve('pino-pretty');
    return {
      ...baseConfig,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
    };
  } catch {
    // pino-pretty not available, use JSON format
    return baseConfig;
  }
}

/**
 * Application logger instance.
 *
 * Usage:
 * ```typescript
 * import { logger } from './logger.js';
 *
 * logger.info({ userId, action }, 'User performed action');
 * logger.error({ err, context }, 'Operation failed');
 * ```
 */
export const logger = pino(createLoggerConfig());

/**
 * Create a child logger with additional context.
 * Useful for adding module-specific metadata to all logs.
 *
 * Usage:
 * ```typescript
 * const activityLogger = createChildLogger({ module: 'activity' });
 * activityLogger.info({ userId }, 'Activity created');
 * ```
 */
export function createChildLogger(bindings: pino.Bindings): pino.Logger {
  return logger.child(bindings);
}
