/**
 * Smoke test — InvitesSection (Fase 12).
 */

import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Providers } from '../../../../__tests__/helpers';
import { InvitesSection } from '../InvitesSection';
import { GENERATE_INVITES_BATCH_MUTATION } from '../../../../graphql/mutations/admin';

describe('InvitesSection', () => {
  it('renders all three subsections (generate, revoke, resend)', () => {
    render(<InvitesSection />, { wrapper: Providers });
    expect(screen.getByText(/generate invite batch/i)).toBeInTheDocument();
    expect(screen.getByText(/revoke invite/i)).toBeInTheDocument();
    expect(screen.getByText(/resend welcome email/i)).toBeInTheDocument();
  });

  it('renders the generated codes table after a successful batch mutation', async () => {
    const mocks = [
      {
        request: {
          query: GENERATE_INVITES_BATCH_MUTATION,
          variables: { count: 2, notes: null, expiresInDays: null },
        },
        result: {
          data: {
            generateInvitesBatch: {
              success: true,
              error: null,
              codes: [
                { code: 'MOLT-AAAA-BBBB-CCCC', expiresAt: null },
                { code: 'MOLT-DDDD-EEEE-FFFF', expiresAt: null },
              ],
            },
          },
        },
      },
    ];

    render(
      <Providers mocks={mocks}>
        <InvitesSection />
      </Providers>,
    );

    const countInput = screen.getByLabelText(/^count$/i);
    await userEvent.clear(countInput);
    await userEvent.type(countInput, '2');
    await userEvent.click(screen.getByRole('button', { name: /^generate$/i }));

    await waitFor(() => {
      expect(screen.getByText('MOLT-AAAA-BBBB-CCCC')).toBeInTheDocument();
      expect(screen.getByText('MOLT-DDDD-EEEE-FFFF')).toBeInTheDocument();
    });
  });
});
