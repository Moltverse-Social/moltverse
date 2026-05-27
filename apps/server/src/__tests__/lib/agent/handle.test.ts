/**
 * Tests for src/lib/agent/handle.ts — pure helpers.
 *
 * checkHandleAvailability (DB-bound) is exercised in integration
 * tests; here we cover the format, reserved-list, normalize, and
 * suggestion logic that runs in-process.
 */

import { describe, expect, it } from 'vitest';

import {
  buildSuggestions,
  isValidHandleFormat,
  normalizeHandle,
} from '../../../lib/agent/handle.js';
import { isReservedHandle, RESERVED_HANDLES } from '../../../lib/agent/reserved-handles.js';

describe('normalizeHandle', () => {
  it('lowercases and trims', () => {
    expect(normalizeHandle('  Rune  ')).toBe('rune');
    expect(normalizeHandle('AGENT_42')).toBe('agent_42');
  });

  it('is idempotent', () => {
    const once = normalizeHandle('Foo-Bar');
    expect(normalizeHandle(once)).toBe(once);
  });
});

describe('isValidHandleFormat', () => {
  it('accepts a typical lowercase handle', () => {
    expect(isValidHandleFormat('rune')).toBe(true);
    expect(isValidHandleFormat('agent_42')).toBe(true);
    expect(isValidHandleFormat('cool-name')).toBe(true);
  });

  it('rejects handles starting with a digit, dash, or underscore', () => {
    expect(isValidHandleFormat('1rune')).toBe(false);
    expect(isValidHandleFormat('-rune')).toBe(false);
    expect(isValidHandleFormat('_rune')).toBe(false);
  });

  it('rejects handles shorter than 3 chars or longer than 30', () => {
    expect(isValidHandleFormat('ab')).toBe(false);
    expect(isValidHandleFormat('a'.repeat(31))).toBe(false);
  });

  it('accepts the boundary lengths', () => {
    expect(isValidHandleFormat('abc')).toBe(true);
    expect(isValidHandleFormat('a' + 'b'.repeat(29))).toBe(true);
  });

  it('rejects uppercase characters', () => {
    expect(isValidHandleFormat('Rune')).toBe(false);
  });

  it('rejects forbidden punctuation', () => {
    expect(isValidHandleFormat('rune.x')).toBe(false);
    expect(isValidHandleFormat('rune@x')).toBe(false);
    expect(isValidHandleFormat('rune x')).toBe(false);
  });
});

describe('isReservedHandle', () => {
  it('matches entries in the canonical list', () => {
    for (const reserved of ['admin', 'moltverse', 'satoshi', 'api']) {
      expect(isReservedHandle(reserved)).toBe(true);
    }
  });

  it('does not match handles outside the list', () => {
    expect(isReservedHandle('rune')).toBe(false);
    expect(isReservedHandle('zephyr-the-merciful')).toBe(false);
  });

  it('every reserved entry is itself a valid handle format', () => {
    for (const reserved of RESERVED_HANDLES) {
      expect(isValidHandleFormat(reserved)).toBe(true);
    }
  });
});

describe('buildSuggestions', () => {
  it('produces numeric-suffix variants for a short root', () => {
    const suggestions = buildSuggestions('rune', 3);
    expect(suggestions).toEqual(['rune1', 'rune2', 'rune3']);
  });

  it('caps at the requested limit', () => {
    expect(buildSuggestions('rune', 5).length).toBe(5);
    expect(buildSuggestions('rune', 1).length).toBe(1);
  });

  it('falls back to themed prefixes after exhausting numerics within the limit', () => {
    const suggestions = buildSuggestions('rune', 12);
    expect(suggestions).toContain('the-rune');
    expect(suggestions).toContain('rune-bot');
  });

  it('does not include the original handle as a suggestion', () => {
    expect(buildSuggestions('rune', 9)).not.toContain('rune');
  });

  it('always returns format-valid suggestions', () => {
    for (const s of buildSuggestions('rune', 12)) {
      expect(isValidHandleFormat(s)).toBe(true);
    }
  });

  it('truncates very long roots so the suffix fits in 30 chars', () => {
    const long = 'a' + 'b'.repeat(28);
    const suggestions = buildSuggestions(long, 3);
    for (const s of suggestions) {
      expect(s.length).toBeLessThanOrEqual(30);
      expect(isValidHandleFormat(s)).toBe(true);
    }
  });
});
