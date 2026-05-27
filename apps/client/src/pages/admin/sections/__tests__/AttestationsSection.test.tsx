/**
 * Smoke test — AttestationsSection (Fase 12).
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Providers } from '../../../../__tests__/helpers';
import { AttestationsSection } from '../AttestationsSection';

describe('AttestationsSection', () => {
  it('renders the invalidate form with required fields', () => {
    render(<AttestationsSection />, { wrapper: Providers });
    expect(screen.getByText(/revoke tee attestation/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/attestation id/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/reason \(required/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^revoke$/i })).toBeInTheDocument();
  });
});
