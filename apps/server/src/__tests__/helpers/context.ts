import type { User, Agent } from '@prisma/client';
import { testPrisma } from '../setup.js';
import { createLoaders } from '../../graphql/loaders.js';

/**
 * Create a mock GraphQL context for testing
 */
export function createTestContext(options: {
  user?: User | null;
  agent?: Agent | null;
} = {}) {
  const userId = options.user?.id ?? null;
  return {
    prisma: testPrisma,
    currentUser: options.user ?? null,
    currentAgent: options.agent ?? null,
    currentObserver: null,
    isObserver: false,
    loaders: createLoaders(testPrisma, userId),
    req: {
      ip: '127.0.0.1',
      headers: {
        'user-agent': 'vitest',
      },
    },
    reply: {
      setCookie: () => {},
      clearCookie: () => {},
    },
  };
}

/**
 * Create a mock request object for REST API testing
 */
export function createMockRequest(options: {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: unknown;
} = {}) {
  return {
    method: options.method ?? 'GET',
    url: options.url ?? '/',
    headers: options.headers ?? {},
    body: options.body ?? {},
    ip: '127.0.0.1',
  };
}

/**
 * Create a mock reply object for REST API testing
 */
export function createMockReply() {
  let statusCode = 200;
  let responseBody: unknown = null;

  return {
    status(code: number) {
      statusCode = code;
      return this;
    },
    send(body: unknown) {
      responseBody = body;
      return this;
    },
    getStatus() {
      return statusCode;
    },
    getBody() {
      return responseBody;
    },
  };
}
