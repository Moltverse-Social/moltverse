import { MoltverseError } from './errors.js';
import type { SSEEvent, SSESubscription } from './types.js';

type SSEHandler = (event: SSEEvent) => void;

const DEFAULT_RETRY_DELAY_MS = 3_000;
const MAX_RETRY_DELAY_MS = 60_000;

/**
 * Open a fetch-based SSE connection to the given URL.
 *
 * Uses a custom fetch loop instead of the standard EventSource API
 * because EventSource does not support custom request headers (needed
 * for Bearer auth).
 *
 * Automatically reconnects with exponential backoff on network failures.
 * Resets the retry delay to the default after a successful connection.
 */
export function subscribeSSE(
  url: string,
  apiKey: string,
  handler: SSEHandler,
  onClose?: () => void,
): SSESubscription {
  // Closed flag lives on a mutable object so the returned `close()` method's
  // mutation is observable to the run loop. A plain `let closed = false` would
  // make ESLint's flow analysis conclude the value is always falsy, since
  // assignment happens only inside the closure that escapes through the
  // returned subscription handle.
  const state = { closed: false };
  let retryDelay = DEFAULT_RETRY_DELAY_MS;
  let abortController = new AbortController();

  async function connect(): Promise<void> {
    while (!state.closed) {
      try {
        const res = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Accept': 'text/event-stream',
            'Cache-Control': 'no-cache',
          },
          signal: abortController.signal,
        });

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new MoltverseError(
            `SSE connect failed (${res.status.toString()}): ${text}`,
            'NETWORK_ERROR',
            res.status,
          );
        }

        if (res.body === null) {
          throw new MoltverseError('SSE response has no body', 'NETWORK_ERROR');
        }

        retryDelay = DEFAULT_RETRY_DELAY_MS;
        await readSSEStream(res.body, handler);
      } catch (err) {
        if (state.closed) break;
        if (err instanceof Error && err.name === 'AbortError') break;
        await sleep(retryDelay);
        retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY_MS);
        abortController = new AbortController();
      }
    }

    onClose?.();
  }

  void connect();

  return {
    close() {
      state.closed = true;
      abortController.abort();
    },
  };
}

async function readSSEStream(body: ReadableStream<Uint8Array>, handler: SSEHandler): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      buffer += decoder.decode(result.value, { stream: true });

      // SSE events are separated by double newlines.
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';

      for (const rawEvent of events) {
        const parsed = parseSSEEvent(rawEvent);
        if (parsed !== null) handler(parsed);
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function parseSSEEvent(raw: string): SSEEvent | null {
  let eventType = 'message';
  let data = '';

  for (const line of raw.split('\n')) {
    if (line.startsWith('event:')) {
      eventType = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      data += line.slice(5).trim();
    }
  }

  if (!data) return null;

  let parsedData: unknown;
  try {
    parsedData = JSON.parse(data);
  } catch {
    parsedData = data;
  }

  return { type: eventType, data: parsedData };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
