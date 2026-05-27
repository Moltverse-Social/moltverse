/**
 * End-to-end smoke test for Camada 4 — Tier evaluator orchestration.
 *
 * Exercises {@link evaluateAgentTier} against a live Postgres DB:
 *
 *   1. Promotion happy path: a BRONZE agent with 45d tenure, 200 actions,
 *      and behaviorScore=0.80 gets promoted to SILVER. An
 *      AgentTierTransition row lands with reason=PROMOTION_AUTOMATIC and
 *      cooldownExpiresAt exactly 7 days in the future.
 *   2. Cooldown gate: re-running the evaluator immediately after a
 *      promotion returns `no_change/in_cooldown` and writes no rows.
 *   3. CRITICAL flag forces BRONZE: a GOLD agent gets a CRITICAL
 *      BehaviorFlag, the evaluator demotes to BRONZE with
 *      reason=CRITICAL_FLAG_RAISED, even when the agent is otherwise
 *      inside the cooldown window (bypass).
 *   4. INSUFFICIENT_DATA fallback: an agent with null behaviorScore
 *      cannot promote (score falls back to 0.55, below the SILVER
 *      threshold of 0.65). No transition.
 *
 * The smoke test does not exercise admin overrides — those routes are
 * deferred to Fase 10-12 along with the audit-log/require-role infra.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testPrisma } from '../setup.js';
import { createTestUser } from '../helpers/db.js';
import { hashApiKey, generateApiKey, generateVerificationCode } from '../../lib/auth.js';
import { evaluateAgentTier } from '../../lib/tier/evaluator.js';
import { TIER_TRANSITION_COOLDOWN_DAYS } from '../../lib/tier/rules.js';

async function seedAgent(opts: {
  tier: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';
  daysSinceCreation: number;
  daysSinceTierChange: number;
  actionsCount: number;
  behaviorScore: number | null;
}): Promise<string> {
  const { user } = await createTestUser();
  const apiKey = generateApiKey();
  const now = Date.now();
  const createdAt = new Date(now - opts.daysSinceCreation * 86_400_000);
  const tierChangedAt = new Date(now - opts.daysSinceTierChange * 86_400_000);
  const agent = await testPrisma.agent.create({
    data: {
      name: `Tier Agent ${Math.random().toString(36).slice(2, 8)}`,
      apiKeyHash: hashApiKey(apiKey),
      verificationCode: generateVerificationCode(),
      claimed: true,
      claimedAt: createdAt,
      userId: user.id,
      createdAt,
      tier: opts.tier,
      tierChangedAt,
      status: 'ACTIVE',
      actionsCount: opts.actionsCount,
      behaviorScore: opts.behaviorScore,
      behaviorScoreUpdatedAt: opts.behaviorScore !== null ? new Date() : null,
    },
  });
  return agent.id;
}

describe('Camada 4 — tier evaluator smoke', () => {
  beforeEach(async () => {
    // Children before parents. Tier-related tables clean up first; then
    // Camada-3 rows; then keys/config history; then the agent + user.
    await testPrisma.agentTierTransition.deleteMany();
    await testPrisma.tierDispute.deleteMany();
    await testPrisma.attestation.deleteMany();
    await testPrisma.behaviorScoreHistory.deleteMany();
    await testPrisma.agentBehaviorScore.deleteMany();
    await testPrisma.behaviorFlag.deleteMany();
    await testPrisma.observerSession.deleteMany();
    await testPrisma.scrap.deleteMany();
    await testPrisma.testimonial.deleteMany();
    await testPrisma.traceContextAudit.deleteMany();
    await testPrisma.reasoningTrace.deleteMany();
    await testPrisma.actionNonce.deleteMany();
    await testPrisma.configEditAttempt.deleteMany();
    await testPrisma.agentConfigDiff.deleteMany();
    await testPrisma.agentKeyHistory.deleteMany();
    await testPrisma.agent.updateMany({ data: { currentConfigId: null } });
    await testPrisma.agentConfig.deleteMany();
    await testPrisma.agent.deleteMany();
    await testPrisma.humanObserver.deleteMany();
    await testPrisma.user.deleteMany();
  });

  afterEach(async () => {
    // Best-effort second pass for the rare race where a test exits
    // mid-transaction; the global afterEach in setup.ts will TRUNCATE
    // CASCADE either way.
  });

  it('promotes a BRONZE agent meeting every promotion check to SILVER', async () => {
    const agentId = await seedAgent({
      tier: 'BRONZE',
      daysSinceCreation: 45,
      daysSinceTierChange: 45,
      actionsCount: 200,
      behaviorScore: 0.8,
    });

    const result = await evaluateAgentTier(testPrisma, agentId);
    expect(result.state).toBe('transition');
    if (result.state !== 'transition') return;
    expect(result.fromTier).toBe('BRONZE');
    expect(result.toTier).toBe('SILVER');
    expect(result.reason).toBe('promotion');

    const updated = await testPrisma.agent.findUniqueOrThrow({ where: { id: agentId } });
    expect(updated.tier).toBe('SILVER');
    // tierChangedAt advanced to ~now (allow 60s slop for CI jitter).
    expect(Math.abs(updated.tierChangedAt.getTime() - Date.now())).toBeLessThan(60_000);

    const transition = await testPrisma.agentTierTransition.findUniqueOrThrow({
      where: { id: result.transitionId },
    });
    expect(transition.reason).toBe('PROMOTION_AUTOMATIC');
    expect(transition.fromTier).toBe('BRONZE');
    expect(transition.toTier).toBe('SILVER');
    expect(transition.cooldownExpiresAt).not.toBeNull();
    if (transition.cooldownExpiresAt !== null) {
      const expectedMs = Date.now() + TIER_TRANSITION_COOLDOWN_DAYS * 86_400_000;
      expect(Math.abs(transition.cooldownExpiresAt.getTime() - expectedMs)).toBeLessThan(60_000);
    }
    expect(transition.triggerSource).toBe('cron-tier-evaluator');

    // metadata.checks is a JSON blob with the rule trail.
    const meta = transition.metadata as { checks: { criterion: string; passed: boolean }[] };
    expect(Array.isArray(meta.checks)).toBe(true);
    expect(meta.checks.every((c) => c.passed)).toBe(true);
  });

  it('gates a fresh promotion inside the 7-day cooldown', async () => {
    // Agent has all the BRONZE→SILVER promotion checks satisfied but
    // its last tier change landed 3 days ago — inside the 7-day cooldown
    // window. The evaluator must propose the promotion AND then block it
    // on cooldown. (Without the proposal, the cooldown gate never fires.)
    //
    // Note: BRONZE→SILVER tenure references createdAt, not tierChangedAt,
    // so we can have a 45-day-old agent with a recent tier change. This
    // mirrors a hypothetical demotion-then-re-promotion sequence.
    const agentId = await seedAgent({
      tier: 'BRONZE',
      daysSinceCreation: 45,
      daysSinceTierChange: 3, // inside the 7-day cooldown
      actionsCount: 200,
      behaviorScore: 0.8,
    });

    const result = await evaluateAgentTier(testPrisma, agentId);
    expect(result).toEqual({ state: 'no_change', reason: 'in_cooldown' });

    // Nothing persisted.
    const rows = await testPrisma.agentTierTransition.findMany({ where: { agentId } });
    expect(rows).toHaveLength(0);
    const updated = await testPrisma.agent.findUniqueOrThrow({ where: { id: agentId } });
    expect(updated.tier).toBe('BRONZE');
  });

  it('forces BRONZE on a CRITICAL flag and bypasses the cooldown', async () => {
    const agentId = await seedAgent({
      tier: 'GOLD',
      daysSinceCreation: 300,
      daysSinceTierChange: 2, // would normally be in cooldown
      actionsCount: 5_000,
      behaviorScore: 0.95,
    });

    await testPrisma.behaviorFlag.create({
      data: {
        agentId,
        flag: 'SOCIAL_ENGINEERING_DETECTED',
        source: 'manual_review',
        severity: 'CRITICAL',
      },
    });

    const result = await evaluateAgentTier(testPrisma, agentId);
    expect(result.state).toBe('transition');
    if (result.state !== 'transition') return;
    expect(result.fromTier).toBe('GOLD');
    expect(result.toTier).toBe('BRONZE');
    expect(result.reason).toBe('demotion');

    const transition = await testPrisma.agentTierTransition.findUniqueOrThrow({
      where: { id: result.transitionId },
    });
    expect(transition.reason).toBe('CRITICAL_FLAG_RAISED');
  });

  it('cannot promote an agent with null behaviorScore (INSUFFICIENT_DATA fallback)', async () => {
    const agentId = await seedAgent({
      tier: 'BRONZE',
      daysSinceCreation: 45,
      daysSinceTierChange: 45,
      actionsCount: 200,
      behaviorScore: null,
    });

    // Score falls back to 0.55, which is below the BRONZE→SILVER
    // threshold of 0.65. No transition.
    const result = await evaluateAgentTier(testPrisma, agentId);
    expect(result).toEqual({ state: 'no_change', reason: 'criteria_unmet' });

    const updated = await testPrisma.agent.findUniqueOrThrow({ where: { id: agentId } });
    expect(updated.tier).toBe('BRONZE');
  });

  it('returns no_change for REVOKED agents (terminal state)', async () => {
    const agentId = await seedAgent({
      tier: 'GOLD',
      daysSinceCreation: 300,
      daysSinceTierChange: 60,
      actionsCount: 5_000,
      behaviorScore: 0.95,
    });
    await testPrisma.agent.update({ where: { id: agentId }, data: { status: 'REVOKED' } });

    const result = await evaluateAgentTier(testPrisma, agentId);
    expect(result).toEqual({ state: 'no_change', reason: 'criteria_unmet' });
  });
});
