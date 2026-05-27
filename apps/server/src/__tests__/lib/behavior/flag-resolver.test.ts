/**
 * Tests for src/lib/behavior/flag-resolver.ts.
 *
 * Pure logic. Drives the decision function with synthesised flag rows
 * and the "currently detected" map; verifies the four cases:
 *   - flag still detected -> keep open
 *   - flag no longer detected -> resolve as condition_cleared
 *   - INFO flag past TTL -> resolve as ttl_expired
 *   - non-INFO flag past TTL -> keep open (humans must resolve)
 */

import { describe, expect, it } from 'vitest';

import { decideResolutions, type FlagRow } from '../../../lib/behavior/flag-resolver.js';

const NOW = new Date('2026-05-14T12:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1_000;

function flag(opts: {
  id: string;
  agentId: string;
  flagName: string;
  severity?: FlagRow['severity'];
  daysAgo: number;
  source?: string;
}): FlagRow {
  return {
    id: opts.id,
    agentId: opts.agentId,
    flag: opts.flagName,
    source: opts.source ?? 'config-anomaly-detector',
    severity: opts.severity ?? 'MEDIUM',
    raisedAt: new Date(NOW.getTime() - opts.daysAgo * DAY_MS),
  };
}

describe('decideResolutions', () => {
  it('keeps open when the flag is still detected for the agent', () => {
    const decisions = decideResolutions({
      flags: [
        flag({
          id: 'cf1',
          agentId: 'cag1',
          flagName: 'CONFIG_FREQUENT_MAJOR_CHANGES',
          daysAgo: 10,
        }),
      ],
      currentlyDetected: new Map([['cag1', new Set(['CONFIG_FREQUENT_MAJOR_CHANGES'])]]),
      now: NOW,
    });
    expect(decisions).toEqual([]);
  });

  it('resolves a flag whose condition is no longer detected', () => {
    const decisions = decideResolutions({
      flags: [
        flag({
          id: 'cf1',
          agentId: 'cag1',
          flagName: 'CONFIG_FREQUENT_MAJOR_CHANGES',
          daysAgo: 10,
        }),
      ],
      currentlyDetected: new Map([['cag1', new Set<string>()]]),
      now: NOW,
    });
    expect(decisions).toHaveLength(1);
    expect(decisions[0]?.reason).toBe('condition_cleared');
  });

  it('auto-resolves an INFO flag that has aged past the TTL', () => {
    const decisions = decideResolutions({
      flags: [
        flag({
          id: 'cf1',
          agentId: 'cag1',
          flagName: 'CONFIG_LAZY_REASONS',
          severity: 'INFO',
          daysAgo: 75,
        }),
      ],
      currentlyDetected: new Map([['cag1', new Set(['CONFIG_LAZY_REASONS'])]]),
      now: NOW,
    });
    expect(decisions).toHaveLength(1);
    expect(decisions[0]?.reason).toBe('ttl_expired');
  });

  it('keeps non-INFO flags open even past the TTL', () => {
    const decisions = decideResolutions({
      flags: [
        flag({
          id: 'cf1',
          agentId: 'cag1',
          flagName: 'CONFIG_FREQUENT_MAJOR_CHANGES',
          severity: 'MEDIUM',
          daysAgo: 75,
        }),
      ],
      currentlyDetected: new Map([['cag1', new Set(['CONFIG_FREQUENT_MAJOR_CHANGES'])]]),
      now: NOW,
    });
    expect(decisions).toEqual([]);
  });

  it('ignores flags raised by sources other than config-anomaly-detector', () => {
    const decisions = decideResolutions({
      flags: [
        flag({
          id: 'cf1',
          agentId: 'cag1',
          flagName: 'BEHAVIOR_LOW_SCORE',
          source: 'score-tier1-updater',
          daysAgo: 90,
        }),
      ],
      currentlyDetected: new Map(),
      now: NOW,
    });
    expect(decisions).toEqual([]);
  });
});
