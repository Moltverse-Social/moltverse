/**
 * Admin Compose-hashes section — Fase 12.
 *
 * Two surfaces:
 *
 *  - **Add** — extend the verifier whitelist with a new approved
 *    compose-hash. Validates shape client-side (`0x` + 64 hex chars)
 *    so the API doesn't need a roundtrip for malformed input. After
 *    a successful add we refetch the list query.
 *  - **List + Deprecate** — table backed by `approvedComposeHashes`
 *    query (sorted by addedAt desc, capped at 100). Each row exposes
 *    a deprecate button (only when not yet deprecated) that opens a
 *    confirmation dialog before sending the mutation; on success the
 *    same query is refetched to surface `deprecatedAt` +
 *    `deprecationGraceUntil` inline.
 *
 * The compose-hash list is the ONE listing surface admin gets in Fase
 * 12 (other sections operate by ID). Justification: the verifier
 * whitelist is the product itself — without a list view the section
 * is unusable. Other ops (revoke invite, invalidate attestation)
 * have enough external observability (Sentry, logs) for ID-based
 * operation to suffice for now.
 */

import { useMutation, useQuery } from '@apollo/client';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';

import { Input } from '../../../components/ui/input';
import { Textarea } from '../../../components/ui/textarea';
import { Label } from '../../../components/ui/label';
import { Button } from '../../../components/common/Button';
import { ConfirmModal } from '../../../components/common/Modal';
import { useToast } from '../../../components/ui/use-toast';
import { useConfirmDialog } from '../../../hooks/useConfirmDialog';
import {
  APPROVED_COMPOSE_HASHES_QUERY,
  type ApprovedComposeHashesData,
  type ApprovedComposeHashSummary,
} from '../../../graphql/queries/admin';
import {
  ADD_APPROVED_COMPOSE_HASH_MUTATION,
  DEPRECATE_COMPOSE_HASH_MUTATION,
  type AddApprovedComposeHashData,
  type AddApprovedComposeHashVars,
  type DeprecateComposeHashData,
  type DeprecateComposeHashVars,
} from '../../../graphql/mutations/admin';

interface AddForm {
  composeHash: string;
  label: string;
  notes: string;
}

const COMPOSE_HASH_PATTERN = /^0x[0-9a-f]{64}$/;

function formatDate(iso: string | null): string {
  if (iso === null) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

function truncate(hash: string, head = 10, tail = 8): string {
  if (hash.length <= head + tail + 3) return hash;
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}

export function ComposeHashesSection() {
  const { t } = useTranslation('admin');
  const { toast } = useToast();
  const { confirm, dialogProps } = useConfirmDialog();

  const { data, loading, error, refetch } = useQuery<ApprovedComposeHashesData>(
    APPROVED_COMPOSE_HASHES_QUERY,
    { fetchPolicy: 'cache-and-network' },
  );

  const addForm = useForm<AddForm>({
    defaultValues: { composeHash: '', label: '', notes: '' },
  });

  const [addHash, { loading: adding }] = useMutation<
    AddApprovedComposeHashData,
    AddApprovedComposeHashVars
  >(ADD_APPROVED_COMPOSE_HASH_MUTATION, {
    onCompleted: async (mutData) => {
      const r = mutData.addApprovedComposeHash;
      if (r.success) {
        toast({
          title: t('composeHashes.add.successTitle', 'Compose hash added'),
          description: r.label ?? '',
          variant: 'success',
        });
        addForm.reset();
        await refetch();
      } else {
        toast({
          title: t('composeHashes.add.errorTitle', 'Add failed'),
          description: r.error ?? t('common:errors.unknown', 'Unknown error'),
          variant: 'destructive',
        });
      }
    },
    onError: (err) => {
      toast({
        title: t('composeHashes.add.errorTitle', 'Add failed'),
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  const [deprecate, { loading: deprecating }] = useMutation<
    DeprecateComposeHashData,
    DeprecateComposeHashVars
  >(DEPRECATE_COMPOSE_HASH_MUTATION, {
    onCompleted: async (mutData) => {
      const r = mutData.deprecateComposeHash;
      if (r.success) {
        toast({
          title: t('composeHashes.deprecate.successTitle', 'Compose hash deprecated'),
          description: t(
            'composeHashes.deprecate.successDesc',
            'Grace ends {{date}}',
            { date: formatDate(r.deprecationGraceUntil) },
          ),
          variant: 'success',
        });
        await refetch();
      } else {
        toast({
          title: t('composeHashes.deprecate.errorTitle', 'Deprecate failed'),
          description: r.error ?? t('common:errors.unknown', 'Unknown error'),
          variant: 'destructive',
        });
      }
    },
    onError: (err) => {
      toast({
        title: t('composeHashes.deprecate.errorTitle', 'Deprecate failed'),
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  const onSubmitAdd = addForm.handleSubmit((values) => {
    const hash = values.composeHash.trim().toLowerCase();
    if (!COMPOSE_HASH_PATTERN.test(hash)) {
      toast({
        title: t('composeHashes.add.malformedTitle', 'Malformed hash'),
        description: t(
          'composeHashes.add.malformedDesc',
          'Expected 0x + 64 lowercase hex characters.',
        ),
        variant: 'destructive',
      });
      return;
    }
    void addHash({
      variables: {
        composeHash: hash,
        label: values.label.trim(),
        notes: values.notes.trim() === '' ? null : values.notes.trim(),
      },
    });
  });

  const handleDeprecate = async (entry: ApprovedComposeHashSummary): Promise<void> => {
    const ok = await confirm({
      title: t('composeHashes.deprecate.confirmTitle', 'Deprecate compose hash?'),
      message: t(
        'composeHashes.deprecate.confirmMessage',
        'Quotes for {{label}} keep verifying for 90 days, then start failing. Reversible only via a new add.',
        { label: entry.label },
      ),
      confirmKey: 'common:confirm.yes',
      cancelKey: 'common:confirm.no',
    });
    if (!ok) return;
    void deprecate({ variables: { id: entry.id } });
  };

  const rows = data?.approvedComposeHashes ?? [];

  return (
    <div className="flex flex-col gap-8">
      <section className="bg-card rounded-xl border border-border p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-foreground mb-4">
          {t('composeHashes.add.title', 'Add approved compose hash')}
        </h3>
        <form onSubmit={onSubmitAdd} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-3">
            <Label htmlFor="ch-hash">{t('composeHashes.add.hashLabel', 'Compose hash')}</Label>
            <Input
              id="ch-hash"
              placeholder="0x… (66 chars total)"
              className="font-mono"
              {...addForm.register('composeHash', { required: true })}
            />
          </div>
          <div className="md:col-span-1">
            <Label htmlFor="ch-label">{t('composeHashes.add.labelLabel', 'Label')}</Label>
            <Input
              id="ch-label"
              placeholder={t('composeHashes.add.labelPlaceholder', 'production-v1.0')}
              {...addForm.register('label', { required: true })}
            />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="ch-notes">{t('composeHashes.add.notesLabel', 'Notes (optional)')}</Label>
            <Textarea
              id="ch-notes"
              rows={2}
              placeholder={t('composeHashes.add.notesPlaceholder', 'Image source / build context')}
              {...addForm.register('notes')}
            />
          </div>
          <div className="md:col-span-3 flex justify-end">
            <Button type="submit" variant="primary" isLoading={adding}>
              {t('composeHashes.add.submit', 'Add to whitelist')}
            </Button>
          </div>
        </form>
      </section>

      <section className="bg-card rounded-xl border border-border p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">
            {t('composeHashes.list.title', 'Whitelist (newest first)')}
          </h3>
          <span className="text-xs text-muted-foreground">
            {t('composeHashes.list.count', '{{count}} entries', { count: rows.length })}
          </span>
        </div>
        {loading && rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('common:loading', 'Loading…')}</p>
        ) : error ? (
          <p className="text-sm text-destructive">{error.message}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('composeHashes.list.empty', 'No approved compose-hashes yet. Add one above.')}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left">
                <tr>
                  <th className="p-3 font-medium text-muted-foreground">{t('composeHashes.list.thHash', 'Hash')}</th>
                  <th className="p-3 font-medium text-muted-foreground">{t('composeHashes.list.thLabel', 'Label')}</th>
                  <th className="p-3 font-medium text-muted-foreground">{t('composeHashes.list.thAdded', 'Added')}</th>
                  <th className="p-3 font-medium text-muted-foreground">{t('composeHashes.list.thStatus', 'Status')}</th>
                  <th className="p-3 font-medium text-muted-foreground text-right">
                    {t('composeHashes.list.thActions', 'Actions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isDeprecated = row.deprecatedAt !== null;
                  return (
                    <tr key={row.id} className="border-t border-border hover:bg-muted/50">
                      <td className="p-3 font-mono text-xs" title={row.composeHash}>
                        {truncate(row.composeHash)}
                      </td>
                      <td className="p-3 text-foreground">{row.label}</td>
                      <td className="p-3 text-muted-foreground">{formatDate(row.addedAt)}</td>
                      <td className="p-3">
                        {isDeprecated ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                            {t('composeHashes.list.statusDeprecated', 'Deprecated · grace until')}{' '}
                            {formatDate(row.deprecationGraceUntil)}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                            {t('composeHashes.list.statusActive', 'Active')}
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        {!isDeprecated && (
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            isLoading={deprecating}
                            onClick={() => {
                              void handleDeprecate(row);
                            }}
                          >
                            {t('composeHashes.list.deprecate', 'Deprecate')}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ConfirmModal
        isOpen={dialogProps.isOpen}
        onClose={dialogProps.onCancel}
        onConfirm={dialogProps.onConfirm}
        title={dialogProps.title}
        message={dialogProps.message}
        confirmLabel={dialogProps.confirmLabel}
        cancelLabel={dialogProps.cancelLabel}
        variant="danger"
        isLoading={deprecating}
      />
    </div>
  );
}
