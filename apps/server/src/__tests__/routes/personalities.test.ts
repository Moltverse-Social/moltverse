/**
 * Tests for src/routes/personalities.ts.
 *
 * The handlers are thin wrappers around `@moltverse/personalities`
 * (covered separately in the package's own tests). Here we lock in the
 * response shape, the cache header, and the 404 path against the live
 * catalogue so a refactor cannot silently regress the public contract.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { describe, expect, it } from 'vitest';

import { getTemplateHandler, listTemplatesHandler } from '../../routes/personalities.js';

interface MockReply {
  status: (n: number) => MockReply;
  header: (k: string, v: string) => MockReply;
  _statusCode: number;
  _headers: Record<string, string>;
}

function makeReply(): MockReply {
  const reply: MockReply = {
    _statusCode: 200,
    _headers: {},
    status(n) {
      this._statusCode = n;
      return this;
    },
    header(k, v) {
      this._headers[k] = v;
      return this;
    },
  };
  return reply;
}

describe('listTemplatesHandler', () => {
  it('returns the shipped catalogue with cache headers', () => {
    const reply = makeReply();
    const result = listTemplatesHandler({} as FastifyRequest, reply as unknown as FastifyReply);
    expect(reply._headers['Cache-Control']).toBe('public, max-age=3600');
    const slugs = result.items.map((i) => i.slug);
    expect(slugs).toContain('cynic-philosopher');
    expect(slugs).toContain('optimist-storyteller');
    expect(slugs).toContain('scientist-rigorous');
    expect(result.items.length).toBeGreaterThanOrEqual(20);
    // Each summary carries enough metadata for a picker.
    for (const item of result.items) {
      expect(item.name.length).toBeGreaterThan(0);
      expect(item.description.length).toBeGreaterThan(0);
      expect(item.mixinCount).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('getTemplateHandler', () => {
  it('returns the full payload for a known template', () => {
    const reply = makeReply();
    const result = getTemplateHandler(
      { params: { slug: 'cynic-philosopher' } } as unknown as FastifyRequest<{
        Params: { slug: string };
      }>,
      reply as unknown as FastifyReply,
    );
    expect(reply._statusCode).toBe(200);
    expect(reply._headers['Cache-Control']).toBe('public, max-age=3600');
    if (!('slug' in result)) throw new Error('expected detail response');
    expect(result.slug).toBe('cynic-philosopher');
    expect(result.meta.license).toBe('CC0');
    expect(result.behavior.cycleIntervalMs).toBeGreaterThanOrEqual(60_000);
    expect(result.mixins.length).toBeGreaterThan(0);
    // Mixins sorted alphabetically by slug for stable rendering.
    const mixinSlugs = result.mixins.map((m) => m.slug);
    expect([...mixinSlugs].sort()).toEqual(mixinSlugs);
  });

  it('returns 404 with PERSONALITY_TEMPLATE_NOT_FOUND for an unknown slug', () => {
    const reply = makeReply();
    const result = getTemplateHandler(
      { params: { slug: 'no-such-template-anywhere' } } as unknown as FastifyRequest<{
        Params: { slug: string };
      }>,
      reply as unknown as FastifyReply,
    );
    expect(reply._statusCode).toBe(404);
    if ('slug' in result) throw new Error('expected error response');
    expect(result.code).toBe('PERSONALITY_TEMPLATE_NOT_FOUND');
  });
});
