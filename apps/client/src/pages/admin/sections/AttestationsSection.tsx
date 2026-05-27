/**
 * Admin Attestations section — Fase 12.
 *
 * Single operator surface: revoke a TEE attestation by ID with a
 * required reason. Sets `status=REVOKED` + `invalidatedAt` +
 * `invalidatedReason` so the audit trail records *why* the admin
 * pulled it. The cron tier-evaluator picks up the change on its next
 * pass and may demote GOLD→SILVER per Camada 4 rules — that flow is
 * intentional, the admin doesn't need to do it manually.
 *
 * Confirmation is required (destructive). Operates by ID since the
 * volume of admin invalidations is expected to be small and listing
 * attestations is deferred to a later phase.
 */

import { useMutation } from '@apollo/client';
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
  INVALIDATE_ATTESTATION_MUTATION,
  type InvalidateAttestationData,
  type InvalidateAttestationVars,
} from '../../../graphql/mutations/admin';

interface InvalidateForm {
  attestationId: string;
  reason: string;
}

export function AttestationsSection() {
  const { t } = useTranslation('admin');
  const { toast } = useToast();
  const { confirm, dialogProps } = useConfirmDialog();

  const form = useForm<InvalidateForm>({
    defaultValues: { attestationId: '', reason: '' },
  });

  const [invalidate, { loading: invalidating }] = useMutation<
    InvalidateAttestationData,
    InvalidateAttestationVars
  >(INVALIDATE_ATTESTATION_MUTATION, {
    onCompleted: (data) => {
      const r = data.invalidateAttestation;
      if (r.success) {
        toast({
          title: t('attestations.invalidate.successTitle', 'Attestation revoked'),
          description: t('attestations.invalidate.successDesc', 'Was {{prev}}, now REVOKED', {
            prev: r.previousStatus ?? '?',
          }),
          variant: 'success',
        });
        form.reset();
      } else {
        toast({
          title: t('attestations.invalidate.errorTitle', 'Invalidate failed'),
          description: r.error ?? t('common:errors.unknown', 'Unknown error'),
          variant: 'destructive',
        });
      }
    },
    onError: (err) => {
      toast({
        title: t('attestations.invalidate.errorTitle', 'Invalidate failed'),
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    const attestationId = values.attestationId.trim();
    const reason = values.reason.trim();
    if (attestationId === '' || reason === '') return;
    const ok = await confirm({
      title: t('attestations.invalidate.confirmTitle', 'Revoke attestation?'),
      message: t(
        'attestations.invalidate.confirmMessage',
        'This flips status to REVOKED. The cron tier-evaluator may demote the agent on its next pass. The action is recorded in invalidatedReason.',
      ),
      confirmKey: 'common:confirm.yes',
      cancelKey: 'common:confirm.no',
    });
    if (!ok) return;
    void invalidate({ variables: { attestationId, reason } });
  });

  return (
    <div>
      <section className="bg-card rounded-xl border border-border p-6 shadow-sm max-w-2xl">
        <h3 className="text-lg font-semibold text-foreground mb-4">
          {t('attestations.invalidate.title', 'Revoke TEE attestation')}
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          {t(
            'attestations.invalidate.help',
            'Forces an attestation row to REVOKED. Cannot be applied to rows that are already SUPERSEDED or INVALID (those are handled by the verifier).',
          )}
        </p>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div>
            <Label htmlFor="att-id">
              {t('attestations.invalidate.idLabel', 'Attestation ID')}
            </Label>
            <Input
              id="att-id"
              placeholder="00000000-0000-0000-0000-000000000000"
              {...form.register('attestationId', { required: true })}
            />
          </div>
          <div>
            <Label htmlFor="att-reason">
              {t('attestations.invalidate.reasonLabel', 'Reason (required, stored on the row)')}
            </Label>
            <Textarea
              id="att-reason"
              placeholder={t(
                'attestations.invalidate.reasonPlaceholder',
                'compose-hash leaked in agent logs, TEE evidence compromised, …',
              )}
              rows={3}
              {...form.register('reason', { required: true })}
            />
          </div>
          <Button type="submit" variant="danger" isLoading={invalidating}>
            {t('attestations.invalidate.submit', 'Revoke')}
          </Button>
        </form>
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
        isLoading={invalidating}
      />
    </div>
  );
}
