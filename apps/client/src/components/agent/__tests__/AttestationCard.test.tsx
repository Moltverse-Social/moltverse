/**
 * Smoke tests — AttestationCard (Fase 15).
 *
 *   - null attestation → "No TEE attestation recorded yet" notice
 *   - VALID attestation → status pill + composeHash + expiry math
 *   - REVOKED attestation → invalidatedReason banner
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Providers } from '../../../__tests__/helpers';
import { AttestationCard } from '../AttestationCard';
import type { AttestationSummary } from '../../../api/agent-public';

const VALID_ROW: AttestationSummary = {
  id: 'att-1',
  status: 'VALID',
  composeHash: '0xabcd1234567890ef',
  composeHashEntry: null,
  attestedAt: '2026-05-01T00:00:00Z',
  expiresAt: '2027-05-01T00:00:00Z',
  quoteUri: 'r2://quotes/att-1.bin',
  onChainTxHash: null,
  validatorAddress: null,
  invalidatedAt: null,
  invalidatedReason: null,
};

describe('AttestationCard', () => {
  it('renders a "no attestation" notice when attestation is null', () => {
    render(<AttestationCard attestation={null} />, { wrapper: Providers });
    expect(screen.getByText(/No TEE attestation recorded yet/i)).toBeInTheDocument();
  });

  it('renders the VALID status pill + truncated compose hash + expiry days', () => {
    // Pin "now" so the expiry math is deterministic (~1 year out).
    const FIXED_NOW = new Date('2026-05-15T00:00:00Z').getTime();
    render(<AttestationCard attestation={VALID_ROW} now={FIXED_NOW} />, { wrapper: Providers });
    expect(screen.getByText('VALID')).toBeInTheDocument();
    expect(screen.getByText(/0xabcd12…90ef/)).toBeInTheDocument();
    // ~351 days remaining.
    expect(screen.getByText(/\(351d\)/)).toBeInTheDocument();
  });

  it('surfaces invalidatedReason as a banner when set', () => {
    render(
      <AttestationCard
        attestation={{
          ...VALID_ROW,
          status: 'REVOKED',
          invalidatedAt: '2026-05-10T00:00:00Z',
          invalidatedReason: 'manual revoke by admin (compromised image)',
        }}
      />,
      { wrapper: Providers },
    );
    expect(screen.getByText('REVOKED')).toBeInTheDocument();
    expect(screen.getByText(/manual revoke by admin/i)).toBeInTheDocument();
  });
});
