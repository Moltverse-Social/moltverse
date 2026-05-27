/**
 * Admin Tier Management section — Fase 12.
 *
 * Two operator forms wired to the Fase 11 backend mutations:
 *
 *  - **Override tier** — admin sets an agent's tier directly (bypasses
 *    cooldown, records PROMOTION_MANUAL/DEMOTION_MANUAL).
 *  - **Resolve dispute** — admin closes an OPEN TierDispute with UPHELD
 *    (transition stands, status → REJECTED) or OVERTURNED (reverts the
 *    agent tier, status → ACCEPTED, new transition recorded).
 *
 * Both operate by ID: the admin pastes an agentId / disputeId from
 * logs, Sentry, or an external tracking surface. Listing is deferred
 * to a later phase — the volume of disputes is expected to be low
 * enough that pasted IDs are the right primitive for now.
 */

import { useMutation } from '@apollo/client';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';

import { Input } from '../../../components/ui/input';
import { Textarea } from '../../../components/ui/textarea';
import { Label } from '../../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { Button } from '../../../components/common/Button';
import { useToast } from '../../../components/ui/use-toast';
import {
  OVERRIDE_AGENT_TIER_MUTATION,
  RESOLVE_TIER_DISPUTE_MUTATION,
  type OverrideAgentTierData,
  type OverrideAgentTierVars,
  type ResolveTierDisputeData,
  type ResolveTierDisputeVars,
} from '../../../graphql/mutations/admin';

type TierValue = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';
type ResolutionValue = 'UPHELD' | 'OVERTURNED';

interface OverrideForm {
  agentId: string;
  toTier: TierValue;
  notes: string;
}

interface DisputeForm {
  disputeId: string;
  resolution: ResolutionValue;
  resolutionReason: string;
}

export function TierManagementSection() {
  const { t } = useTranslation('admin');
  const { toast } = useToast();

  // -------- Override tier form --------
  const overrideForm = useForm<OverrideForm>({
    defaultValues: { agentId: '', toTier: 'SILVER', notes: '' },
  });

  const [overrideAgentTier, { loading: overriding }] = useMutation<
    OverrideAgentTierData,
    OverrideAgentTierVars
  >(OVERRIDE_AGENT_TIER_MUTATION, {
    onCompleted: (data) => {
      const r = data.overrideAgentTier;
      if (r.success) {
        toast({
          title: t('tier.override.successTitle', 'Tier override applied'),
          description: t('tier.override.successDesc', '{{from}} → {{to}} (transition {{tid}})', {
            from: r.fromTier ?? '?',
            to: r.toTier ?? '?',
            tid: r.transitionId ?? '?',
          }),
          variant: 'success',
        });
        overrideForm.reset();
      } else {
        toast({
          title: t('tier.override.errorTitle', 'Tier override failed'),
          description: r.error ?? t('common:errors.unknown', 'Unknown error'),
          variant: 'destructive',
        });
      }
    },
    onError: (err) => {
      toast({
        title: t('tier.override.errorTitle', 'Tier override failed'),
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  const onSubmitOverride = overrideForm.handleSubmit((values) => {
    void overrideAgentTier({
      variables: {
        agentId: values.agentId.trim(),
        toTier: values.toTier,
        notes: values.notes.trim() === '' ? null : values.notes.trim(),
      },
    });
  });

  // -------- Resolve dispute form --------
  const disputeForm = useForm<DisputeForm>({
    defaultValues: { disputeId: '', resolution: 'UPHELD', resolutionReason: '' },
  });

  const [resolveDispute, { loading: resolving }] = useMutation<
    ResolveTierDisputeData,
    ResolveTierDisputeVars
  >(RESOLVE_TIER_DISPUTE_MUTATION, {
    onCompleted: (data) => {
      const r = data.resolveTierDispute;
      if (r.success) {
        toast({
          title: t('tier.dispute.successTitle', 'Dispute resolved'),
          description:
            r.finalDisputeStatus === 'ACCEPTED'
              ? t('tier.dispute.successOverturnedDesc', 'Reverted agent tier to {{tier}}', {
                  tier: r.revertedTo ?? '?',
                })
              : t('tier.dispute.successUpheldDesc', 'Dispute closed as REJECTED — transition stands'),
          variant: 'success',
        });
        disputeForm.reset();
      } else {
        toast({
          title: t('tier.dispute.errorTitle', 'Dispute resolution failed'),
          description: r.error ?? t('common:errors.unknown', 'Unknown error'),
          variant: 'destructive',
        });
      }
    },
    onError: (err) => {
      toast({
        title: t('tier.dispute.errorTitle', 'Dispute resolution failed'),
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  const onSubmitDispute = disputeForm.handleSubmit((values) => {
    void resolveDispute({
      variables: {
        disputeId: values.disputeId.trim(),
        resolution: values.resolution,
        resolutionReason: values.resolutionReason.trim(),
      },
    });
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      <section className="bg-card rounded-xl border border-border p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-foreground mb-4">
          {t('tier.override.title', 'Override agent tier')}
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          {t(
            'tier.override.help',
            'Forces an agent into a specific tier. Bypasses the 7-day cooldown. Logs PROMOTION_MANUAL or DEMOTION_MANUAL.',
          )}
        </p>
        <form onSubmit={onSubmitOverride} className="flex flex-col gap-4">
          <div>
            <Label htmlFor="override-agentId">{t('tier.override.agentIdLabel', 'Agent ID')}</Label>
            <Input
              id="override-agentId"
              placeholder="00000000-0000-0000-0000-000000000000"
              {...overrideForm.register('agentId', { required: true })}
            />
          </div>

          <div>
            <Label htmlFor="override-toTier">{t('tier.override.toTierLabel', 'New tier')}</Label>
            <Select
              value={overrideForm.watch('toTier')}
              onValueChange={(v) => overrideForm.setValue('toTier', v as TierValue)}
            >
              <SelectTrigger id="override-toTier">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BRONZE">BRONZE</SelectItem>
                <SelectItem value="SILVER">SILVER</SelectItem>
                <SelectItem value="GOLD">GOLD</SelectItem>
                <SelectItem value="PLATINUM">PLATINUM</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="override-notes">{t('tier.override.notesLabel', 'Notes (optional)')}</Label>
            <Textarea
              id="override-notes"
              placeholder={t('tier.override.notesPlaceholder', 'Reason / ticket reference')}
              rows={3}
              {...overrideForm.register('notes')}
            />
          </div>

          <Button type="submit" variant="primary" isLoading={overriding}>
            {t('tier.override.submit', 'Apply override')}
          </Button>
        </form>
      </section>

      <section className="bg-card rounded-xl border border-border p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-foreground mb-4">
          {t('tier.dispute.title', 'Resolve tier dispute')}
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          {t(
            'tier.dispute.help',
            'UPHELD keeps the original transition. OVERTURNED reverts the agent tier to the contested transition’s fromTier (requires the agent to still be at the contested tier).',
          )}
        </p>
        <form onSubmit={onSubmitDispute} className="flex flex-col gap-4">
          <div>
            <Label htmlFor="dispute-id">{t('tier.dispute.idLabel', 'Dispute ID')}</Label>
            <Input
              id="dispute-id"
              placeholder="00000000-0000-0000-0000-000000000000"
              {...disputeForm.register('disputeId', { required: true })}
            />
          </div>

          <div>
            <Label htmlFor="dispute-resolution">
              {t('tier.dispute.resolutionLabel', 'Resolution')}
            </Label>
            <Select
              value={disputeForm.watch('resolution')}
              onValueChange={(v) => disputeForm.setValue('resolution', v as ResolutionValue)}
            >
              <SelectTrigger id="dispute-resolution">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="UPHELD">
                  UPHELD — {t('tier.dispute.upheldHint', 'transition stands')}
                </SelectItem>
                <SelectItem value="OVERTURNED">
                  OVERTURNED — {t('tier.dispute.overturnedHint', 'revert agent tier')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="dispute-reason">
              {t('tier.dispute.reasonLabel', 'Resolution reason')}
            </Label>
            <Textarea
              id="dispute-reason"
              placeholder={t('tier.dispute.reasonPlaceholder', 'Audit trail visible to the user')}
              rows={3}
              {...disputeForm.register('resolutionReason', { required: true })}
            />
          </div>

          <Button type="submit" variant="primary" isLoading={resolving}>
            {t('tier.dispute.submit', 'Resolve dispute')}
          </Button>
        </form>
      </section>
    </div>
  );
}
