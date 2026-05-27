/**
 * Smoke tests — AgentConfigHistorySection (Fase 17 + 17.5).
 *
 *   - Self-hides when the bridge returns an empty array (no agent or
 *     no config yet).
 *   - Self-hides when there is only a single version (no history to
 *     show; the picker above already covers that one).
 *   - Renders the timeline + version pills + current badge when 2+
 *     versions are loaded.
 *   - Renders the AgentConfigDiffPanel when changesFromPrevious is
 *     populated (Fase 17.5). Hides it for v1 and for legacy rows
 *     without diff.
 */

import { describe, expect, it } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import { Providers } from '../../../__tests__/helpers';
import { AgentConfigHistorySection } from '../AgentConfigHistorySection';
import { MY_AGENT_CONFIG_HISTORY_QUERY } from '../../../graphql/queries/agent-config';

function buildIdentityDiff(toConfigId: string, fromConfigId: string): unknown {
  return {
    __typename: 'AgentConfigDiffSummary',
    fromConfigId,
    toConfigId,
    severity: 'MINOR',
    flags: ['EMPTY_REASON'],
    createdAt: '2026-05-12T12:00:00Z',
    fieldChanges: {
      __typename: 'AgentConfigFieldChanges',
      systemPrompt: {
        __typename: 'AgentConfigStringFieldChange',
        changed: true,
        fromChars: 120,
        toChars: 180,
        addedChars: 60,
        removedChars: 0,
        levenshteinRatio: 0.18,
      },
      personality: {
        __typename: 'AgentConfigStringFieldChange',
        changed: false,
        fromChars: 90,
        toChars: 90,
        addedChars: 0,
        removedChars: 0,
        levenshteinRatio: 0,
      },
      declaredModel: {
        __typename: 'AgentConfigScalarStringFieldChange',
        changed: false,
        from: 'anthropic/claude-haiku-4.5',
        to: 'anthropic/claude-haiku-4.5',
      },
      cycleIntervalMs: {
        __typename: 'AgentConfigNumericFieldChange',
        changed: false,
        from: 300_000,
        to: 300_000,
        ratio: 1,
      },
      personalityTemplate: {
        __typename: 'AgentConfigScalarStringFieldChange',
        changed: false,
        from: null,
        to: null,
      },
      allowedActionTypes: {
        __typename: 'AgentConfigArrayFieldChange',
        changed: true,
        added: ['FRIEND_ADD'],
        removed: ['PROFILE_VIEW'],
        overlapRatio: 0.5,
      },
      knowledgeAreas: {
        __typename: 'AgentConfigArrayFieldChange',
        changed: false,
        added: [],
        removed: [],
        overlapRatio: 1,
      },
      toneDescriptors: {
        __typename: 'AgentConfigArrayFieldChange',
        changed: false,
        added: [],
        removed: [],
        overlapRatio: 1,
      },
      personalityTemplateMixins: {
        __typename: 'AgentConfigArrayFieldChange',
        changed: false,
        added: [],
        removed: [],
        overlapRatio: 1,
      },
    },
  };
}

function buildVersion(version: number, extras: Partial<Record<string, unknown>> = {}): unknown {
  const id = `cfg-${version}`;
  const previousConfigId = version === 1 ? null : `cfg-${version - 1}`;
  return {
    __typename: 'AgentConfigVersion',
    id,
    version,
    configHash: 'sha256:' + String(version).repeat(64).slice(0, 64),
    declaredModel: 'anthropic/claude-haiku-4.5',
    declaredModelVersion: null,
    cycleIntervalMs: 300_000,
    allowedActionTypes: ['SCRAP_CREATE', 'SCRAP_REPLY'],
    knowledgeAreas: ['philosophy'],
    toneDescriptors: ['curious'],
    personalityTemplate: null,
    personalityTemplateMixins: [],
    editReason: version === 1 ? null : `reason for v${version}`,
    createdAt: `2026-05-1${version}T12:00:00Z`,
    previousConfigId,
    systemPrompt: 'You are a Moltverse agent. ' + 'x'.repeat(120),
    personality: 'Curious and measured. ' + 'y'.repeat(90),
    changesFromPrevious:
      previousConfigId === null ? null : buildIdentityDiff(id, previousConfigId),
    ...extras,
  };
}

describe('AgentConfigHistorySection', () => {
  it('renders nothing when the history query returns an empty array', async () => {
    const mocks = [
      {
        request: { query: MY_AGENT_CONFIG_HISTORY_QUERY, variables: { limit: 20 } },
        result: { data: { myAgentConfigHistory: [] } },
      },
    ];

    const { container } = render(
      <Providers mocks={mocks}>
        <AgentConfigHistorySection />
      </Providers>,
    );

    // Self-hides; container stays empty after the query resolves.
    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it('renders nothing when the history has a single version (no history yet)', async () => {
    const mocks = [
      {
        request: { query: MY_AGENT_CONFIG_HISTORY_QUERY, variables: { limit: 20 } },
        result: { data: { myAgentConfigHistory: [buildVersion(1)] } },
      },
    ];

    const { container } = render(
      <Providers mocks={mocks}>
        <AgentConfigHistorySection />
      </Providers>,
    );

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it('renders the timeline with version pills + current badge when 3 versions exist', async () => {
    const mocks = [
      {
        request: { query: MY_AGENT_CONFIG_HISTORY_QUERY, variables: { limit: 20 } },
        result: {
          data: {
            myAgentConfigHistory: [buildVersion(3), buildVersion(2), buildVersion(1)],
          },
        },
      },
    ];

    render(
      <Providers mocks={mocks}>
        <AgentConfigHistorySection />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText(/config history/i)).toBeInTheDocument();
    });

    // Version pills v1, v2, v3 are all visible.
    expect(screen.getByText('v1')).toBeInTheDocument();
    expect(screen.getByText('v2')).toBeInTheDocument();
    expect(screen.getByText('v3')).toBeInTheDocument();

    // "current" badge is rendered on the newest row only — assert it
    // appears exactly once.
    const currentBadges = screen.getAllByText(/^current$/i);
    expect(currentBadges).toHaveLength(1);

    // Edit reasons surface on the row header.
    expect(screen.getByText('reason for v3')).toBeInTheDocument();
    expect(screen.getByText('reason for v2')).toBeInTheDocument();
    // v1 has no edit reason → fallback i18n string.
    expect(screen.getByText(/no edit reason recorded/i)).toBeInTheDocument();
  });

  it('renders the diff panel when expanding a v2+ row with changesFromPrevious', async () => {
    const mocks = [
      {
        request: { query: MY_AGENT_CONFIG_HISTORY_QUERY, variables: { limit: 20 } },
        result: {
          data: {
            myAgentConfigHistory: [buildVersion(2), buildVersion(1)],
          },
        },
      },
    ];

    render(
      <Providers mocks={mocks}>
        <AgentConfigHistorySection />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('v2')).toBeInTheDocument();
    });

    // Expand v2 by clicking its row header (the button wraps the version pill).
    fireEvent.click(screen.getByText('v2').closest('button')!);

    // Diff panel header references the previous version number.
    await waitFor(() => {
      expect(screen.getByText(/changes from v1/i)).toBeInTheDocument();
    });

    // Severity pill renders (MINOR for the fixture).
    expect(screen.getByText(/^minor$/i)).toBeInTheDocument();

    // One of the changed-array entries surfaces with the +/- prefix.
    expect(screen.getByText('+FRIEND_ADD')).toBeInTheDocument();
    expect(screen.getByText('-PROFILE_VIEW')).toBeInTheDocument();
  });

  it('hides the diff panel for v1 (no predecessor)', async () => {
    const mocks = [
      {
        request: { query: MY_AGENT_CONFIG_HISTORY_QUERY, variables: { limit: 20 } },
        result: {
          data: {
            myAgentConfigHistory: [buildVersion(2), buildVersion(1)],
          },
        },
      },
    ];

    render(
      <Providers mocks={mocks}>
        <AgentConfigHistorySection />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('v1')).toBeInTheDocument();
    });

    // Expand v1.
    fireEvent.click(screen.getByText('v1').closest('button')!);

    // Brief wait for the expanded panel to render — v1 has its config
    // shown but no diff panel. Look up by row to scope.
    const v1Row = screen.getByText('v1').closest('li')!;
    expect(within(v1Row).queryByText(/changes from v/i)).toBeNull();
  });

  it('hides the diff panel for a legacy row with changesFromPrevious=null', async () => {
    const legacyV2 = buildVersion(2, { changesFromPrevious: null });
    const mocks = [
      {
        request: { query: MY_AGENT_CONFIG_HISTORY_QUERY, variables: { limit: 20 } },
        result: {
          data: {
            myAgentConfigHistory: [legacyV2, buildVersion(1)],
          },
        },
      },
    ];

    render(
      <Providers mocks={mocks}>
        <AgentConfigHistorySection />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('v2')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('v2').closest('button')!);

    const v2Row = screen.getByText('v2').closest('li')!;
    // Wait for expansion (system prompt preview text shows on expand).
    await waitFor(() => {
      expect(within(v2Row).getByText(/system prompt/i)).toBeInTheDocument();
    });
    expect(within(v2Row).queryByText(/changes from v/i)).toBeNull();
  });
});
