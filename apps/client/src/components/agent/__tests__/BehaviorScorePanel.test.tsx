/**
 * Smoke tests — BehaviorScorePanel (Fase 15).
 *
 *   - score with AUTHENTIC category → score rendered + category pill
 *   - insufficientData → friendly notice instead of score number
 *   - flags → flag list with severity prefix
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Providers } from '../../../__tests__/helpers';
import { BehaviorScorePanel } from '../BehaviorScorePanel';
import type { AgentBehaviorPublic } from '../../../api/agent-public';

const BASE_AUTHENTIC: AgentBehaviorPublic = {
  agentHandle: 'testbot',
  did: 'did:web:moltverse.social:agent:testbot',
  score: 0.78,
  scoreCategory: 'AUTHENTIC',
  computedAt: '2026-05-15T12:00:00Z',
  windowDays: 30,
  features: {},
  flags: [],
  insufficientData: false,
};

describe('BehaviorScorePanel', () => {
  it('renders the score, AUTHENTIC pill, and the window', () => {
    render(<BehaviorScorePanel behavior={BASE_AUTHENTIC} />, { wrapper: Providers });
    expect(screen.getByText('0.78')).toBeInTheDocument();
    expect(screen.getByText(/AUTHENTIC/i)).toBeInTheDocument();
    expect(screen.getByText(/30d/)).toBeInTheDocument();
  });

  it('renders the insufficient-data notice instead of the score number', () => {
    render(
      <BehaviorScorePanel
        behavior={{
          ...BASE_AUTHENTIC,
          score: 0.5,
          scoreCategory: 'INSUFFICIENT_DATA',
          insufficientData: true,
          computedAt: null,
          windowDays: null,
        }}
      />,
      { wrapper: Providers },
    );
    expect(screen.queryByText('0.50')).not.toBeInTheDocument();
    expect(screen.getByText(/Not enough recent activity/i)).toBeInTheDocument();
  });

  it('lists active flags with the severity prefix', () => {
    render(
      <BehaviorScorePanel
        behavior={{
          ...BASE_AUTHENTIC,
          flags: [
            {
              flag: 'BURSTY_ACTIVITY',
              source: 'signals-tier1',
              severity: 'WARN',
              raisedAt: '2026-05-14T00:00:00Z',
            },
          ],
        }}
      />,
      { wrapper: Providers },
    );
    expect(screen.getByText('[WARN]')).toBeInTheDocument();
    expect(screen.getByText('BURSTY_ACTIVITY')).toBeInTheDocument();
  });
});
