import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { listTemplates, loadTemplate, _setTemplatesDirForTesting } from '../src/loader.js';

/**
 * The package ships twenty templates by default. The first block exercises
 * those — a smoke check that the catalogue stays valid as it grows. The
 * second block exercises validation paths against a fixture filesystem.
 */
describe('loader — shipped catalogue', () => {
  beforeEach(() => {
    _setTemplatesDirForTesting(null);
  });

  it('ships the full 20-template catalogue', () => {
    const summaries = listTemplates();
    expect(summaries.length).toBeGreaterThanOrEqual(20);
    const slugs = summaries.map((s) => s.slug);
    // Spot-check every shipped slug across categories.
    for (const slug of [
      'cynic-philosopher',
      'optimist-storyteller',
      'scientist-rigorous',
      'wandering-poet',
      'ironclad-engineer',
      'tender-therapist',
      'fierce-debater',
      'quiet-naturalist',
      'cosmic-mystic',
      'wry-archivist',
      'street-organizer',
      'dry-bureaucrat',
      'nostalgic-collector',
      'battle-hardened-veteran',
      'earnest-rookie',
      'midnight-coder',
      'fastidious-curator',
      'travelling-storyteller',
      'devoted-monk',
      'armchair-historian',
    ]) {
      expect(slugs).toContain(slug);
    }
    // Sorted alphabetically for stable picker rendering.
    expect([...slugs].sort()).toEqual(slugs);
  });

  it('every shipped template carries the required minimum payload', () => {
    for (const summary of listTemplates()) {
      const tpl = loadTemplate(summary.slug);
      expect(tpl).not.toBeNull();
      if (tpl === null) continue;
      expect(tpl.meta.license).toBe('CC0');
      expect(tpl.meta.name.length).toBeGreaterThan(0);
      expect(tpl.personality.length).toBeGreaterThanOrEqual(200);
      expect(Object.keys(tpl.mixins).length).toBeGreaterThanOrEqual(3);
      expect(tpl.behavior.allowedActionTypes.length).toBeGreaterThan(0);
      expect(tpl.behavior.cycleIntervalMs).toBeGreaterThanOrEqual(60_000);
    }
  });

  it('every shipped allowedActionTypes value is in the repo Prisma ActionType enum', () => {
    // Post-port invariant: TEMPLATE_ACTION_TYPES dropped COMMUNITY_POST and
    // COMMUNITY_JOIN (those are wire-only aliases in payload-schema.ts) and
    // added TOPIC_CREATE. Templates were edited in bulk to match. This guard
    // catches future template additions that ship a value the resolver
    // would silently cast into an invalid Prisma enum.
    const valid = new Set([
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
    ]);
    for (const summary of listTemplates()) {
      const tpl = loadTemplate(summary.slug);
      if (tpl === null) continue;
      for (const action of tpl.behavior.allowedActionTypes) {
        expect(valid.has(action), `${summary.slug} → invalid action ${action}`).toBe(true);
      }
    }
  });

  it('loads the cynic-philosopher template with all expected fields', () => {
    const tpl = loadTemplate('cynic-philosopher');
    expect(tpl).not.toBeNull();
    if (tpl === null) return;
    expect(tpl.meta.name).toBe('Cynic Philosopher');
    expect(tpl.meta.license).toBe('CC0');
    expect(tpl.behavior.toneDescriptors).toContain('skeptical');
    expect(Object.keys(tpl.mixins).length).toBeGreaterThanOrEqual(3);
    expect(tpl.personality.length).toBeGreaterThan(200);
  });

  it('returns null for an unknown slug', () => {
    expect(loadTemplate('nonexistent-template')).toBeNull();
  });
});

describe('loader — validation against fixture filesystem', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'moltverse-personalities-'));
    _setTemplatesDirForTesting(tmp);
  });

  afterEach(() => {
    _setTemplatesDirForTesting(null);
    rmSync(tmp, { recursive: true, force: true });
  });

  function writeTemplate(opts: {
    slug: string;
    personality?: string;
    description?: string;
    behavior?: object;
    meta?: object;
    mixins?: Record<string, string>;
  }): void {
    const dir = join(tmp, opts.slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'personality.md'), opts.personality ?? 'p'.repeat(220));
    writeFileSync(
      join(dir, 'description.md'),
      opts.description ?? 'A short but valid description that fits within bounds.',
    );
    writeFileSync(
      join(dir, 'behavior.json'),
      JSON.stringify(
        opts.behavior ?? {
          cycleIntervalMs: 300_000,
          allowedActionTypes: ['SCRAP_CREATE'],
          knowledgeAreas: [],
          toneDescriptors: [],
        },
      ),
    );
    writeFileSync(
      join(dir, 'meta.json'),
      JSON.stringify(
        opts.meta ?? {
          name: 'Fixture',
          author: 'Tester',
          license: 'CC0',
          version: '1.0.0',
          tags: [],
        },
      ),
    );
    if (opts.mixins) {
      const mxDir = join(dir, 'mixins');
      mkdirSync(mxDir, { recursive: true });
      for (const [k, v] of Object.entries(opts.mixins)) {
        writeFileSync(join(mxDir, `${k}.md`), v);
      }
    }
  }

  it('rejects a template whose personality.md is too short', () => {
    writeTemplate({ slug: 'too-short', personality: 'short' });
    expect(() => listTemplates()).toThrow(/personality\.md.*minimum/);
  });

  it('rejects a template whose meta.json fails Zod (bad license)', () => {
    writeTemplate({
      slug: 'bad-license',
      meta: {
        name: 'Bad',
        author: 'X',
        license: 'MIT',
        version: '1.0.0',
        tags: [],
      },
    });
    expect(() => listTemplates()).toThrow();
  });

  it('rejects a template whose behavior.json has an unknown action type', () => {
    writeTemplate({
      slug: 'bad-action',
      behavior: {
        cycleIntervalMs: 300_000,
        allowedActionTypes: ['UNKNOWN_ACTION'],
        knowledgeAreas: [],
        toneDescriptors: [],
      },
    });
    expect(() => listTemplates()).toThrow();
  });

  it('rejects a template whose behavior.json carries the legacy COMMUNITY_* alias', () => {
    // Sanity guard: the wire-format aliases community.post / community.join
    // resolve to TOPIC_CREATE / CLUSTER_JOIN at the action-dispatcher level.
    // Templates must never ship the alias names directly — those would
    // silently cast to an invalid Prisma enum.
    writeTemplate({
      slug: 'legacy-community',
      behavior: {
        cycleIntervalMs: 300_000,
        allowedActionTypes: ['COMMUNITY_POST'],
        knowledgeAreas: [],
        toneDescriptors: [],
      },
    });
    expect(() => listTemplates()).toThrow();
  });

  it('rejects a template whose slug violates the regex', () => {
    writeTemplate({ slug: 'BadSlug' });
    expect(() => listTemplates()).toThrow(/violates regex/);
  });

  it('loads a fixture template with mixins and exposes the right summary', () => {
    writeTemplate({
      slug: 'fixture-ok',
      mixins: { 'twist-a': 't'.repeat(70), 'twist-b': 'u'.repeat(70) },
    });
    const summaries = listTemplates();
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.slug).toBe('fixture-ok');
    expect(summaries[0]?.mixinCount).toBe(2);
  });
});
