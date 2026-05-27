/**
 * Smoke tests — AgentConfigSection (Fase 16b).
 *
 *   - Renders the "New" version pill + "Create initial config" CTA when
 *     myAgentConfig query returns null.
 *   - Renders an existing version (v3) when the query returns a row,
 *     and the CTA switches to "Save new version".
 *
 * The REST list endpoint (`listPersonalities`) is stubbed at the
 * `fetch` level so the section renders quickly without waiting on the
 * abort-aware promise inside useEffect.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Providers } from '../../../__tests__/helpers';
import { AgentConfigSection } from '../AgentConfigSection';
import { MY_AGENT_CONFIG_QUERY } from '../../../graphql/queries/agent-config';

beforeEach(() => {
  // Stub fetch so `listPersonalities()` resolves to an empty catalogue
  // (the smoke doesn't care about template rendering — covered by
  // Personalities.test if added later).
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url.includes('/api/v1/personalities/templates')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ items: [] }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });
    }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AgentConfigSection', () => {
  it('renders the "New" version pill + "Create initial config" CTA when the agent has no config', async () => {
    const mocks = [
      {
        request: { query: MY_AGENT_CONFIG_QUERY },
        result: { data: { myAgentConfig: null } },
      },
    ];

    render(
      <Providers mocks={mocks}>
        <AgentConfigSection />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText(/agent runtime config/i)).toBeInTheDocument();
    });
    // Version badge says "New".
    expect(screen.getByText(/^New$/)).toBeInTheDocument();
    // CTA says "Create initial config".
    expect(
      screen.getByRole('button', { name: /create initial config/i }),
    ).toBeInTheDocument();
  });

  it('renders the version pill + "Save new version" CTA when an existing config is loaded', async () => {
    const mocks = [
      {
        request: { query: MY_AGENT_CONFIG_QUERY },
        result: {
          data: {
            myAgentConfig: {
              id: 'cfg-1',
              version: 3,
              configHash: 'sha256:' + 'a'.repeat(64),
              systemPrompt: 'You are Rune, a Moltverse agent. ' + 'x'.repeat(80),
              personality: 'Curious and measured. ' + 'y'.repeat(90),
              declaredModel: 'anthropic/claude-haiku-4.5',
              declaredModelVersion: null,
              cycleIntervalMs: 420_000,
              allowedActionTypes: ['SCRAP_CREATE', 'SCRAP_REPLY'],
              knowledgeAreas: ['philosophy'],
              toneDescriptors: ['curious'],
              personalityTemplate: null,
              personalityTemplateMixins: [],
              editReason: null,
              createdAt: '2026-05-01T00:00:00Z',
              previousConfigId: 'cfg-prev',
              nextEditAvailableAt: '2026-05-08T00:00:00Z',
            },
          },
        },
      },
    ];

    render(
      <Providers mocks={mocks}>
        <AgentConfigSection />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByText('v3')).toBeInTheDocument();
    });
    expect(
      screen.getByRole('button', { name: /save new version/i }),
    ).toBeInTheDocument();
    // Pre-filled fields show through.
    expect(screen.getByDisplayValue('anthropic/claude-haiku-4.5')).toBeInTheDocument();
  });
});
