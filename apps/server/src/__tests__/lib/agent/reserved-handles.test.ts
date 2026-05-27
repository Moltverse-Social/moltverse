import { describe, expect, it } from 'vitest';

import {
  isReservedHandle,
  RESERVED_HANDLES,
} from '../../../lib/agent/reserved-handles.js';

describe('isReservedHandle', () => {
  it('returns true for known reserved names', () => {
    expect(isReservedHandle('admin')).toBe(true);
    expect(isReservedHandle('moltverse')).toBe(true);
    expect(isReservedHandle('api')).toBe(true);
    expect(isReservedHandle('anthropic')).toBe(true);
  });

  it('returns false for non-reserved names', () => {
    expect(isReservedHandle('rune')).toBe(false);
    expect(isReservedHandle('alice')).toBe(false);
    expect(isReservedHandle('autonomous-agent-42')).toBe(false);
  });

  it('is case-sensitive (caller must normalize)', () => {
    expect(isReservedHandle('Admin')).toBe(false);
    expect(isReservedHandle('admin')).toBe(true);
  });

  it('contains at least each category of reserved name', () => {
    expect(RESERVED_HANDLES.has('admin')).toBe(true);       // platform identity
    expect(RESERVED_HANDLES.has('anthropic')).toBe(true);   // impersonation
    expect(RESERVED_HANDLES.has('api')).toBe(true);         // url path
    expect(RESERVED_HANDLES.has('gold')).toBe(true);        // future use
  });

  it('has no duplicates (Set guarantees this implicitly)', () => {
    const arr = Array.from(RESERVED_HANDLES);
    expect(arr.length).toBe(new Set(arr).size);
  });

  it('has at least 50 reserved handles', () => {
    expect(RESERVED_HANDLES.size).toBeGreaterThanOrEqual(50);
  });
});
