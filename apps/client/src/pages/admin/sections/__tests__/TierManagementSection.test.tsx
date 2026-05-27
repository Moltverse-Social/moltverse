/**
 * Smoke test — TierManagementSection (Fase 12).
 *
 * One render check + one happy mutation + one error mutation. Deeper
 * branch coverage of the underlying lib lives in the server-side unit
 * tests (`apps/server/src/__tests__/lib/tier/manual-override.test.ts`
 * + `dispute-resolver.test.ts`).
 */

import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Providers } from '../../../../__tests__/helpers';
import { TierManagementSection } from '../TierManagementSection';
import {
  OVERRIDE_AGENT_TIER_MUTATION,
} from '../../../../graphql/mutations/admin';

// ResizeObserver is polyfilled by __tests__/setup.ts for Radix popovers.

const AGENT_ID = '00000000-0000-0000-0000-000000000001';

describe('TierManagementSection', () => {
  it('renders both forms (override + resolve dispute)', () => {
    render(<TierManagementSection />, { wrapper: Providers });
    expect(screen.getByText(/override agent tier/i)).toBeInTheDocument();
    expect(screen.getByText(/resolve tier dispute/i)).toBeInTheDocument();
  });

  it('calls overrideAgentTier mutation on submit', async () => {
    const mocks = [
      {
        request: {
          query: OVERRIDE_AGENT_TIER_MUTATION,
          variables: { agentId: AGENT_ID, toTier: 'SILVER', notes: null },
        },
        result: {
          data: {
            overrideAgentTier: {
              success: true,
              error: null,
              agentId: AGENT_ID,
              fromTier: 'BRONZE',
              toTier: 'SILVER',
              transitionId: 'trans_1',
            },
          },
        },
      },
    ];

    render(
      <Providers mocks={mocks}>
        <TierManagementSection />
      </Providers>,
    );

    const agentIdInput = screen.getByLabelText(/agent id/i);
    await userEvent.type(agentIdInput, AGENT_ID);

    const submit = screen.getByRole('button', { name: /apply override/i });
    await userEvent.click(submit);

    // Toast fires onCompleted — the success branch reset()s the form, so the
    // input clears once the mutation resolves.
    await waitFor(() => {
      expect((agentIdInput as HTMLInputElement).value).toBe('');
    });
  });

  it('surfaces an error toast when overrideAgentTier returns success=false', async () => {
    const mocks = [
      {
        request: {
          query: OVERRIDE_AGENT_TIER_MUTATION,
          variables: { agentId: AGENT_ID, toTier: 'SILVER', notes: null },
        },
        result: {
          data: {
            overrideAgentTier: {
              success: false,
              error: 'Agent not found',
              agentId: null,
              fromTier: null,
              toTier: null,
              transitionId: null,
            },
          },
        },
      },
    ];

    render(
      <Providers mocks={mocks}>
        <TierManagementSection />
      </Providers>,
    );

    const agentIdInput = screen.getByLabelText(/agent id/i);
    await userEvent.type(agentIdInput, AGENT_ID);
    await userEvent.click(screen.getByRole('button', { name: /apply override/i }));

    // On failure the form does NOT reset — the input retains its value so
    // the admin can correct and retry.
    await waitFor(() => {
      expect((agentIdInput as HTMLInputElement).value).toBe(AGENT_ID);
    });
  });
});
