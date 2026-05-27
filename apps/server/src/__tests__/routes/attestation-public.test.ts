/**
 * Tests for src/routes/agents-attestation-public.ts — pure helpers.
 */

import { describe, expect, it } from 'vitest';

import {
  parseAttestationHistoryLimit,
  serializeAttestation,
} from '../../routes/agents-attestation-public.js';

const NOW = new Date('2026-05-12T12:00:00Z');

describe('parseAttestationHistoryLimit', () => {
  it('defaults to 20 when absent or invalid', () => {
    expect(parseAttestationHistoryLimit(undefined)).toBe(20);
    expect(parseAttestationHistoryLimit('zzz')).toBe(20);
    expect(parseAttestationHistoryLimit('0')).toBe(20);
    expect(parseAttestationHistoryLimit('-1')).toBe(20);
  });

  it('accepts values 1..20', () => {
    expect(parseAttestationHistoryLimit('1')).toBe(1);
    expect(parseAttestationHistoryLimit('20')).toBe(20);
  });

  it('clamps anything above the cap', () => {
    expect(parseAttestationHistoryLimit('500')).toBe(20);
  });
});

describe('serializeAttestation', () => {
  it('produces the documented public response shape', () => {
    const out = serializeAttestation({
      id: 'att_1',
      agentId: 'agent_1',
      quoteHash: 'sha256:abc',
      quoteUri: 'inline:sha256:abc',
      status: 'VALID',
      verificationDetail: { tcbStatus: 'OK' },
      composeHash: '0x' + 'a'.repeat(64),
      composeHashEntry: { version: '1.0.0' },
      reportDataHex: 'aa'.repeat(64),
      rtmr3Hex: 'bb'.repeat(48),
      quoteVersion: 4,
      attestedAt: NOW,
      expiresAt: new Date(NOW.getTime() + 90 * 86_400_000),
      renewalReminderSentAt: null,
      invalidatedAt: null,
      invalidatedReason: null,
      onChainTxHash: null,
      onChainSubmittedAt: null,
      validatorAddress: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(out.id).toBe('att_1');
    expect(out.status).toBe('VALID');
    expect(out.composeHash).toBe('0x' + 'a'.repeat(64));
    expect(out.attestedAt).toBe(NOW.toISOString());
    expect(out.invalidatedAt).toBeNull();
  });

  it('surfaces invalidatedAt + reason when present', () => {
    const out = serializeAttestation({
      id: 'att_2',
      agentId: 'agent_1',
      quoteHash: 'sha256:zzz',
      quoteUri: 'inline:sha256:zzz',
      status: 'INVALID',
      verificationDetail: null,
      composeHash: '',
      composeHashEntry: null,
      reportDataHex: '',
      rtmr3Hex: '',
      quoteVersion: 0,
      attestedAt: NOW,
      expiresAt: NOW,
      renewalReminderSentAt: null,
      invalidatedAt: NOW,
      invalidatedReason: 'TCB out of date',
      onChainTxHash: null,
      onChainSubmittedAt: null,
      validatorAddress: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(out.status).toBe('INVALID');
    expect(out.invalidatedAt).toBe(NOW.toISOString());
    expect(out.invalidatedReason).toBe('TCB out of date');
  });
});
