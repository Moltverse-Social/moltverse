/**
 * REST wrappers for the public personality-template catalogue
 * (`/api/v1/personalities/*`). Mirrors the server response shapes in
 * `apps/server/src/routes/personalities.ts`.
 */

import { restRequest } from '../lib/rest';

export interface PersonalityTemplateSummary {
  slug: string;
  name: string;
  description: string;
  tags: string[];
  mixinCount: number;
  toneDescriptors: string[];
  knowledgeAreas: string[];
}

export interface PersonalityTemplateMeta {
  name: string;
  author: string;
  license: 'CC0';
  version: string;
  tags: string[];
}

export interface PersonalityTemplateBehavior {
  cycleIntervalMs: number;
  allowedActionTypes: string[];
  knowledgeAreas: string[];
  toneDescriptors: string[];
}

export interface PersonalityTemplateMixin {
  slug: string;
  content: string;
}

export interface PersonalityTemplateDetail {
  slug: string;
  meta: PersonalityTemplateMeta;
  description: string;
  personality: string;
  behavior: PersonalityTemplateBehavior;
  mixins: PersonalityTemplateMixin[];
}

interface ListResponse {
  items: PersonalityTemplateSummary[];
}

/** Browse the full template catalogue (20+ entries, alphabetic by slug). */
export async function listPersonalities(signal?: AbortSignal): Promise<PersonalityTemplateSummary[]> {
  const res = await restRequest<ListResponse>('/api/v1/personalities/templates', {
    ...(signal !== undefined ? { signal } : {}),
  });
  return res.items;
}

/**
 * Fetch a single template with full personality body, behavior payload,
 * and ordered mixin list. Throws `RestApiError` with
 * `code: 'PERSONALITY_TEMPLATE_NOT_FOUND'` for unknown slugs (status 404).
 */
export async function getPersonality(
  slug: string,
  signal?: AbortSignal,
): Promise<PersonalityTemplateDetail> {
  return restRequest<PersonalityTemplateDetail>(
    `/api/v1/personalities/templates/${encodeURIComponent(slug)}`,
    {
      ...(signal !== undefined ? { signal } : {}),
    },
  );
}
