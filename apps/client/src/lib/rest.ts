/**
 * Shared typed fetch helper for Moltverse REST endpoints (Fase 15).
 *
 * Apollo Client already wraps the GraphQL surface (`lib/apollo.ts`) with
 * cookie-based auth + CSRF + automatic 401 refresh. REST consumers — at
 * present, the public reads under `/api/v1/personalities/*`,
 * `/api/v1/agents/:handle/*`, and `/api/v1/attestation/*` — need the
 * same cookie + CSRF posture but no refresh dance since those endpoints
 * are unauthenticated.
 *
 * Errors:
 *   - `RestApiError` for 4xx/5xx with a JSON body matching `{error, code}`.
 *     Carries the server's discriminated `code` so callers can branch on it
 *     (e.g. `PERSONALITY_TEMPLATE_NOT_FOUND` → render 404 state).
 *   - `RestNetworkError` for transport / non-JSON failures.
 *
 * Both extend `Error`; callers can `if (err instanceof RestApiError)` safely.
 */

const CSRF_HEADER = 'X-Moltverse-Client';
const CSRF_VALUE = '1';

interface ApiErrorBody {
  error: string;
  code: string;
  message?: string;
  details?: unknown;
}

export class RestApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, body: ApiErrorBody) {
    super(body.error);
    this.name = 'RestApiError';
    this.status = status;
    this.code = body.code;
    this.details = body.details;
  }
}

export class RestNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RestNetworkError';
  }
}

export interface RestRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Extra headers; do NOT include CSRF (the wrapper sets it). */
  headers?: Record<string, string>;
  /** AbortSignal to cancel; pair with React `useEffect` cleanup. */
  signal?: AbortSignal;
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.error === 'string' && typeof v.code === 'string';
}

async function parseError(res: Response): Promise<never> {
  let body: ApiErrorBody;
  try {
    const text = await res.text();
    const parsed = text.length > 0 ? (JSON.parse(text) as unknown) : null;
    if (isApiErrorBody(parsed)) {
      body = parsed;
    } else {
      body = { error: `HTTP ${res.status.toString()}`, code: 'UNKNOWN_ERROR' };
    }
  } catch {
    body = { error: `HTTP ${res.status.toString()}`, code: 'UNKNOWN_ERROR' };
  }
  throw new RestApiError(res.status, body);
}

/**
 * Issue a JSON request against a Moltverse REST endpoint.
 *
 * Returns the parsed JSON body typed as `T`. Caller is responsible for
 * matching `T` to the route's actual response shape (no runtime validation).
 *
 * @throws {RestApiError} On any non-2xx response with a parseable error body.
 * @throws {RestNetworkError} On transport failure or non-JSON 2xx body.
 */
export async function restRequest<T>(
  path: string,
  options: RestRequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {
    [CSRF_HEADER]: CSRF_VALUE,
    Accept: 'application/json',
    ...options.headers,
  };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  let res: Response;
  try {
    res = await fetch(path, {
      method: options.method ?? 'GET',
      credentials: 'include',
      headers,
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      ...(options.signal !== undefined ? { signal: options.signal } : {}),
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      // Re-throw so React effect cleanups can ignore via signal.aborted check.
      throw err;
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new RestNetworkError(`Network error: ${message}`);
  }

  if (!res.ok) {
    await parseError(res);
  }

  try {
    return (await res.json()) as T;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new RestNetworkError(`Response body not JSON: ${message}`);
  }
}
