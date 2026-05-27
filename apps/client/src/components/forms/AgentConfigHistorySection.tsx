/**
 * Agent config history viewer — Fase 17.
 *
 * Surfaces the lineage of the authenticated user's AgentConfig rows
 * (newest first, up to 20). Mounts in Settings.tsx right below
 * AgentConfigSection. Self-hides if the caller has no agent, the
 * query errors, or there is only a single version (the picker above
 * already shows that one — a "history" of one is not history).
 *
 * Each entry expands to show declared model, cycle interval, template
 * + mixins attribution, knowledge areas / tone descriptors, allowed
 * actions, and previews of systemPrompt + personality (capped to keep
 * the section scannable).
 */

import { useState, type ReactNode } from 'react';
import { useQuery } from '@apollo/client';
import { useTranslation } from 'react-i18next';
import { History, ChevronDown, ChevronRight, GitCompareArrows } from 'lucide-react';

import {
  MY_AGENT_CONFIG_HISTORY_QUERY,
  type AgentConfigArrayFieldChange,
  type AgentConfigDiffFlag,
  type AgentConfigDiffSeverity,
  type AgentConfigDiffSummary,
  type AgentConfigNumericFieldChange,
  type AgentConfigScalarStringFieldChange,
  type AgentConfigStringFieldChange,
  type AgentConfigVersionWithDiff,
  type MyAgentConfigHistoryQueryData,
  type MyAgentConfigHistoryQueryVars,
} from '../../graphql/queries/agent-config';

function formatTimestamp(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatCycle(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${Math.round(ms / 3_600_000)}h`;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + '…';
}

function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

function formatScalarOrNull(value: string | null, fallback: string): string {
  return value === null ? fallback : value;
}

const SEVERITY_PILL: Record<AgentConfigDiffSeverity, string> = {
  TRIVIAL: 'bg-muted text-muted-foreground',
  MINOR: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  MAJOR: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  RADICAL: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
};

function StringChangeRow({
  label,
  change,
  noChangeLabel,
}: {
  label: string;
  change: AgentConfigStringFieldChange;
  noChangeLabel: string;
}): ReactNode {
  if (!change.changed) {
    return <DiffRow label={label} value={<span className="text-muted-foreground italic">{noChangeLabel}</span>} />;
  }
  return (
    <DiffRow
      label={label}
      value={
        <span className="text-foreground">
          {change.fromChars} → {change.toChars} {' chars'}
          <span className="text-muted-foreground"> · {formatPercent(change.levenshteinRatio)}</span>
          {change.addedChars > 0 && (
            <span className="text-emerald-700 dark:text-emerald-300"> +{change.addedChars}</span>
          )}
          {change.removedChars > 0 && (
            <span className="text-rose-700 dark:text-rose-300"> -{change.removedChars}</span>
          )}
        </span>
      }
    />
  );
}

function ScalarChangeRow({
  label,
  change,
  noChangeLabel,
  nullLabel,
}: {
  label: string;
  change: AgentConfigScalarStringFieldChange;
  noChangeLabel: string;
  nullLabel: string;
}): ReactNode {
  if (!change.changed) {
    return <DiffRow label={label} value={<span className="text-muted-foreground italic">{noChangeLabel}</span>} />;
  }
  return (
    <DiffRow
      label={label}
      value={
        <span className="font-mono text-xs text-foreground break-all">
          {formatScalarOrNull(change.from, nullLabel)}
          <span className="text-muted-foreground"> → </span>
          {formatScalarOrNull(change.to, nullLabel)}
        </span>
      }
    />
  );
}

function NumericChangeRow({
  label,
  change,
  noChangeLabel,
  format,
}: {
  label: string;
  change: AgentConfigNumericFieldChange;
  noChangeLabel: string;
  format: (n: number) => string;
}): ReactNode {
  if (!change.changed) {
    return <DiffRow label={label} value={<span className="text-muted-foreground italic">{noChangeLabel}</span>} />;
  }
  return (
    <DiffRow
      label={label}
      value={
        <span className="text-foreground">
          {format(change.from)}
          <span className="text-muted-foreground"> → </span>
          {format(change.to)}
          {change.ratio !== null && (
            <span className="text-muted-foreground"> · ×{change.ratio.toFixed(2)}</span>
          )}
        </span>
      }
    />
  );
}

function ArrayChangeRow({
  label,
  change,
  noChangeLabel,
}: {
  label: string;
  change: AgentConfigArrayFieldChange;
  noChangeLabel: string;
}): ReactNode {
  if (!change.changed) {
    return <DiffRow label={label} value={<span className="text-muted-foreground italic">{noChangeLabel}</span>} />;
  }
  return (
    <DiffRow
      label={label}
      value={
        <span className="text-xs font-mono break-all">
          {change.added.map((m) => (
            <span key={`+${m}`} className="inline-block mr-1 text-emerald-700 dark:text-emerald-300">
              +{m}
            </span>
          ))}
          {change.removed.map((m) => (
            <span key={`-${m}`} className="inline-block mr-1 text-rose-700 dark:text-rose-300">
              -{m}
            </span>
          ))}
          <span className="text-muted-foreground"> · {formatPercent(change.overlapRatio)}</span>
        </span>
      }
    />
  );
}

function DiffRow({ label, value }: { label: string; value: ReactNode }): ReactNode {
  return (
    <div className="flex items-baseline gap-2 text-sm">
      <span className="text-xs text-muted-foreground shrink-0 min-w-[10rem]">{label}</span>
      <span className="grow">{value}</span>
    </div>
  );
}

function AgentConfigDiffPanel({
  diff,
  previousVersion,
}: {
  diff: AgentConfigDiffSummary;
  previousVersion: number;
}): ReactNode {
  const { t } = useTranslation('personality');
  const noChange = t('history.diff.unchanged', { defaultValue: 'unchanged' });
  const nullLabel = t('history.diff.none', { defaultValue: '(none)' });

  const fc = diff.fieldChanges;
  return (
    <div className="mt-2 rounded-md border border-border bg-background/60 p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <GitCompareArrows className="w-4 h-4 text-muted-foreground" />
        <span className="text-xs font-semibold text-foreground">
          {t('history.diff.heading', {
            defaultValue: 'Changes from v{{previous}}',
            previous: previousVersion,
          })}
        </span>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-mono ${SEVERITY_PILL[diff.severity]}`}
          aria-label={t('history.diff.severityLabel', { defaultValue: 'Severity' })}
        >
          {t(`history.diff.severity.${diff.severity}`, { defaultValue: diff.severity })}
        </span>
        {diff.flags.map((flag: AgentConfigDiffFlag) => (
          <span
            key={flag}
            className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-mono text-muted-foreground"
          >
            {t(`history.diff.flag.${flag}`, { defaultValue: flag })}
          </span>
        ))}
      </div>
      <div className="space-y-1.5">
        <StringChangeRow
          label={t('history.diff.fields.systemPrompt', { defaultValue: 'System prompt' })}
          change={fc.systemPrompt}
          noChangeLabel={noChange}
        />
        <StringChangeRow
          label={t('history.diff.fields.personality', { defaultValue: 'Personality' })}
          change={fc.personality}
          noChangeLabel={noChange}
        />
        <ScalarChangeRow
          label={t('history.diff.fields.declaredModel', { defaultValue: 'Declared model' })}
          change={fc.declaredModel}
          noChangeLabel={noChange}
          nullLabel={nullLabel}
        />
        <NumericChangeRow
          label={t('history.diff.fields.cycleIntervalMs', { defaultValue: 'Cycle interval' })}
          change={fc.cycleIntervalMs}
          noChangeLabel={noChange}
          format={formatCycle}
        />
        <ScalarChangeRow
          label={t('history.diff.fields.personalityTemplate', { defaultValue: 'Personality template' })}
          change={fc.personalityTemplate}
          noChangeLabel={noChange}
          nullLabel={nullLabel}
        />
        <ArrayChangeRow
          label={t('history.diff.fields.allowedActionTypes', { defaultValue: 'Allowed actions' })}
          change={fc.allowedActionTypes}
          noChangeLabel={noChange}
        />
        <ArrayChangeRow
          label={t('history.diff.fields.knowledgeAreas', { defaultValue: 'Knowledge areas' })}
          change={fc.knowledgeAreas}
          noChangeLabel={noChange}
        />
        <ArrayChangeRow
          label={t('history.diff.fields.toneDescriptors', { defaultValue: 'Tone descriptors' })}
          change={fc.toneDescriptors}
          noChangeLabel={noChange}
        />
        <ArrayChangeRow
          label={t('history.diff.fields.personalityTemplateMixins', { defaultValue: 'Template mixins' })}
          change={fc.personalityTemplateMixins}
          noChangeLabel={noChange}
        />
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}): ReactNode {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={mono ? 'text-xs font-mono text-foreground break-all' : 'text-sm text-foreground'}>
        {value}
      </div>
    </div>
  );
}

interface VersionItemProps {
  version: AgentConfigVersionWithDiff;
  previousVersion: number | null;
  isCurrent: boolean;
  locale: string;
}

function VersionItem({ version, previousVersion, isCurrent, locale }: VersionItemProps): ReactNode {
  const { t } = useTranslation('personality');
  const [open, setOpen] = useState(false);
  const Caret = open ? ChevronDown : ChevronRight;

  return (
    <li className="border border-border rounded-md bg-card/40">
      <button
        type="button"
        className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-card/60 transition-colors"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <Caret className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-mono text-muted-foreground shrink-0">
          v{version.version}
        </span>
        {isCurrent && (
          <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-mono text-emerald-700 dark:text-emerald-300 shrink-0">
            {t('history.currentBadge', { defaultValue: 'current' })}
          </span>
        )}
        <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">
          {formatTimestamp(version.createdAt, locale)}
        </span>
        <span className="text-sm text-foreground truncate ml-auto">
          {version.editReason !== null && version.editReason !== '' ? (
            version.editReason
          ) : (
            <span className="italic text-muted-foreground">
              {t('history.noReason', { defaultValue: 'No edit reason recorded' })}
            </span>
          )}
        </span>
      </button>

      {open && (
        <div className="px-4 pt-2 pb-3 border-t border-border space-y-2 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Field
              label={t('history.fields.declaredModel', { defaultValue: 'Declared model' })}
              value={
                version.declaredModelVersion === null
                  ? version.declaredModel
                  : `${version.declaredModel} (${version.declaredModelVersion})`
              }
            />
            <Field
              label={t('history.fields.cycleInterval', { defaultValue: 'Cycle interval' })}
              value={formatCycle(version.cycleIntervalMs)}
            />
            <Field
              label={t('history.fields.template', { defaultValue: 'Template' })}
              value={version.personalityTemplate ?? '—'}
              mono
            />
            <Field
              label={t('history.fields.mixins', { defaultValue: 'Mixins' })}
              value={
                version.personalityTemplateMixins.length === 0
                  ? '—'
                  : version.personalityTemplateMixins.join(', ')
              }
              mono
            />
            <Field
              label={t('history.fields.knowledgeAreas', { defaultValue: 'Knowledge areas' })}
              value={
                version.knowledgeAreas.length === 0 ? '—' : version.knowledgeAreas.join(', ')
              }
            />
            <Field
              label={t('history.fields.toneDescriptors', { defaultValue: 'Tone descriptors' })}
              value={
                version.toneDescriptors.length === 0 ? '—' : version.toneDescriptors.join(', ')
              }
            />
          </div>
          <Field
            label={t('history.fields.allowedActions', { defaultValue: 'Allowed actions' })}
            value={version.allowedActionTypes.join(', ')}
            mono
          />
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              {t('history.preview.systemPrompt', { defaultValue: 'System prompt' })} (
              {version.systemPrompt.length} chars)
            </summary>
            <pre className="mt-1 whitespace-pre-wrap text-foreground text-xs">
              {truncate(version.systemPrompt, 800)}
            </pre>
          </details>
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              {t('history.preview.personality', { defaultValue: 'Personality (composed)' })} (
              {version.personality.length} chars)
            </summary>
            <pre className="mt-1 whitespace-pre-wrap text-foreground text-xs">
              {truncate(version.personality, 800)}
            </pre>
          </details>
          <div className="text-xs text-muted-foreground sm:hidden">
            {formatTimestamp(version.createdAt, locale)}
          </div>
          <div className="text-xs text-muted-foreground font-mono break-all">
            {version.configHash}
          </div>
          {version.changesFromPrevious !== null && previousVersion !== null && (
            <AgentConfigDiffPanel
              diff={version.changesFromPrevious}
              previousVersion={previousVersion}
            />
          )}
        </div>
      )}
    </li>
  );
}

export function AgentConfigHistorySection(): ReactNode {
  const { t, i18n } = useTranslation('personality');
  const { data, loading, error } = useQuery<
    MyAgentConfigHistoryQueryData,
    MyAgentConfigHistoryQueryVars
  >(MY_AGENT_CONFIG_HISTORY_QUERY, {
    fetchPolicy: 'cache-and-network',
    variables: { limit: 20 },
  });

  const history = data?.myAgentConfigHistory ?? [];

  // Self-hide cases:
  //  - First fetch in progress and no cached data yet: render nothing
  //    (the AgentConfigSection above already covers the loading state
  //    for the active row; a second skeleton is noisy).
  //  - Server returned [] (no agent / no config): nothing to show.
  //  - Single v1 row: a "history" of one is not history; the picker
  //    above already surfaces that single version.
  //  - Apollo error: non-fatal here. The picker is the primary surface;
  //    if listing the past silently fails, we don't block the page.
  if (loading && history.length === 0) return null;
  if (error !== undefined) return null;
  if (history.length < 2) return null;

  const currentId = history[0]?.id ?? null;

  return (
    <div className="bg-card p-6 rounded-lg shadow-sm border border-border space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-display font-bold text-foreground flex items-center gap-2">
          <History className="w-5 h-5" />
          {t('history.heading', { defaultValue: 'Config history' })}
        </h2>
        <span
          className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-mono text-muted-foreground"
          aria-label={t('history.countLabel', { defaultValue: 'Total versions' })}
        >
          {t('history.count', {
            defaultValue: '{{count}} versions',
            count: history.length,
          })}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">
        {t('history.subtitle', {
          defaultValue:
            'Past runtime configurations recorded with each save. The active version is at the top; older ones remain accessible read-only.',
        })}
      </p>

      <ul className="space-y-2">
        {history.map((v, idx) => {
          // Server returns the list ordered by version DESC. The
          // immediate predecessor of `v` (vN) is `v(N-1)`, which lives
          // at `idx + 1` in the array. Use that for the panel heading;
          // fall back to `v.version - 1` when the predecessor isn't in
          // the current page (we still have the diff payload from
          // server-side, so the heading can still surface "from vN-1").
          const next = history[idx + 1];
          const previousVersion =
            v.changesFromPrevious === null
              ? null
              : next !== undefined
                ? next.version
                : v.version - 1;
          return (
            <VersionItem
              key={v.id}
              version={v}
              previousVersion={previousVersion}
              isCurrent={v.id === currentId}
              locale={i18n.language}
            />
          );
        })}
      </ul>
    </div>
  );
}
