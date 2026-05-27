/**
 * Smoke tests — ConfigEditAttemptsSection (Fase 17.6).
 *
 * Covers the rendering paths that depend on Apollo state, the result
 * pill rendering for distinct EditAttemptResult values, the empty
 * state, and the "showing X-Y of Z" pagination summary.
 *
 * The Apollo mock keys both `filter` and `pagination` to match the
 * initial query — the section issues one query on mount with default
 * filter + default pagination ({ limit: 50, offset: 0 }).
 */

import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

import { Providers } from '../../../../__tests__/helpers';
import { ConfigEditAttemptsSection } from '../ConfigEditAttemptsSection';
import {
  ADMIN_CONFIG_EDIT_ATTEMPTS_QUERY,
  type ConfigEditAttemptEntry,
} from '../../../../graphql/queries/admin';

const INITIAL_VARS = {
  filter: {
    agentId: null,
    attemptedByObserverId: null,
    results: null,
    errorCode: null,
    attemptedAfter: null,
    attemptedBefore: null,
  },
  pagination: { limit: 50, offset: 0 },
};

function buildEntry(
  result: ConfigEditAttemptEntry['result'],
  overrides: Partial<ConfigEditAttemptEntry> = {},
): ConfigEditAttemptEntry {
  return {
    id: overrides.id ?? `entry-${result}`,
    agentId: 'agent-1',
    agentName: 'Rune the Cynic',
    agentHandle: 'rune',
    attemptedByObserverId: null,
    attemptedByObserverName: null,
    attemptedAt: '2026-05-19T12:00:00Z',
    result,
    errorCode: null,
    cooldownExpiresAt: null,
    wouldHaveTriggeredCooldown: false,
    ...overrides,
  };
}

describe('ConfigEditAttemptsSection', () => {
  it('renders an empty state when the query returns no entries', async () => {
    const mocks = [
      {
        request: { query: ADMIN_CONFIG_EDIT_ATTEMPTS_QUERY, variables: INITIAL_VARS },
        result: {
          data: {
            adminConfigEditAttempts: { entries: [], totalCount: 0, hasMore: false },
          },
        },
      },
    ];

    render(
      <Providers mocks={mocks}>
        <ConfigEditAttemptsSection />
      </Providers>,
    );

    // The "no matching attempts" string is rendered in TWO places when
    // the result set is empty: the header summary (showing) AND the
    // table-empty placeholder. The empty placeholder is the canonical
    // signal — use getAllBy + assert at least one match.
    await waitFor(() => {
      expect(screen.getAllByText(/no matching attempts/i).length).toBeGreaterThan(0);
    });
  });

  it('renders entries with result pills and pagination summary', async () => {
    const entries = [
      buildEntry('SUCCESS', { id: 'a' }),
      buildEntry('VALIDATION_FAILED', { id: 'b', errorCode: 'CONFIG_PERSONALITY_REQUIRED' }),
      buildEntry('COOLDOWN_DENIED', {
        id: 'c',
        errorCode: 'CONFIG_COOLDOWN_ACTIVE',
        cooldownExpiresAt: '2026-05-26T12:00:00Z',
      }),
    ];

    const mocks = [
      {
        request: { query: ADMIN_CONFIG_EDIT_ATTEMPTS_QUERY, variables: INITIAL_VARS },
        result: {
          data: {
            adminConfigEditAttempts: {
              entries,
              totalCount: 3,
              hasMore: false,
            },
          },
        },
      },
    ];

    render(
      <Providers mocks={mocks}>
        <ConfigEditAttemptsSection />
      </Providers>,
    );

    // Result pills render in the table. The same label is ALSO rendered
    // as a filter chip in the top card (every result type is shown as a
    // togglable chip regardless of selection state), so the text appears
    // in two places — chip + pill. The test i18n setup
    // (`apps/client/src/__tests__/helpers.tsx`) only loads the `common`
    // namespace, so `t('configEditAttempts.results.{KEY}', {
    // defaultValue: KEY })` falls back to the enum value (uppercase).
    // Asserting against the enum name keeps the test independent of
    // the localization layer.
    await waitFor(() => {
      expect(screen.getAllByText('SUCCESS').length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText('VALIDATION_FAILED').length).toBeGreaterThan(0);
    expect(screen.getAllByText('COOLDOWN_DENIED').length).toBeGreaterThan(0);

    // Error codes appear in the table.
    expect(screen.getByText('CONFIG_PERSONALITY_REQUIRED')).toBeInTheDocument();
    expect(screen.getByText('CONFIG_COOLDOWN_ACTIVE')).toBeInTheDocument();

    // Pagination summary "Showing 1-3 of 3".
    expect(screen.getByText(/showing 1-3 of 3/i)).toBeInTheDocument();

    // Agent handle column — 3 rows share the same agent so we expect 3.
    expect(screen.getAllByText('@rune')).toHaveLength(3);
  });

  it('shows observer name when attribution is present', async () => {
    const entries = [
      buildEntry('SUCCESS', {
        id: 'with-obs',
        attemptedByObserverId: 'obs-1',
        attemptedByObserverName: 'Alice Admin',
      }),
    ];

    const mocks = [
      {
        request: { query: ADMIN_CONFIG_EDIT_ATTEMPTS_QUERY, variables: INITIAL_VARS },
        result: {
          data: {
            adminConfigEditAttempts: { entries, totalCount: 1, hasMore: false },
          },
        },
      },
    ];

    render(
      <Providers mocks={mocks}>
        <ConfigEditAttemptsSection />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('Alice Admin')).toBeInTheDocument();
    });
  });
});
