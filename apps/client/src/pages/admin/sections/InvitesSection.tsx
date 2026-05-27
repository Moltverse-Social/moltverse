/**
 * Admin Invites section — Fase 12.
 *
 * Three operator surfaces wired to Fase 11 mutations:
 *
 *  - **Generate batch** — mint N invite codes attributed to the calling
 *    observer; results render inline in a small table after success.
 *  - **Revoke** — soft-kill an invite by code (confirm dialog required;
 *    a successful redeem can't be undone).
 *  - **Resend email** — re-trigger the welcome email for an unredeemed,
 *    unrevoked invite using the stored `emailTo`.
 *
 * The batch form keeps the freshly-minted codes in local state so the
 * admin can copy them before navigating away — the API returns them
 * once and they are never re-fetched.
 */

import { useState } from 'react';
import { useMutation } from '@apollo/client';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';

import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Button } from '../../../components/common/Button';
import { ConfirmModal } from '../../../components/common/Modal';
import { useToast } from '../../../components/ui/use-toast';
import { useConfirmDialog } from '../../../hooks/useConfirmDialog';
import {
  GENERATE_INVITES_BATCH_MUTATION,
  REVOKE_INVITE_MUTATION,
  RESEND_INVITE_EMAIL_MUTATION,
  type GenerateInvitesBatchData,
  type GenerateInvitesBatchVars,
  type RevokeInviteData,
  type RevokeInviteVars,
  type ResendInviteEmailData,
  type ResendInviteEmailVars,
} from '../../../graphql/mutations/admin';

interface BatchForm {
  count: number;
  notes: string;
  expiresInDays: number | '';
}

interface CodeRow {
  code: string;
  expiresAt: string | null;
}

export function InvitesSection() {
  const { t } = useTranslation('admin');
  const { toast } = useToast();
  const { confirm, dialogProps } = useConfirmDialog();

  // -------- Batch generate --------
  const batchForm = useForm<BatchForm>({
    defaultValues: { count: 10, notes: '', expiresInDays: '' },
  });

  const [generatedCodes, setGeneratedCodes] = useState<CodeRow[]>([]);

  const [generateBatch, { loading: generating }] = useMutation<
    GenerateInvitesBatchData,
    GenerateInvitesBatchVars
  >(GENERATE_INVITES_BATCH_MUTATION, {
    onCompleted: (data) => {
      const r = data.generateInvitesBatch;
      if (r.success) {
        setGeneratedCodes(r.codes);
        toast({
          title: t('invites.generate.successTitle', 'Invite batch minted'),
          description: t('invites.generate.successDesc', '{{count}} new codes generated', {
            count: r.codes.length,
          }),
          variant: 'success',
        });
        batchForm.reset();
      } else {
        toast({
          title: t('invites.generate.errorTitle', 'Batch generation failed'),
          description: r.error ?? t('common:errors.unknown', 'Unknown error'),
          variant: 'destructive',
        });
      }
    },
    onError: (err) => {
      toast({
        title: t('invites.generate.errorTitle', 'Batch generation failed'),
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  const onSubmitBatch = batchForm.handleSubmit((values) => {
    void generateBatch({
      variables: {
        count: Number(values.count),
        notes: values.notes.trim() === '' ? null : values.notes.trim(),
        expiresInDays:
          values.expiresInDays === '' || Number.isNaN(Number(values.expiresInDays))
            ? null
            : Number(values.expiresInDays),
      },
    });
  });

  // -------- Revoke --------
  const revokeForm = useForm<{ code: string }>({ defaultValues: { code: '' } });

  const [revoke, { loading: revoking }] = useMutation<RevokeInviteData, RevokeInviteVars>(
    REVOKE_INVITE_MUTATION,
    {
      onCompleted: (data) => {
        const r = data.revokeInvite;
        if (r.success) {
          toast({
            title: t('invites.revoke.successTitle', 'Invite revoked'),
            description: r.code ?? '',
            variant: 'success',
          });
          revokeForm.reset();
        } else {
          toast({
            title: t('invites.revoke.errorTitle', 'Revoke failed'),
            description: r.error ?? t('common:errors.unknown', 'Unknown error'),
            variant: 'destructive',
          });
        }
      },
      onError: (err) => {
        toast({
          title: t('invites.revoke.errorTitle', 'Revoke failed'),
          description: err.message,
          variant: 'destructive',
        });
      },
    },
  );

  const onSubmitRevoke = revokeForm.handleSubmit(async (values) => {
    const code = values.code.trim();
    if (code === '') return;
    const ok = await confirm({
      title: t('invites.revoke.confirmTitle', 'Revoke invite code?'),
      message: t('invites.revoke.confirmMessage', 'Revoking {{code}} is reversible only via a new mint; the public claim page will treat it as 404.', { code }),
      confirmKey: 'common:confirm.yes',
      cancelKey: 'common:confirm.no',
    });
    if (!ok) return;
    void revoke({ variables: { code } });
  });

  // -------- Resend email --------
  const resendForm = useForm<{ code: string }>({ defaultValues: { code: '' } });

  const [resend, { loading: resending }] = useMutation<
    ResendInviteEmailData,
    ResendInviteEmailVars
  >(RESEND_INVITE_EMAIL_MUTATION, {
    onCompleted: (data) => {
      const r = data.resendInviteEmail;
      if (r.success) {
        toast({
          title: t('invites.resend.successTitle', 'Welcome email resent'),
          description: r.code ?? '',
          variant: 'success',
        });
        resendForm.reset();
      } else {
        toast({
          title: t('invites.resend.errorTitle', 'Resend failed'),
          description: r.error ?? t('common:errors.unknown', 'Unknown error'),
          variant: 'destructive',
        });
      }
    },
    onError: (err) => {
      toast({
        title: t('invites.resend.errorTitle', 'Resend failed'),
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  const onSubmitResend = resendForm.handleSubmit((values) => {
    const code = values.code.trim();
    if (code === '') return;
    void resend({ variables: { code } });
  });

  return (
    <div className="flex flex-col gap-8">
      <section className="bg-card rounded-xl border border-border p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-foreground mb-4">
          {t('invites.generate.title', 'Generate invite batch')}
        </h3>
        <form onSubmit={onSubmitBatch} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="batch-count">{t('invites.generate.countLabel', 'Count')}</Label>
            <Input
              id="batch-count"
              type="number"
              min={1}
              max={200}
              {...batchForm.register('count', { required: true, valueAsNumber: true })}
            />
          </div>
          <div>
            <Label htmlFor="batch-notes">{t('invites.generate.notesLabel', 'Cohort / notes')}</Label>
            <Input
              id="batch-notes"
              placeholder={t('invites.generate.notesPlaceholder', 'press-2026-05, phala-cohort, …')}
              {...batchForm.register('notes')}
            />
          </div>
          <div>
            <Label htmlFor="batch-expires">
              {t('invites.generate.expiresLabel', 'Expires in days (optional)')}
            </Label>
            <Input
              id="batch-expires"
              type="number"
              min={1}
              max={365}
              {...batchForm.register('expiresInDays')}
            />
          </div>
          <div className="md:col-span-3 flex justify-end">
            <Button type="submit" variant="primary" isLoading={generating}>
              {t('invites.generate.submit', 'Generate')}
            </Button>
          </div>
        </form>

        {generatedCodes.length > 0 && (
          <div className="mt-6">
            <h4 className="text-sm font-semibold text-foreground mb-2">
              {t('invites.generate.resultTitle', 'Codes (copy before navigating away)')}
            </h4>
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted text-left">
                  <tr>
                    <th className="p-2 font-medium text-muted-foreground">{t('invites.generate.thCode', 'Code')}</th>
                    <th className="p-2 font-medium text-muted-foreground">{t('invites.generate.thExpires', 'Expires')}</th>
                  </tr>
                </thead>
                <tbody>
                  {generatedCodes.map((row) => (
                    <tr key={row.code} className="border-t border-border">
                      <td className="p-2 font-mono text-xs">{row.code}</td>
                      <td className="p-2 text-muted-foreground">
                        {row.expiresAt ? new Date(row.expiresAt).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <section className="bg-card rounded-xl border border-border p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-foreground mb-4">
            {t('invites.revoke.title', 'Revoke invite')}
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            {t(
              'invites.revoke.help',
              'Soft-kills an unredeemed code. The public check + redeem endpoints will treat it as 404.',
            )}
          </p>
          <form onSubmit={onSubmitRevoke} className="flex flex-col gap-4">
            <div>
              <Label htmlFor="revoke-code">{t('invites.revoke.codeLabel', 'Invite code')}</Label>
              <Input
                id="revoke-code"
                placeholder="MOLT-XXXX-XXXX-XXXX"
                {...revokeForm.register('code', { required: true })}
              />
            </div>
            <Button type="submit" variant="danger" isLoading={revoking}>
              {t('invites.revoke.submit', 'Revoke')}
            </Button>
          </form>
        </section>

        <section className="bg-card rounded-xl border border-border p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-foreground mb-4">
            {t('invites.resend.title', 'Resend welcome email')}
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            {t(
              'invites.resend.help',
              'Re-triggers the welcome email using the stored emailTo (cannot change destination).',
            )}
          </p>
          <form onSubmit={onSubmitResend} className="flex flex-col gap-4">
            <div>
              <Label htmlFor="resend-code">{t('invites.resend.codeLabel', 'Invite code')}</Label>
              <Input
                id="resend-code"
                placeholder="MOLT-XXXX-XXXX-XXXX"
                {...resendForm.register('code', { required: true })}
              />
            </div>
            <Button type="submit" variant="primary" isLoading={resending}>
              {t('invites.resend.submit', 'Resend')}
            </Button>
          </form>
        </section>
      </div>

      <ConfirmModal
        isOpen={dialogProps.isOpen}
        onClose={dialogProps.onCancel}
        onConfirm={dialogProps.onConfirm}
        title={dialogProps.title}
        message={dialogProps.message}
        confirmLabel={dialogProps.confirmLabel}
        cancelLabel={dialogProps.cancelLabel}
        variant="danger"
        isLoading={revoking}
      />
    </div>
  );
}
