/**
 * Auto-resolution of stale behavior flags — Camada 3 §9.5.
 *
 * Pure logic separated from the cron plugin. Given the recent context
 * (current active config flags, recent diff history) plus a set of
 * not-yet-resolved BehaviorFlag rows, returns the subset that should
 * be auto-resolved because the condition that raised them is no
 * longer present.
 *
 * Conservative initial rule set:
 *
 *   - A `CONFIG_*` flag whose source is `config-anomaly-detector` and
 *     whose name is no longer in the most-recent detector pass for
 *     the same agent → resolve with reason "auto-resolved: condition
 *     no longer present".
 *   - Any flag older than `MAX_AGE_DAYS` whose severity is INFO and
 *     whose source is `config-anomaly-detector` → resolve with reason
 *     "auto-resolved: TTL expired".
 *
 * The remaining flag types (BEHAVIOR_*, ATTESTATION_*) are not auto-
 * resolvable yet — they require human review and stay open until an
 * admin closes them via the resolve endpoint.
 */

export interface FlagRow {
  id: string;
  agentId: string;
  flag: string;
  source: string;
  severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  raisedAt: Date;
}

export type ResolutionReason = 'condition_cleared' | 'ttl_expired';

export interface ResolutionDecision {
  flagId: string;
  agentId: string;
  reason: ResolutionReason;
  resolvedReason: string;
}

export interface ResolverInput {
  flags: readonly FlagRow[];
  /** For each agent, the set of flag names that are CURRENTLY raised
   *  by the config-anomaly-detector pass (computed by the cron from
   *  the live data). */
  currentlyDetected: Map<string, ReadonlySet<string>>;
  now?: Date;
  maxAgeDays?: number;
}

export const DEFAULT_MAX_AGE_DAYS = 60;

export function decideResolutions(input: ResolverInput): ResolutionDecision[] {
  const now = input.now ?? new Date();
  const maxAgeMs = (input.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS) * 24 * 60 * 60 * 1_000;
  const decisions: ResolutionDecision[] = [];

  for (const flag of input.flags) {
    if (flag.source !== 'config-anomaly-detector') continue;

    const stillDetected = input.currentlyDetected.get(flag.agentId)?.has(flag.flag) ?? false;
    if (!stillDetected) {
      decisions.push({
        flagId: flag.id,
        agentId: flag.agentId,
        reason: 'condition_cleared',
        resolvedReason: 'auto-resolved: condition no longer present',
      });
      continue;
    }

    const ageMs = now.getTime() - flag.raisedAt.getTime();
    if (flag.severity === 'INFO' && ageMs > maxAgeMs) {
      decisions.push({
        flagId: flag.id,
        agentId: flag.agentId,
        reason: 'ttl_expired',
        resolvedReason: 'auto-resolved: TTL expired with no recurrence',
      });
    }
  }

  return decisions;
}
