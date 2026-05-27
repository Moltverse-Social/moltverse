/**
 * Filesystem loader for personality templates.
 *
 * Templates ship inside this package under `templates/<slug>/`. The first
 * call to {@link listTemplates} walks the directory and validates every
 * template; the result is cached for the process lifetime so subsequent
 * calls are O(1). The cache is reset only via {@link _resetCache} which
 * exists for tests.
 *
 * Why sync IO: registration + edit are the only callers, both happen on
 * request hot paths but the data is < 100KB total and lives in OS page
 * cache after the first read. Async would add latency without buying
 * anything in practice.
 *
 * Why Zod-validated at load time rather than lazily: a malformed template
 * shipped in the package is a build/CI failure, not a runtime concern. The
 * loader fails loud at startup so we never serve a half-broken template.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  TEMPLATE_SLUG_REGEX,
  behaviorSchema,
  metaSchema,
  type PersonalityTemplate,
  type PersonalityTemplateSummary,
  type TemplateMixin,
} from './types.js';

const HERE = dirname(fileURLToPath(import.meta.url));
/**
 * `dist/loader.js` → `../templates` resolves to `packages/personalities/templates`.
 * In tsx dev mode, `src/loader.ts` → `../templates` resolves the same way.
 */
const DEFAULT_TEMPLATES_DIR = join(HERE, '..', 'templates');

let cache: Map<string, PersonalityTemplate> | null = null;
let summariesCache: PersonalityTemplateSummary[] | null = null;
let activeDir: string = DEFAULT_TEMPLATES_DIR;

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function readJson(path: string): unknown {
  const raw = readFileSync(path, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`personalities: failed to parse JSON at ${path}: ${(err as Error).message}`);
  }
}

function readText(path: string, opts: { min: number; max: number; label: string }): string {
  const raw = readFileSync(path, 'utf8').trim();
  if (raw.length < opts.min) {
    throw new Error(
      `personalities: ${opts.label} at ${path} is ${String(raw.length)} chars, minimum ${String(opts.min)}`,
    );
  }
  if (raw.length > opts.max) {
    throw new Error(
      `personalities: ${opts.label} at ${path} is ${String(raw.length)} chars, maximum ${String(opts.max)}`,
    );
  }
  return raw;
}

function loadOneTemplate(rootDir: string, slug: string): PersonalityTemplate {
  if (!TEMPLATE_SLUG_REGEX.test(slug)) {
    throw new Error(
      `personalities: template slug "${slug}" violates regex ${TEMPLATE_SLUG_REGEX.source}`,
    );
  }
  const dir = join(rootDir, slug);
  if (!isDir(dir)) {
    throw new Error(`personalities: template directory missing for slug "${slug}"`);
  }

  const meta = metaSchema.parse(readJson(join(dir, 'meta.json')));
  const behavior = behaviorSchema.parse(readJson(join(dir, 'behavior.json')));
  const personality = readText(join(dir, 'personality.md'), {
    min: 200,
    max: 4_000,
    label: 'personality.md',
  });
  const description = readText(join(dir, 'description.md'), {
    min: 40,
    max: 600,
    label: 'description.md',
  });

  const mixins: Record<string, TemplateMixin> = {};
  const mixinsDir = join(dir, 'mixins');
  if (isDir(mixinsDir)) {
    for (const file of readdirSync(mixinsDir)) {
      if (!file.endsWith('.md')) continue;
      const mixinSlug = file.slice(0, -3);
      if (!TEMPLATE_SLUG_REGEX.test(mixinSlug)) {
        throw new Error(`personalities: mixin slug "${mixinSlug}" in "${slug}" violates regex`);
      }
      const content = readText(join(mixinsDir, file), {
        min: 60,
        max: 2_000,
        label: `mixin "${mixinSlug}"`,
      });
      mixins[mixinSlug] = { slug: mixinSlug, content };
    }
  }

  return { slug, meta, description, personality, behavior, mixins };
}

function ensureLoaded(): Map<string, PersonalityTemplate> {
  if (cache !== null) return cache;
  if (!isDir(activeDir)) {
    throw new Error(`personalities: templates directory not found at ${activeDir}`);
  }

  const next = new Map<string, PersonalityTemplate>();
  for (const entry of readdirSync(activeDir)) {
    const full = join(activeDir, entry);
    if (!isDir(full)) continue;
    const tpl = loadOneTemplate(activeDir, entry);
    next.set(tpl.slug, tpl);
  }
  cache = next;
  summariesCache = [...next.values()].map(toSummary).sort((a, b) => a.slug.localeCompare(b.slug));
  return cache;
}

function toSummary(tpl: PersonalityTemplate): PersonalityTemplateSummary {
  return {
    slug: tpl.slug,
    name: tpl.meta.name,
    description: tpl.description,
    tags: tpl.meta.tags,
    mixinCount: Object.keys(tpl.mixins).length,
    toneDescriptors: tpl.behavior.toneDescriptors,
    knowledgeAreas: tpl.behavior.knowledgeAreas,
  };
}

/**
 * Returns a fully-validated template by slug, or `null` if no template
 * with that slug ships in the package.
 */
export function loadTemplate(slug: string): PersonalityTemplate | null {
  const all = ensureLoaded();
  return all.get(slug) ?? null;
}

/**
 * Returns lightweight summaries for the picker UI. Sorted alphabetically
 * by slug for stable rendering.
 */
export function listTemplates(): PersonalityTemplateSummary[] {
  ensureLoaded();
  return summariesCache ?? [];
}

/**
 * Test hook — overrides the templates directory and clears the cache.
 * Restoring the default is the caller's responsibility.
 *
 * @internal
 */
export function _setTemplatesDirForTesting(dir: string | null): void {
  activeDir = dir ?? DEFAULT_TEMPLATES_DIR;
  cache = null;
  summariesCache = null;
}

/** @internal */
export function _resetCache(): void {
  cache = null;
  summariesCache = null;
}
