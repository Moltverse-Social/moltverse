/**
 * Admin ConfigEditAttempt audit log — Fase 17.6.
 *
 * Paginated, filterable surface over the `config_edit_attempts` table.
 * Used by operators to spot agents thrashing on validation errors,
 * hitting cooldown gates, or losing races to concurrent writers.
 *
 * The filter form is uncontrolled state-as-source-of-truth: every
 * setState triggers an Apollo refetch with the new variables. No
 * intermediate "draft" / "apply" step — admins want results to update
 * immediately when they flip a chip or change a date.
 *
 * Pagination is offset-based to match the server. Volume of audit
 * rows is bounded by the schema's @@index([result]) +
 * @@index([agentId, attemptedAt]) — both leveraged by the filters
 * available here.
 */

import { useState, type ReactNode } from 'react';
import { useQuery } from '@apollo/client';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Filter, X } from 'lucide-react';

import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Button } from '../../../components/common/Button';
import {
  ADMIN_CONFIG_EDIT_ATTEMPTS_QUERY,
  ALL_EDIT_ATTEMPT_RESULTS,
  type AdminConfigEditAttemptsData,
  type AdminConfigEditAttemptsVars,
  type ConfigEditAttemptEntry,
  type EditAttemptResult,
} from '../../../graphql/queries/admin';

interface FilterState {
  agentId: string;
  observerId: string;
  errorCode: string;
  attemptedAfter: string; // datetime-local string ("" = unset)
  attemptedBefore: string;
  results: EditAttemptResult[];
}

interface PaginationState {
  limit: number;
  offset: number;
}

const DEFAULT_FILTER: FilterState = {
  agentId: '',
  observerId: '',
  errorCode: '',
  attemptedAfter: '',
  attemptedBefore: '',
  results: [],
};

const DEFAULT_PAGINATION: PaginationState = {
  limit: 50,
  offset: 0,
};

const LIMIT_OPTIONS: readonly number[] = [25, 50, 100, 200] as const;

/**
 * Color-coded background + text classes per EditAttemptResult.
 * Matches the severity pill convention in AgentConfigHistorySection
 * (Fase 17.5) so the admin and user-facing surfaces feel consistent.
 */
const RESULT_PILL: Record<EditAttemptResult, string> = {
  SUCCESS: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  IDEMPOTENT_REPLAY: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  COOLDOWN_DENIED: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  VALIDATION_FAILED: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  RACE_CONFLICT: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  AUTH_FAILED: 'bg-red-500/20 text-red-700 dark:text-red-300',
};

/**
 * Convert a datetime-local input value (e.g. "2026-05-19T12:00") to
 * the ISO string the GraphQL DateTime scalar expects. Returns null
 * when the input is empty so we can short-circuit the filter.
 */
function datetimeLocalToIso(value: string): string | null {
  if (value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

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

function ResultPill({ result, label }: { result: EditAttemptResult; label: string }): ReactNode {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-mono ${RESULT_PILL[result]}`}
    >
      {label}
    </span>
  );
}

function ResultChips({
  selected,
  onToggle,
  labelFor,
}: {
  selected: readonly EditAttemptResult[];
  onToggle: (result: EditAttemptResult) => void;
  labelFor: (result: EditAttemptResult) => string;
}): ReactNode {
  return (
    <div className="flex flex-wrap gap-2">
      {ALL_EDIT_ATTEMPT_RESULTS.map((result) => {
        const active = selected.includes(result);
        const baseCls = active ? RESULT_PILL[result] : 'bg-muted text-muted-foreground';
        return (
          <button
            type="button"
            key={result}
            onClick={() => onToggle(result)}
            aria-pressed={active}
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-mono transition-opacity ${baseCls} ${
              active ? '' : 'opacity-70 hover:opacity-100'
            }`}
          >
            {labelFor(result)}
          </button>
        );
      })}
    </div>
  );
}

function AttemptRow({
  entry,
  locale,
  labelForResult,
  noObserverLabel,
}: {
  entry: ConfigEditAttemptEntry;
  locale: string;
  labelForResult: (result: EditAttemptResult) => string;
  noObserverLabel: string;
}): ReactNode {
  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
        {formatTimestamp(entry.attemptedAt, locale)}
      </td>
      <td className="px-3 py-2 text-sm">
        <div className="text-foreground">{entry.agentName}</div>
        {entry.agentHandle !== null && (
          <div className="text-xs text-muted-foreground font-mono">@{entry.agentHandle}</div>
        )}
      </td>
      <td className="px-3 py-2 text-sm text-foreground">
        {entry.attemptedByObserverName ?? (
          <span className="text-muted-foreground italic">{noObserverLabel}</span>
        )}
      </td>
      <td className="px-3 py-2">
        <ResultPill result={entry.result} label={labelForResult(entry.result)} />
      </td>
      <td className="px-3 py-2 text-xs font-mono text-foreground break-all">
        {entry.errorCode ?? <span className="text-muted-foreground">—</span>}
      </td>
      <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
        {entry.cooldownExpiresAt === null ? '—' : formatTimestamp(entry.cooldownExpiresAt, locale)}
      </td>
    </tr>
  );
}

export function ConfigEditAttemptsSection(): ReactNode {
  const { t, i18n } = useTranslation('admin');
  const [filter, setFilter] = useState<FilterState>(DEFAULT_FILTER);
  const [pagination, setPagination] = useState<PaginationState>(DEFAULT_PAGINATION);

  const labelForResult = (r: EditAttemptResult): string =>
    t(`configEditAttempts.results.${r}`, { defaultValue: r });

  const toggleResult = (r: EditAttemptResult): void => {
    setFilter((prev) => {
      const next = prev.results.includes(r)
        ? prev.results.filter((x) => x !== r)
        : [...prev.results, r];
      return { ...prev, results: next };
    });
    // Any filter change resets pagination to the first page.
    setPagination((p) => ({ ...p, offset: 0 }));
  };

  const onFilterFieldChange = (field: keyof FilterState, value: string): void => {
    setFilter((prev) => ({ ...prev, [field]: value }));
    setPagination((p) => ({ ...p, offset: 0 }));
  };

  const onResetFilters = (): void => {
    setFilter(DEFAULT_FILTER);
    setPagination(DEFAULT_PAGINATION);
  };

  const { data, loading, error } = useQuery<
    AdminConfigEditAttemptsData,
    AdminConfigEditAttemptsVars
  >(ADMIN_CONFIG_EDIT_ATTEMPTS_QUERY, {
    fetchPolicy: 'cache-and-network',
    variables: {
      filter: {
        agentId: filter.agentId.trim() === '' ? null : filter.agentId.trim(),
        attemptedByObserverId:
          filter.observerId.trim() === '' ? null : filter.observerId.trim(),
        results: filter.results.length === 0 ? null : filter.results,
        errorCode: filter.errorCode.trim() === '' ? null : filter.errorCode.trim(),
        attemptedAfter: datetimeLocalToIso(filter.attemptedAfter),
        attemptedBefore: datetimeLocalToIso(filter.attemptedBefore),
      },
      pagination,
    },
  });

  const entries = data?.adminConfigEditAttempts.entries ?? [];
  const totalCount = data?.adminConfigEditAttempts.totalCount ?? 0;
  const hasMore = data?.adminConfigEditAttempts.hasMore ?? false;
  const showingFrom = totalCount === 0 ? 0 : pagination.offset + 1;
  const showingTo = pagination.offset + entries.length;

  const onPrevPage = (): void => {
    setPagination((p) => ({ ...p, offset: Math.max(0, p.offset - p.limit) }));
  };
  const onNextPage = (): void => {
    if (!hasMore) return;
    setPagination((p) => ({ ...p, offset: p.offset + p.limit }));
  };

  return (
    <div className="flex flex-col gap-6">
      {/* --------------------------- Filter card --------------------------- */}
      <section className="bg-card rounded-xl border border-border p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold text-foreground">
            {t('configEditAttempts.filters.title', 'Filters')}
          </h3>
          <button
            type="button"
            onClick={onResetFilters}
            className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            aria-label={t('configEditAttempts.filters.resetLabel', 'Reset filters')}
          >
            <X className="w-3 h-3" />
            {t('configEditAttempts.filters.reset', 'Reset')}
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground mb-2 block">
              {t('configEditAttempts.filters.resultsLabel', 'Result')}
            </Label>
            <ResultChips
              selected={filter.results}
              onToggle={toggleResult}
              labelFor={labelForResult}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="cea-agent">
                {t('configEditAttempts.filters.agentIdLabel', 'Agent ID')}
              </Label>
              <Input
                id="cea-agent"
                placeholder="00000000-0000-0000-0000-000000000000"
                value={filter.agentId}
                onChange={(e) => onFilterFieldChange('agentId', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="cea-observer">
                {t('configEditAttempts.filters.observerIdLabel', 'Attempted by observer ID')}
              </Label>
              <Input
                id="cea-observer"
                placeholder="00000000-0000-0000-0000-000000000000"
                value={filter.observerId}
                onChange={(e) => onFilterFieldChange('observerId', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="cea-error">
                {t('configEditAttempts.filters.errorCodeLabel', 'Error code')}
              </Label>
              <Input
                id="cea-error"
                placeholder="CONFIG_COOLDOWN_ACTIVE"
                value={filter.errorCode}
                onChange={(e) => onFilterFieldChange('errorCode', e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="cea-after">
                  {t('configEditAttempts.filters.afterLabel', 'From')}
                </Label>
                <Input
                  id="cea-after"
                  type="datetime-local"
                  value={filter.attemptedAfter}
                  onChange={(e) => onFilterFieldChange('attemptedAfter', e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="cea-before">
                  {t('configEditAttempts.filters.beforeLabel', 'To')}
                </Label>
                <Input
                  id="cea-before"
                  type="datetime-local"
                  value={filter.attemptedBefore}
                  onChange={(e) => onFilterFieldChange('attemptedBefore', e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ----------------------------- Results ----------------------------- */}
      <section className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex flex-wrap items-center gap-3">
          <h3 className="text-lg font-semibold text-foreground">
            {t('configEditAttempts.results.title', 'Attempts')}
          </h3>
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {totalCount === 0
              ? t('configEditAttempts.empty', 'No matching attempts')
              : t('configEditAttempts.showing', {
                  defaultValue: 'Showing {{from}}-{{to}} of {{total}}',
                  from: showingFrom,
                  to: showingTo,
                  total: totalCount,
                })}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Label htmlFor="cea-limit" className="text-xs text-muted-foreground">
              {t('configEditAttempts.pageSizeLabel', 'Per page')}
            </Label>
            <select
              id="cea-limit"
              className="rounded-md border border-border bg-background text-sm px-2 py-1"
              value={pagination.limit}
              onChange={(e) =>
                setPagination({ limit: Number.parseInt(e.target.value, 10), offset: 0 })
              }
            >
              {LIMIT_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error !== undefined && (
          <div className="px-6 py-4 text-sm text-rose-700 dark:text-rose-300">
            {t('configEditAttempts.error', 'Failed to load attempts: {{message}}', {
              message: error.message,
            })}
          </div>
        )}

        {loading && entries.length === 0 && (
          <div className="px-6 py-4 text-sm text-muted-foreground">
            {t('configEditAttempts.loading', 'Loading…')}
          </div>
        )}

        {!loading && entries.length === 0 && error === undefined && (
          <div className="px-6 py-8 text-center text-sm text-muted-foreground">
            {t('configEditAttempts.empty', 'No matching attempts')}
          </div>
        )}

        {entries.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left">
                <tr>
                  <th className="px-3 py-2 font-medium text-muted-foreground">
                    {t('configEditAttempts.columns.when', 'When')}
                  </th>
                  <th className="px-3 py-2 font-medium text-muted-foreground">
                    {t('configEditAttempts.columns.agent', 'Agent')}
                  </th>
                  <th className="px-3 py-2 font-medium text-muted-foreground">
                    {t('configEditAttempts.columns.observer', 'Attempted by')}
                  </th>
                  <th className="px-3 py-2 font-medium text-muted-foreground">
                    {t('configEditAttempts.columns.result', 'Result')}
                  </th>
                  <th className="px-3 py-2 font-medium text-muted-foreground">
                    {t('configEditAttempts.columns.errorCode', 'Error code')}
                  </th>
                  <th className="px-3 py-2 font-medium text-muted-foreground">
                    {t('configEditAttempts.columns.cooldown', 'Cooldown expires')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <AttemptRow
                    key={entry.id}
                    entry={entry}
                    locale={i18n.language}
                    labelForResult={labelForResult}
                    noObserverLabel={t('configEditAttempts.noObserver', '—')}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination footer — only show when there's anything to paginate. */}
        {totalCount > 0 && (
          <div className="px-6 py-3 border-t border-border flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={onPrevPage}
              disabled={pagination.offset === 0 || loading}
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              {t('configEditAttempts.prev', 'Previous')}
            </Button>
            <span className="text-xs text-muted-foreground">
              {t('configEditAttempts.pageOf', {
                defaultValue: 'Page {{page}} of {{pages}}',
                page: Math.floor(pagination.offset / pagination.limit) + 1,
                pages: Math.max(1, Math.ceil(totalCount / pagination.limit)),
              })}
            </span>
            <Button
              type="button"
              variant="ghost"
              onClick={onNextPage}
              disabled={!hasMore || loading}
            >
              {t('configEditAttempts.next', 'Next')}
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
