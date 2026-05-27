/**
 * Smoke test — ComposeHashesSection (Fase 12).
 */

import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Providers } from '../../../../__tests__/helpers';
import { ComposeHashesSection } from '../ComposeHashesSection';
import { APPROVED_COMPOSE_HASHES_QUERY } from '../../../../graphql/queries/admin';

const VALID_HASH = '0x' + 'a'.repeat(64);

describe('ComposeHashesSection', () => {
  it('renders empty state when whitelist is empty', async () => {
    const mocks = [
      {
        request: { query: APPROVED_COMPOSE_HASHES_QUERY },
        result: { data: { approvedComposeHashes: [] } },
      },
    ];
    render(
      <Providers mocks={mocks}>
        <ComposeHashesSection />
      </Providers>,
    );
    await waitFor(() => {
      expect(screen.getByText(/no approved compose-hashes yet/i)).toBeInTheDocument();
    });
  });

  it('renders the whitelist table with entries from the query', async () => {
    const mocks = [
      {
        request: { query: APPROVED_COMPOSE_HASHES_QUERY },
        result: {
          data: {
            approvedComposeHashes: [
              {
                id: 'id-1',
                composeHash: VALID_HASH,
                label: 'production-v1.0',
                notes: 'primary image',
                addedAt: '2026-05-01T00:00:00Z',
                deprecatedAt: null,
                deprecationGraceUntil: null,
              },
            ],
          },
        },
      },
    ];
    render(
      <Providers mocks={mocks}>
        <ComposeHashesSection />
      </Providers>,
    );
    await waitFor(() => {
      expect(screen.getByText(/production-v1\.0/)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /deprecate/i })).toBeInTheDocument();
  });
});
