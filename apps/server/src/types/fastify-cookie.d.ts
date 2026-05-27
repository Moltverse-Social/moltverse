/**
 * Type augmentation for @fastify/cookie
 *
 * Needed because npm workspace hoisting places @fastify/cookie at the
 * monorepo root while fastify lives in apps/server/node_modules.
 * The original augmentation in @fastify/cookie can't resolve 'fastify'
 * from the root, so we re-declare it here where resolution works.
 */

import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    cookies: { [cookieName: string]: string | undefined };
  }

  interface FastifyReply {
    setCookie(
      name: string,
      value: string,
      options?: import('@fastify/cookie').CookieSerializeOptions
    ): FastifyReply;

    clearCookie(
      name: string,
      options?: import('@fastify/cookie').CookieSerializeOptions
    ): FastifyReply;
  }
}
