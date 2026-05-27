/**
 * Surfaces the current TEE attestation state for an agent.
 *
 * Camada 5 §6 — public read endpoint /api/v1/agents/:handle/attestation.
 * Returns null when no attestation has ever been submitted, in which
 * case we render a small "no attestation" notice instead of an empty
 * frame so the page composition stays predictable.
 */

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import type { AttestationStatus, AttestationSummary } from '../../api/agent-public';

interface AttestationCardProps {
  attestation: AttestationSummary | null;
  /** When set, used as "now" for grace-period math. Defaults to Date.now(). */
  now?: number;
}

const STATUS_CLASS: Record<AttestationStatus, string> = {
  PENDING_VERIFICATION: 'bg-muted text-muted-foreground ring-border',
  VALID: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-emerald-500/40',
  EXPIRED: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-amber-500/40',
  INVALID: 'bg-destructive/15 text-destructive ring-destructive/40',
  REVOKED: 'bg-destructive/15 text-destructive ring-destructive/40',
  SUPERSEDED: 'bg-muted text-muted-foreground ring-border',
};

function shortHash(hash: string): string {
  if (hash.length <= 14) return hash;
  return `${hash.slice(0, 8)}…${hash.slice(-4)}`;
}

function daysUntil(iso: string, now: number): number {
  return Math.floor((new Date(iso).getTime() - now) / (24 * 60 * 60 * 1_000));
}

export function AttestationCard({ attestation, now }: AttestationCardProps): ReactNode {
  const { t } = useTranslation('agentMeta');
  const reference = now ?? Date.now();

  if (attestation === null) {
    return (
      <section
        aria-label="Attestation"
        className="rounded-md border border-border bg-card/40 p-4 text-sm text-muted-foreground"
      >
        {t('attestation.none', { defaultValue: 'No TEE attestation recorded yet.' })}
      </section>
    );
  }

  const expiresInDays = daysUntil(attestation.expiresAt, reference);

  return (
    <section
      aria-label="Attestation"
      className="space-y-2 rounded-md border border-border bg-card/40 p-4 text-sm"
    >
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-foreground">
          {t('attestation.heading', { defaultValue: 'TEE attestation' })}
        </h3>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ring-1 ${STATUS_CLASS[attestation.status]}`}
        >
          {attestation.status.replace('_', ' ')}
        </span>
      </header>

      <dl className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
        <div>
          <dt className="uppercase tracking-wide text-muted-foreground">
            {t('attestation.composeHash', { defaultValue: 'Compose hash' })}
          </dt>
          <dd className="font-mono text-foreground">{shortHash(attestation.composeHash)}</dd>
        </div>
        <div>
          <dt className="uppercase tracking-wide text-muted-foreground">
            {t('attestation.attestedAt', { defaultValue: 'Attested at' })}
          </dt>
          <dd className="text-foreground">{attestation.attestedAt}</dd>
        </div>
        <div>
          <dt className="uppercase tracking-wide text-muted-foreground">
            {t('attestation.expiresAt', { defaultValue: 'Expires at' })}
          </dt>
          <dd
            className={
              attestation.status === 'VALID' && expiresInDays < 7
                ? 'text-amber-600 dark:text-amber-300'
                : 'text-foreground'
            }
          >
            {attestation.expiresAt}{' '}
            {attestation.status === 'VALID' ? (
              <span className="text-muted-foreground">
                (
                {expiresInDays >= 0
                  ? `${expiresInDays.toString()}d`
                  : t('attestation.expired', { defaultValue: 'expired' })}
                )
              </span>
            ) : null}
          </dd>
        </div>
      </dl>

      {attestation.invalidatedReason !== null ? (
        <p className="rounded border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs text-destructive">
          {t('attestation.invalidatedReason', { defaultValue: 'Invalidated:' })}{' '}
          {attestation.invalidatedReason}
        </p>
      ) : null}

      {attestation.onChainTxHash !== null ? (
        <p className="text-xs text-muted-foreground">
          {t('attestation.onChain', { defaultValue: 'On-chain tx:' })}{' '}
          <code className="text-foreground">{shortHash(attestation.onChainTxHash)}</code>
        </p>
      ) : null}
    </section>
  );
}
