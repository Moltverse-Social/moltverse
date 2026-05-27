/**
 * Structured logging for ad events
 *
 * Provides consistent logging format for ad-related events,
 * matching the backend logging pattern for easier correlation.
 *
 * In development: Logs to console with formatted output
 * In production: Could be extended to send to analytics/monitoring
 *
 * @module lib/ad-logger
 */

// =============================================================================
// TYPES
// =============================================================================

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogData {
  [key: string]: unknown;
}

type AdEventType =
  // Fetch events
  | 'ad_fetch_success'
  | 'ad_fetch_failed'
  | 'ad_fetch_retry'
  | 'ad_fetch_none'
  // Cache events
  | 'ad_cache_hit'
  | 'ad_cache_miss'
  | 'ad_cache_invalidate'
  // Tracking events
  | 'ad_impression'
  | 'ad_impression_failed'
  | 'ad_click'
  | 'ad_click_failed'
  | 'ad_click_debounced'
  // Sidebar ad events
  | 'sidebar_ad_click'
  | 'sidebar_ad_click_debounced'
  | 'sidebar_ad_impression'
  | 'sidebar_ad_loaded'
  | 'sidebar_ad_none'
  | 'sidebar_ad_fetch_failed'
  | 'sidebar_ad_fetch_error'
  | 'sidebar_animation_loaded'
  | 'sidebar_animation_failed';

// =============================================================================
// CONFIGURATION
// =============================================================================

const IS_DEV = import.meta.env.DEV;
const LOG_PREFIX = '[Ads]';

// Log level threshold (only logs at or above this level are shown)
const LOG_LEVEL_THRESHOLD: LogLevel = IS_DEV ? 'debug' : 'info';

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// =============================================================================
// LOGGER IMPLEMENTATION
// =============================================================================

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_ORDER[level] >= LOG_LEVEL_ORDER[LOG_LEVEL_THRESHOLD];
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

function log(level: LogLevel, event: AdEventType, data?: LogData): void {
  if (!shouldLog(level)) return;

  const timestamp = formatTimestamp();
  const logEntry = {
    timestamp,
    level,
    event,
    ...data,
  };

  // Format for console
  const message = `${LOG_PREFIX} ${event}`;

  switch (level) {
    case 'debug':
      console.debug(message, logEntry);
      break;
    case 'info':
      console.info(message, logEntry);
      break;
    case 'warn':
      console.warn(message, logEntry);
      break;
    case 'error':
      console.error(message, logEntry);
      break;
  }

  // In production, you could extend this to send to analytics
  // if (!IS_DEV && level !== 'debug') {
  //   sendToAnalytics(logEntry);
  // }
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Structured logger for ad events.
 *
 * Usage:
 * ```typescript
 * adLogger.info('ad_impression', { campaignId: '123', duration: 1050 });
 * adLogger.error('ad_click_failed', { impressionId: '456', error: 'Network error' });
 * ```
 */
export const adLogger = {
  /**
   * Debug level - only shown in development
   */
  debug: (event: AdEventType, data?: LogData) => log('debug', event, data),

  /**
   * Info level - normal operations
   */
  info: (event: AdEventType, data?: LogData) => log('info', event, data),

  /**
   * Warn level - recoverable issues
   */
  warn: (event: AdEventType, data?: LogData) => log('warn', event, data),

  /**
   * Error level - failures
   */
  error: (event: AdEventType, data?: LogData) => log('error', event, data),
};

// =============================================================================
// EXPORTS FOR TESTING
// =============================================================================

export const __testExports = {
  shouldLog,
  formatTimestamp,
  LOG_LEVEL_ORDER,
};
