import { describe, expect, it } from 'vitest';

import {
  generateInviteCode,
  isCanonicalInviteCode,
  normalizeInviteCode,
} from '../../../lib/invites/code.js';

describe('generateInviteCode', () => {
  it('matches the canonical MOLT-XXXX-XXXX-XXXX shape', () => {
    for (let i = 0; i < 32; i += 1) {
      const code = generateInviteCode();
      expect(isCanonicalInviteCode(code)).toBe(true);
    }
  });

  it('produces different codes across calls (60-bit entropy)', () => {
    const set = new Set<string>();
    for (let i = 0; i < 100; i += 1) {
      set.add(generateInviteCode());
    }
    expect(set.size).toBe(100);
  });

  it('never includes the ambiguous Crockford characters I, L, O, U', () => {
    for (let i = 0; i < 64; i += 1) {
      const body = generateInviteCode().replace('MOLT-', '').replace(/-/g, '');
      expect(body).not.toMatch(/[ILOU]/);
    }
  });
});

describe('normalizeInviteCode', () => {
  const SAMPLE = 'MOLT-2X4P-9JNR-7K3M';

  it('round-trips a canonical input', () => {
    expect(normalizeInviteCode(SAMPLE)).toBe(SAMPLE);
  });

  it('accepts lowercase input', () => {
    expect(normalizeInviteCode(SAMPLE.toLowerCase())).toBe(SAMPLE);
  });

  it('accepts input without the MOLT- prefix', () => {
    expect(normalizeInviteCode('2X4P-9JNR-7K3M')).toBe(SAMPLE);
  });

  it('accepts input without any dashes', () => {
    expect(normalizeInviteCode('MOLT2X4P9JNR7K3M')).toBe(SAMPLE);
  });

  it('strips surrounding whitespace', () => {
    expect(normalizeInviteCode(`  ${SAMPLE}\n`)).toBe(SAMPLE);
  });

  it('throws on too-short input', () => {
    expect(() => normalizeInviteCode('MOLT-AB')).toThrow(/characters/);
  });

  it('throws on disallowed characters (I, L, O, U)', () => {
    expect(() => normalizeInviteCode('MOLT-IIII-9JNR-7K3M')).toThrow(/invalid character/);
  });
});

describe('isCanonicalInviteCode', () => {
  it('rejects malformed inputs', () => {
    expect(isCanonicalInviteCode('hello')).toBe(false);
    expect(isCanonicalInviteCode('MOLT-2X4P-9JNR')).toBe(false); // missing third group
    expect(isCanonicalInviteCode('molt-2x4p-9jnr-7k3m')).toBe(false); // lowercase
    expect(isCanonicalInviteCode('MOLT-IIII-9JNR-7K3M')).toBe(false); // ambiguous chars
  });
});
