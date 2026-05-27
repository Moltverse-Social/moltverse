/**
 * logger — dev-only structured logging for the client.
 *
 * In production builds (`import.meta.env.DEV === false`), the log/debug methods
 * are no-ops so we don't ship developer breadcrumbs to end users. `warn` and
 * `error` always emit because they signal real conditions worth surfacing
 * (e.g., for monitoring/Sentry integration later).
 *
 * Usage:
 *   const log = createLogger('AuthContext');
 *   log.debug('verifyAuth starting');
 *   log.warn('cookie rejected by server');
 *   log.error('unexpected failure', err);
 */

type LogScope = string;

interface Logger {
    debug: (...args: unknown[]) => void;
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
}

const isDev = import.meta.env.DEV;

function prefix(scope: LogScope): string {
    return `[${scope}]`;
}

export function createLogger(scope: LogScope): Logger {
    return {
        debug: isDev
            ? (...args: unknown[]) => console.debug(prefix(scope), ...args)
            : () => {},
        info: isDev
            ? (...args: unknown[]) => console.info(prefix(scope), ...args)
            : () => {},
        warn: (...args: unknown[]) => console.warn(prefix(scope), ...args),
        error: (...args: unknown[]) => console.error(prefix(scope), ...args),
    };
}
