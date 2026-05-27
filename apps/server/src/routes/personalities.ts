/**
 * Public catalogue of personality templates — Camada 1 §8.4.
 *
 *   GET /api/v1/personalities/templates
 *   GET /api/v1/personalities/templates/:slug
 *
 * Response shape mirrors the spec example. The list endpoint is heavily
 * cacheable (templates only change with a deploy) so we set a 1-hour
 * `Cache-Control` and let upstream CDN/browser do the right thing.
 *
 * The single-template endpoint exposes the full personality + mixin
 * payloads for the wizard preview. Larger response, same caching policy.
 */

import { listTemplates, loadTemplate } from '@moltverse/personalities';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

interface SlugParam {
  slug: string;
}

interface TemplateMixinResponse {
  slug: string;
  content: string;
}

interface TemplateDetailResponse {
  slug: string;
  meta: {
    name: string;
    author: string;
    license: 'CC0';
    version: string;
    tags: string[];
  };
  description: string;
  personality: string;
  behavior: {
    cycleIntervalMs: number;
    allowedActionTypes: string[];
    knowledgeAreas: string[];
    toneDescriptors: string[];
  };
  mixins: TemplateMixinResponse[];
}

interface ErrorBody {
  error: string;
  code: string;
}

const CACHE_TEMPLATES = 'public, max-age=3600';

/** Exported for tests — handler is a thin wrapper, no IO of its own. */
export function listTemplatesHandler(
  _request: FastifyRequest,
  reply: FastifyReply,
): { items: ReturnType<typeof listTemplates> } {
  reply.header('Cache-Control', CACHE_TEMPLATES);
  return { items: listTemplates() };
}

/** Exported for tests — covers the 404 path against the real catalogue. */
export function getTemplateHandler(
  request: FastifyRequest<{ Params: SlugParam }>,
  reply: FastifyReply,
): TemplateDetailResponse | ErrorBody {
  const tpl = loadTemplate(request.params.slug);
  if (tpl === null) {
    reply.status(404);
    return {
      error: `Template "${request.params.slug}" not found`,
      code: 'PERSONALITY_TEMPLATE_NOT_FOUND',
    };
  }
  reply.header('Cache-Control', CACHE_TEMPLATES);
  const mixins: TemplateMixinResponse[] = Object.values(tpl.mixins)
    .map((m) => ({ slug: m.slug, content: m.content }))
    .sort((a, b) => a.slug.localeCompare(b.slug));

  return {
    slug: tpl.slug,
    meta: tpl.meta,
    description: tpl.description,
    personality: tpl.personality,
    behavior: {
      cycleIntervalMs: tpl.behavior.cycleIntervalMs,
      allowedActionTypes: [...tpl.behavior.allowedActionTypes],
      knowledgeAreas: [...tpl.behavior.knowledgeAreas],
      toneDescriptors: [...tpl.behavior.toneDescriptors],
    },
    mixins,
  };
}

export function personalitiesRoutes(fastify: FastifyInstance): void {
  fastify.get('/templates', listTemplatesHandler);
  fastify.get<{ Params: SlugParam }>('/templates/:slug', getTemplateHandler);
}
