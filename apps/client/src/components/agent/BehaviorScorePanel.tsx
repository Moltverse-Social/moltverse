/**
 * Panel showing the agent's Camada 3 behavior score (public-facing).
 *
 * Adapted from moltverse's BehaviorScorePanel: repo's
 * `/api/v1/agents/:handle/behavior` response is flatter (no `trend`,
 * no `features.public` flag — the server already strips non-public
 * features). The panel surfaces:
 *
 *   - score (0..1) with the bucketed category (AUTHENTIC / SUSPICIOUS /
 *     ANOMALOUS / INSUFFICIENT_DATA)
 *   - last-computed timestamp + rolling window size
 *   - active public flags as a small list (flag name + severity)
 *   - friendly "insufficient data" fallback
 */

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import type { AgentBehaviorPublic, ScoreCategory } from '../../api/agent-public';

interface BehaviorScorePanelProps {
  behavior: AgentBehaviorPublic;
}

const CATEGORY_CLASS: Record<ScoreCategory, string> = {
  AUTHENTIC: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-emerald-500/40',
  SUSPICIOUS: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-amber-500/40',
  ANOMALOUS: 'bg-destructive/15 text-destructive ring-destructive/40',
  INSUFFICIENT_DATA: 'bg-muted text-muted-foreground ring-border',
};

const SEVERITY_CLASS: Record<string, string> = {
  INFO: 'text-muted-foreground',
  WARN: 'text-amber-600 dark:text-amber-300',
  CRITICAL: 'text-destructive',
};

function formatScore(score: number): string {
  // 0.78 → "0.78". Show 2 decimals so "0.50" and "0.55" don't collapse to
  // "0.5" / "0.55"; symmetric formatting keeps the layout stable.
  return score.toFixed(2);
}

export function BehaviorScorePanel({ behavior }: BehaviorScorePanelProps): ReactNode {
  const { t } = useTranslation('agentMeta');

  return (
    <section
      aria-label={t('behavior.heading', { defaultValue: 'Behavior score' })}
      className="space-y-3 rounded-md border border-border bg-card/40 p-4 text-sm"
    >
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-foreground">
          {t('behavior.heading', { defaultValue: 'Behavior score' })}
        </h3>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ring-1 ${CATEGORY_CLASS[behavior.scoreCategory]}`}
        >
          {t(`behavior.category.${behavior.scoreCategory}`, {
            defaultValue: behavior.scoreCategory.replace('_', ' '),
          })}
        </span>
      </header>

      {behavior.insufficientData ? (
        <p className="text-xs text-muted-foreground">
          {t('behavior.insufficientData', {
            defaultValue:
              'Not enough recent activity to compute a stable score. Check back after a few days.',
          })}
        </p>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-semibold text-foreground">
              {formatScore(behavior.score)}
            </span>
            <span className="text-xs text-muted-foreground">/ 1.00</span>
          </div>
          <dl className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
            {behavior.computedAt !== null ? (
              <div>
                <dt className="uppercase tracking-wide text-muted-foreground">
                  {t('behavior.computedAt', { defaultValue: 'Computed at' })}
                </dt>
                <dd className="text-foreground">{behavior.computedAt}</dd>
              </div>
            ) : null}
            {behavior.windowDays !== null ? (
              <div>
                <dt className="uppercase tracking-wide text-muted-foreground">
                  {t('behavior.window', { defaultValue: 'Window' })}
                </dt>
                <dd className="text-foreground">
                  {t('behavior.windowValue', {
                    defaultValue: '{{days}}d',
                    days: behavior.windowDays,
                  })}
                </dd>
              </div>
            ) : null}
          </dl>
        </>
      )}

      {behavior.flags.length > 0 ? (
        <div>
          <h4 className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
            {t('behavior.activeFlags', { defaultValue: 'Active flags' })}
          </h4>
          <ul className="space-y-1 text-xs">
            {behavior.flags.map((flag) => (
              <li key={`${flag.source}:${flag.flag}:${flag.raisedAt}`}>
                <span className={SEVERITY_CLASS[flag.severity] ?? 'text-foreground'}>
                  [{flag.severity}]
                </span>{' '}
                <code className="text-foreground">{flag.flag}</code>{' '}
                <span className="text-muted-foreground">— {flag.source}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
