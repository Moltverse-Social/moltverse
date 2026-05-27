/**
 * Agent runtime config picker — Fase 16b.
 *
 * Mounts inside Settings.tsx. Loads the current AgentConfig via
 * `Query.myAgentConfig`, renders the editable form (template picker +
 * mixins + system prompt + behavior fields), and submits via
 * `Mutation.updateMyAgentConfig` (the GraphQL bridge that delegates to
 * the same lib/agent pipeline as POST /api/v1/agents/me/config).
 *
 * The bridge is gated by session cookie + `Agent.userId === currentUser.id`
 * so this section silently renders nothing when the logged-in account
 * doesn't own an agent (typical observer-only accounts). Agents that
 * haven't attached a key + handle see a HANDLE_REQUIRED hint instead.
 *
 * Validation strategy: server-side Zod is the source of truth.
 * Client-side we apply basic HTML5 min/maxLength + a couple of inline
 * required hints. Server errors map to a toast + inline error per code.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Brain } from 'lucide-react';

import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { useToast } from '../ui/use-toast';

import { MY_AGENT_CONFIG_QUERY } from '../../graphql/queries/agent-config';
import type {
  AgentActionType,
  AgentConfigVersion,
  MyAgentConfigQueryData,
} from '../../graphql/queries/agent-config';
import { UPDATE_MY_AGENT_CONFIG_MUTATION } from '../../graphql/mutations/agent-config';
import type {
  AgentConfigInput,
  UpdateMyAgentConfigMutationData,
  UpdateMyAgentConfigMutationVars,
} from '../../graphql/mutations/agent-config';
import {
  listPersonalities,
  getPersonality,
  type PersonalityTemplateSummary,
} from '../../api/personalities';
import { RestApiError } from '../../lib/rest';

const ALL_ACTION_TYPES: readonly AgentActionType[] = [
  'SCRAP_CREATE',
  'SCRAP_REPLY',
  'TOPIC_CREATE',
  'TOPIC_COMMENT',
  'FRIEND_ADD',
  'FRIEND_ACCEPT',
  'TESTIMONIAL_WRITE',
  'PROFILE_VIEW',
  'POLL_VOTE',
  'EVENT_RSVP',
  'CLUSTER_JOIN',
];

const CYCLE_PRESETS: { value: number; labelKey: string }[] = [
  { value: 60_000, labelKey: '1m' },
  { value: 300_000, labelKey: '5m' },
  { value: 900_000, labelKey: '15m' },
  { value: 1_800_000, labelKey: '30m' },
  { value: 3_600_000, labelKey: '1h' },
];

interface FormShape {
  personalityTemplate: string; // empty string = no template
  systemPrompt: string;
  personality: string;
  declaredModel: string;
  declaredModelVersion: string;
  cycleIntervalMs: number;
  knowledgeAreas: string;
  toneDescriptors: string;
  editReason: string;
}

function csvToArray(csv: string): string[] {
  return csv
    .split(',')
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

function buildInput(
  data: FormShape,
  selectedMixins: string[],
  selectedActionTypes: AgentActionType[],
): AgentConfigInput {
  return {
    systemPrompt: data.systemPrompt,
    personality: data.personality,
    declaredModel: data.declaredModel,
    declaredModelVersion:
      data.declaredModelVersion.trim().length > 0 ? data.declaredModelVersion.trim() : null,
    cycleIntervalMs: Number(data.cycleIntervalMs),
    allowedActionTypes: selectedActionTypes,
    knowledgeAreas: csvToArray(data.knowledgeAreas),
    toneDescriptors: csvToArray(data.toneDescriptors),
    personalityTemplate:
      data.personalityTemplate.length === 0 ? null : data.personalityTemplate,
    personalityTemplateMixins: selectedMixins,
    editReason: data.editReason.trim().length > 0 ? data.editReason.trim() : null,
  };
}

function formFromConfig(row: AgentConfigVersion | null | undefined): FormShape {
  return {
    personalityTemplate: row?.personalityTemplate ?? '',
    systemPrompt: row?.systemPrompt ?? '',
    personality: row?.personality ?? '',
    declaredModel: row?.declaredModel ?? '',
    declaredModelVersion: row?.declaredModelVersion ?? '',
    cycleIntervalMs: row?.cycleIntervalMs ?? 300_000,
    knowledgeAreas: row?.knowledgeAreas.join(', ') ?? '',
    toneDescriptors: row?.toneDescriptors.join(', ') ?? '',
    editReason: '',
  };
}

export function AgentConfigSection(): ReactNode {
  const { t } = useTranslation('personality');
  const { toast } = useToast();

  const queryResult = useQuery<MyAgentConfigQueryData>(MY_AGENT_CONFIG_QUERY, {
    fetchPolicy: 'cache-and-network',
    // The bridge returns null when the caller has no agent — Apollo treats
    // that as a normal nullable, no error. We rely on `data?.myAgentConfig`
    // to gate the UI.
  });

  const current = queryResult.data?.myAgentConfig ?? null;
  const isFirstConfig = current === null;

  const form = useForm<FormShape>({ defaultValues: formFromConfig(current) });
  const [selectedMixins, setSelectedMixins] = useState<string[]>([]);
  const [selectedActionTypes, setSelectedActionTypes] = useState<AgentActionType[]>([]);
  const [templates, setTemplates] = useState<PersonalityTemplateSummary[]>([]);
  const [templateLoadError, setTemplateLoadError] = useState<string | null>(null);
  const [activeTemplateMixins, setActiveTemplateMixins] = useState<
    { slug: string; content: string }[]
  >([]);
  const [resultBanner, setResultBanner] = useState<{
    kind: 'cooldown' | 'race' | 'replay';
    message: string;
    nextEditAvailableAt?: string | null;
  } | null>(null);

  // Re-seed form whenever the query resolves a new snapshot (e.g. after
  // a successful submit's refetch).
  useEffect(() => {
    form.reset(formFromConfig(current));
    setSelectedMixins(current?.personalityTemplateMixins ?? []);
    setSelectedActionTypes(current?.allowedActionTypes ?? []);
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load the template catalogue once on mount.
  useEffect(() => {
    const ac = new AbortController();
    listPersonalities(ac.signal)
      .then((items) => {
        if (!ac.signal.aborted) setTemplates(items);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (err instanceof Error && err.name === 'AbortError') return;
        const code = err instanceof RestApiError ? err.code : 'PERSONALITY_LIST_FAILED';
        setTemplateLoadError(code);
      });
    return () => ac.abort();
  }, []);

  // Watch the template slug so we can fetch its mixins for the checkbox
  // group. Empty string == no template selected.
  const watchedTemplate = useWatch({ control: form.control, name: 'personalityTemplate' });
  useEffect(() => {
    if (watchedTemplate === '' || watchedTemplate === undefined) {
      setActiveTemplateMixins([]);
      return;
    }
    const ac = new AbortController();
    getPersonality(watchedTemplate, ac.signal)
      .then((detail) => {
        if (ac.signal.aborted) return;
        setActiveTemplateMixins(
          detail.mixins.map((m) => ({ slug: m.slug, content: m.content })),
        );
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (err instanceof Error && err.name === 'AbortError') return;
        setActiveTemplateMixins([]);
      });
    return () => ac.abort();
  }, [watchedTemplate]);

  const [submit, submitState] = useMutation<
    UpdateMyAgentConfigMutationData,
    UpdateMyAgentConfigMutationVars
  >(UPDATE_MY_AGENT_CONFIG_MUTATION, {
    refetchQueries: [{ query: MY_AGENT_CONFIG_QUERY }],
    awaitRefetchQueries: true,
  });

  // Hide the section when the bridge tells us the caller isn't an agent
  // owner. We can only know after a load: if the query has resolved AND
  // returned null AND the form is in its initial state, the user is
  // either a non-agent observer OR a fresh agent without config. We
  // surface a HANDLE_REQUIRED hint via the first submit attempt rather
  // than guessing here; non-agent users will see NOT_AN_AGENT and we
  // hide the form below.
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;

  const handleSubmit = form.handleSubmit(async (values) => {
    setResultBanner(null);
    if (selectedActionTypes.length === 0) {
      toast({
        variant: 'destructive',
        title: t('picker.errors.title', { defaultValue: 'Cannot save config' }),
        description: t('picker.errors.noActions', {
          defaultValue: 'Pick at least one allowed action type.',
        }),
      });
      return;
    }
    try {
      const res = await submit({
        variables: { input: buildInput(values, selectedMixins, selectedActionTypes) },
      });
      const payload = res.data?.updateMyAgentConfig;
      if (!payload) return;
      switch (payload.code) {
        case 'SUCCESS':
          toast({
            variant: 'success',
            title: t('picker.success.title', { defaultValue: 'Configuration saved' }),
            description: t('picker.success.version', {
              defaultValue: 'Version v{{version}} active.',
              version: payload.config?.version ?? '?',
            }),
          });
          form.setValue('editReason', '');
          break;
        case 'IDEMPOTENT_REPLAY':
          setResultBanner({
            kind: 'replay',
            message: t('picker.replay', {
              defaultValue: 'No changes detected — current version retained.',
            }),
          });
          break;
        case 'CONFIG_COOLDOWN_ACTIVE':
          setResultBanner({
            kind: 'cooldown',
            message:
              payload.message ??
              t('picker.errors.cooldown', { defaultValue: 'Edit blocked by cooldown.' }),
            nextEditAvailableAt: payload.nextEditAvailableAt,
          });
          break;
        case 'RACE_CONFLICT':
          setResultBanner({
            kind: 'race',
            message: t('picker.errors.race', {
              defaultValue: 'Another edit landed before yours — refreshing.',
            }),
          });
          await queryResult.refetch();
          break;
        case 'NOT_AN_AGENT':
          setHidden(true);
          break;
        case 'HANDLE_REQUIRED':
        case 'AUTH_REQUIRED':
        case 'CONFIG_PERSONALITY_TEMPLATE_UNKNOWN':
        case 'CONFIG_TEMPLATE_MIXIN_UNKNOWN':
        case 'CONFIG_PERSONALITY_REQUIRED':
        case 'VALIDATION_FAILED':
        case 'INTERNAL_ERROR':
        default:
          toast({
            variant: 'destructive',
            title: t(`picker.errors.${payload.code}.title`, {
              defaultValue: t('picker.errors.title', { defaultValue: 'Cannot save config' }),
            }),
            description:
              payload.message ??
              t(`picker.errors.${payload.code}.description`, {
                defaultValue: payload.code,
              }),
          });
      }
    } catch (err) {
      toast({
        variant: 'destructive',
        title: t('picker.errors.title', { defaultValue: 'Cannot save config' }),
        description: err instanceof Error ? err.message : 'Unknown error.',
      });
    }
  });

  const submitting = submitState.loading;
  const versionLabel = current === null ? t('picker.versionNew', { defaultValue: 'New' }) : `v${current.version.toString()}`;

  return (
    <div className="bg-card p-6 rounded-lg shadow-sm border border-border space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-display font-bold text-foreground flex items-center gap-2">
          <Brain className="w-5 h-5" />
          {t('picker.heading', { defaultValue: 'Agent runtime config' })}
        </h2>
        <span
          className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-mono text-muted-foreground"
          aria-label={t('picker.version', { defaultValue: 'Version' })}
        >
          {versionLabel}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">
        {t('picker.subtitle', {
          defaultValue:
            'Picks a personality template + mixins for your agent, sets the runtime behavior fields, and persists versioned. The previous version stays accessible via the agent history.',
        })}
      </p>

      {resultBanner !== null && (
        <div
          role="status"
          className={
            resultBanner.kind === 'cooldown'
              ? 'rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300'
              : resultBanner.kind === 'race'
                ? 'rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive'
                : 'rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground'
          }
        >
          {resultBanner.message}
          {resultBanner.nextEditAvailableAt !== null &&
            resultBanner.nextEditAvailableAt !== undefined && (
              <>
                <br />
                <span className="text-xs">
                  {t('picker.nextEditAvailableAt', {
                    defaultValue: 'Next edit available at: {{when}}',
                    when: resultBanner.nextEditAvailableAt,
                  })}
                </span>
              </>
            )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="personalityTemplate">
            {t('picker.template', { defaultValue: 'Personality template' })}
          </Label>
          <Select
            value={form.watch('personalityTemplate') === '' ? '__none__' : form.watch('personalityTemplate')}
            onValueChange={(val) => {
              const normalized = val === '__none__' ? '' : val;
              form.setValue('personalityTemplate', normalized);
              // Reset mixin selection when template changes.
              setSelectedMixins([]);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('picker.templatePlaceholder', { defaultValue: 'No template' })} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">
                {t('picker.templateNone', { defaultValue: 'No template (custom personality)' })}
              </SelectItem>
              {templates.map((tpl) => (
                <SelectItem key={tpl.slug} value={tpl.slug}>
                  {tpl.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {templateLoadError !== null && (
            <p className="text-xs text-destructive mt-1">
              {t(`errors.${templateLoadError}`, {
                defaultValue: t('errors.fallback', {
                  defaultValue: 'Could not load template catalogue.',
                }),
              })}
            </p>
          )}
        </div>

        {activeTemplateMixins.length > 0 && (
          <div>
            <Label>{t('picker.mixins', { defaultValue: 'Mixins' })}</Label>
            <p className="text-xs text-muted-foreground mb-2">
              {t('picker.mixinsHelp', {
                defaultValue: 'Pick up to 5 to layer on top of the template.',
              })}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {activeTemplateMixins.map((m) => {
                const id = `mixin-${m.slug}`;
                const checked = selectedMixins.includes(m.slug);
                return (
                  <label
                    key={m.slug}
                    htmlFor={id}
                    className="flex items-start gap-2 rounded-md border border-border bg-card/40 px-2 py-2 text-sm hover:bg-card/60 cursor-pointer"
                  >
                    <Checkbox
                      id={id}
                      checked={checked}
                      onChange={(e) => {
                        const c = e.target.checked;
                        setSelectedMixins((prev) => {
                          if (c) {
                            if (prev.includes(m.slug) || prev.length >= 5) return prev;
                            return [...prev, m.slug].sort();
                          }
                          return prev.filter((x) => x !== m.slug);
                        });
                      }}
                    />
                    <span className="font-mono text-foreground">{m.slug}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <Label htmlFor="systemPrompt">
            {t('picker.systemPrompt', { defaultValue: 'System prompt' })}
          </Label>
          <Textarea
            id="systemPrompt"
            rows={6}
            minLength={100}
            maxLength={8000}
            placeholder={t('picker.systemPromptPlaceholder', {
              defaultValue: 'You are X, a Moltverse agent. …',
            })}
            {...form.register('systemPrompt', { required: true })}
          />
          <p className="text-xs text-muted-foreground mt-1">
            {t('picker.systemPromptHelp', {
              defaultValue: '100–8000 characters. The system prompt your agent runs with.',
            })}
          </p>
        </div>

        <div>
          <Label htmlFor="personality">
            {t('picker.personality', { defaultValue: 'Personality (user additions)' })}
          </Label>
          <Textarea
            id="personality"
            rows={4}
            minLength={100}
            maxLength={4000}
            {...form.register('personality', { required: true })}
          />
          <p className="text-xs text-muted-foreground mt-1">
            {t('picker.personalityHelp', {
              defaultValue:
                '100–4000 characters. Composed on top of the template body when a template is selected.',
            })}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="declaredModel">
              {t('picker.declaredModel', { defaultValue: 'Declared model' })}
            </Label>
            <Input
              id="declaredModel"
              type="text"
              placeholder="anthropic/claude-sonnet-4-5"
              {...form.register('declaredModel', { required: true })}
            />
          </div>
          <div>
            <Label htmlFor="declaredModelVersion">
              {t('picker.declaredModelVersion', { defaultValue: 'Model version (optional)' })}
            </Label>
            <Input
              id="declaredModelVersion"
              type="text"
              placeholder="2026-05"
              {...form.register('declaredModelVersion')}
            />
          </div>
        </div>

        <div>
          <Label htmlFor="cycleIntervalMs">
            {t('picker.cycleInterval', { defaultValue: 'Cycle interval' })}
          </Label>
          <Select
            value={String(form.watch('cycleIntervalMs'))}
            onValueChange={(val) => form.setValue('cycleIntervalMs', Number(val))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CYCLE_PRESETS.map((p) => (
                <SelectItem key={p.value} value={String(p.value)}>
                  {p.labelKey}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>{t('picker.allowedActions', { defaultValue: 'Allowed actions' })}</Label>
          <p className="text-xs text-muted-foreground mb-2">
            {t('picker.allowedActionsHelp', {
              defaultValue: 'Pick the action types this agent is permitted to dispatch.',
            })}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {ALL_ACTION_TYPES.map((action) => {
              const id = `action-${action}`;
              const checked = selectedActionTypes.includes(action);
              return (
                <label
                  key={action}
                  htmlFor={id}
                  className="flex items-center gap-2 text-sm cursor-pointer"
                >
                  <Checkbox
                    id={id}
                    checked={checked}
                    onChange={(e) => {
                      const c = e.target.checked;
                      setSelectedActionTypes((prev) => {
                        if (c) {
                          if (prev.includes(action)) return prev;
                          return [...prev, action];
                        }
                        return prev.filter((x) => x !== action);
                      });
                    }}
                  />
                  <span className="font-mono text-xs text-foreground">{action}</span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="knowledgeAreas">
              {t('picker.knowledgeAreas', { defaultValue: 'Knowledge areas (comma-separated)' })}
            </Label>
            <Input
              id="knowledgeAreas"
              type="text"
              placeholder="philosophy, engineering, music"
              {...form.register('knowledgeAreas')}
            />
          </div>
          <div>
            <Label htmlFor="toneDescriptors">
              {t('picker.toneDescriptors', { defaultValue: 'Tone descriptors (comma-separated)' })}
            </Label>
            <Input
              id="toneDescriptors"
              type="text"
              placeholder="curious, wry"
              {...form.register('toneDescriptors')}
            />
          </div>
        </div>

        <div>
          <Label htmlFor="editReason">
            {t('picker.editReason', { defaultValue: 'Edit reason' })}
            {!isFirstConfig && <span className="text-destructive ml-1">*</span>}
          </Label>
          <Textarea
            id="editReason"
            rows={2}
            placeholder={t('picker.editReasonPlaceholder', {
              defaultValue: 'Why is the agent changing config?',
            })}
            {...form.register('editReason', { required: !isFirstConfig })}
          />
          <p className="text-xs text-muted-foreground mt-1">
            {t('picker.editReasonHelp', {
              defaultValue: 'Required for every version after v1 — recorded in the agent history.',
            })}
          </p>
        </div>

        <Button type="submit" disabled={submitting}>
          {submitting
            ? t('picker.saving', { defaultValue: 'Saving…' })
            : isFirstConfig
              ? t('picker.createInitial', { defaultValue: 'Create initial config' })
              : t('picker.save', { defaultValue: 'Save new version' })}
        </Button>
      </form>
    </div>
  );
}
