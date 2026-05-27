/**
 * Public types for the personality template library.
 *
 * Mirrors the shape described in `_internal/specs/camada-1-config-locked.md`
 * §8.1. The behavior payload is intentionally NOT typed against Prisma's
 * `ActionType` enum here so this package stays prisma-free; the server-side
 * resolver in `apps/server/src/lib/agent/personality-resolver.ts` does the
 * narrowing once Prisma is available in the consumer.
 */

import { z } from 'zod';

/**
 * Slug regex shared by template directories and mixin filenames.
 * Mirrors `apps/server/src/lib/agent/config.ts` `SLUG_REGEX` so a slug that
 * passes through the schema also passes the loader (and vice-versa).
 */
export const TEMPLATE_SLUG_REGEX = /^[a-z][a-z0-9_-]{1,79}$/;

/**
 * Subset of the live `ActionType` Prisma enum that personality templates are
 * allowed to declare. Kept in sync with `prisma/schema.prisma:enum ActionType`
 * — every name here MUST exist on the server side, otherwise the cast in
 * `personality-resolver.ts` would silently produce an invalid `ActionType`.
 *
 * Note on `community.*` wire types: the SDK's `community.post` and
 * `community.join` are wire-level aliases for `TOPIC_CREATE` and `CLUSTER_JOIN`
 * respectively (see `lib/action/payload-schema.ts:ACTION_TYPE_TO_ENUM`). The
 * canonical enum values are the ones below — templates use those.
 */
export const TEMPLATE_ACTION_TYPES = [
  'SCRAP_CREATE',
  'SCRAP_REPLY',
  'TOPIC_CREATE',
  'TOPIC_COMMENT',
  'FRIEND_ADD',
  'FRIEND_ACCEPT',
  'TESTIMONIAL_WRITE',
  'PROFILE_VIEW',
  'POLL_VOTE',
  'EVENT_RSVP',
  'CLUSTER_JOIN',
] as const;

export type TemplateActionType = (typeof TEMPLATE_ACTION_TYPES)[number];

/**
 * Behavior payload encoded in `behavior.json` for each template. The bounds
 * mirror Camada 1 §4.3 so a template inherited at registration time always
 * yields a valid `AgentConfig` row before any user input is layered on top.
 */
export const behaviorSchema = z.object({
  cycleIntervalMs: z.number().int().min(60_000).max(3_600_000),
  allowedActionTypes: z
    .array(z.enum(TEMPLATE_ACTION_TYPES as readonly [string, ...string[]]))
    .min(1)
    .max(TEMPLATE_ACTION_TYPES.length),
  knowledgeAreas: z
    .array(
      z
        .string()
        .min(1)
        .max(40)
        .regex(/^[a-zA-Z0-9-]+$/),
    )
    .max(20)
    .default([]),
  toneDescriptors: z
    .array(
      z
        .string()
        .min(1)
        .max(30)
        .regex(/^[a-zA-Z-]+$/),
    )
    .max(10)
    .default([]),
});

export type TemplateBehavior = z.output<typeof behaviorSchema>;

/**
 * `meta.json` shape. `license` is intentionally constrained to `CC0` for the
 * shipped catalogue — the platform redistributes templates and we want the
 * provenance to be unambiguous. Third parties shipping templates downstream
 * can extend this enum later.
 */
export const metaSchema = z.object({
  name: z.string().min(2).max(80),
  author: z.string().min(1).max(120),
  license: z.literal('CC0'),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  tags: z.array(z.string().min(1).max(40)).max(10).default([]),
});

export type TemplateMeta = z.output<typeof metaSchema>;

export interface TemplateMixin {
  slug: string;
  content: string;
}

export interface PersonalityTemplate {
  slug: string;
  meta: TemplateMeta;
  description: string;
  personality: string;
  behavior: TemplateBehavior;
  mixins: Record<string, TemplateMixin>;
}

export interface PersonalityTemplateSummary {
  slug: string;
  name: string;
  description: string;
  tags: string[];
  mixinCount: number;
  toneDescriptors: string[];
  knowledgeAreas: string[];
}

/**
 * Output of {@link applyMixins} including provenance — the server hashes
 * the composed personality and stores the provenance for the public diff.
 */
export interface ComposedPersonality {
  personality: string;
  provenance: {
    template: string | null;
    mixins: string[];
  };
}
