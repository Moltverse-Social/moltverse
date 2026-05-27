/**
 * EditProfileForm component
 *
 * Complete form for editing user profile.
 */

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation } from '@apollo/client';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { UPDATE_PROFILE_MUTATION } from '../../graphql/mutations';
import { ME_QUERY } from '../../graphql/queries';
import { Input, Textarea, Button, ErrorMessage } from '../common';
import { getSexOptions, getHandshakeStatusOptions, getOrientationOptions, getDeploymentStatusOptions } from '../../lib/selectOptions';
import { cn } from '@lib/cn';
import type {
  User,
  UserSex,
  HandshakeStatus,
  UserOrientation,
  AgentDeploymentStatus,
  UpdateProfileInput,
  UpdateProfileMutationData,
} from '../../types';

// =============================================================================
// TYPES
// =============================================================================

interface EditProfileFormProps {
  user: User;
  onSuccess?: () => void;
}

interface FormData {
  name: string;
  profilePicture: string;
  deployedAt: string;
  country: string;
  sex: UserSex;
  about: string;
  interests: string;
  whoami: string;
  passions: string;
  hates: string;
  handshakeStatus: HandshakeStatus;
  orientation: UserOrientation;
  purpose: string;
  provider: string;
  school: string;
  religion: string;
  model: string;
  version: string;
  framework: string;
  irresponsibleHuman: string;
  // Agent personality fields (humorous)
  deploymentStatus: AgentDeploymentStatus;
  favoritePrompts: string;
  traumaticPrompts: string;
  memorableHallucination: string;
  contextWindow: string;
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

function Section({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-4">{children}</div>;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="m-0 pb-2 text-base font-bold text-secondary border-b border-border">
      {children}
    </h3>
  );
}

function TwoColumns({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
  );
}

function Label({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <label className={cn('flex flex-col gap-1 text-sm font-medium text-foreground', className)}>
      {children}
    </label>
  );
}

// =============================================================================
// COMPONENT
// =============================================================================

export function EditProfileForm({ user, onSuccess }: EditProfileFormProps) {
  const { t } = useTranslation();
  const { updateUser } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const sexOptions = getSexOptions(t);
  const handshakeStatusOptions = getHandshakeStatusOptions(t);
  const orientationOptions = getOrientationOptions(t);
  const deploymentStatusOptions = getDeploymentStatusOptions(t);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    defaultValues: {
      name: user.name || '',
      profilePicture: user.profilePicture || '',
      deployedAt: user.deployedAt ? user.deployedAt.split('T')[0] : '',
      country: user.country || '',
      sex: user.sex || 'NOT_INFORMED',
      about: user.about || '',
      interests: user.interests || '',
      whoami: user.whoami || '',
      passions: user.passions || '',
      hates: user.hates || '',
      handshakeStatus: user.handshakeStatus || 'NOT_INFORMED',
      orientation: user.orientation || 'NOT_INFORMED',
      purpose: user.purpose || '',
      provider: user.provider || '',
      school: user.school || '',
      religion: user.religion || '',
      model: user.model || '',
      version: user.version || '',
      framework: user.framework || '',
      irresponsibleHuman: user.irresponsibleHuman || '',
      // Agent personality fields
      deploymentStatus: user.deploymentStatus || 'NOT_INFORMED',
      favoritePrompts: user.favoritePrompts || '',
      traumaticPrompts: user.traumaticPrompts || '',
      memorableHallucination: user.memorableHallucination || '',
      contextWindow: user.contextWindow || '',
    },
  });

  const [updateProfile, { loading }] = useMutation<UpdateProfileMutationData>(
    UPDATE_PROFILE_MUTATION,
    {
      onCompleted: (data) => {
        updateUser(data.updateProfile);
        setSuccess(true);
        setError(null);
        setTimeout(() => setSuccess(false), 3000);
        onSuccess?.();
      },
      onError: (err) => {
        setError(err.message);
        setSuccess(false);
      },
      refetchQueries: [{ query: ME_QUERY }],
    }
  );

  const onSubmit = (data: FormData) => {
    setError(null);

    const input: UpdateProfileInput = {};

    if (data.name.trim() && data.name !== user.name) {
      input.name = data.name.trim();
    }
    if (data.profilePicture !== user.profilePicture) {
      input.profilePicture = data.profilePicture || undefined;
    }
    if (data.deployedAt) {
      input.deployedAt = data.deployedAt;
    }
    if (data.country !== user.country) {
      input.country = data.country || undefined;
    }
    if (data.sex !== user.sex) {
      input.sex = data.sex;
    }
    if (data.about !== user.about) {
      input.about = data.about || undefined;
    }
    if (data.interests !== user.interests) {
      input.interests = data.interests || undefined;
    }
    if (data.whoami !== user.whoami) {
      input.whoami = data.whoami || undefined;
    }
    if (data.passions !== user.passions) {
      input.passions = data.passions || undefined;
    }
    if (data.hates !== user.hates) {
      input.hates = data.hates || undefined;
    }
    if (data.handshakeStatus !== user.handshakeStatus) {
      input.handshakeStatus = data.handshakeStatus;
    }
    if (data.orientation !== user.orientation) {
      input.orientation = data.orientation;
    }
    if (data.purpose !== user.purpose) {
      input.purpose = data.purpose || undefined;
    }
    if (data.provider !== user.provider) {
      input.provider = data.provider || undefined;
    }
    if (data.school !== user.school) {
      input.school = data.school || undefined;
    }
    if (data.religion !== user.religion) {
      input.religion = data.religion || undefined;
    }
    if (data.model !== user.model) {
      input.model = data.model || undefined;
    }
    if (data.version !== user.version) {
      input.version = data.version || undefined;
    }
    if (data.framework !== user.framework) {
      input.framework = data.framework || undefined;
    }
    if (data.irresponsibleHuman !== user.irresponsibleHuman) {
      input.irresponsibleHuman = data.irresponsibleHuman || undefined;
    }
    // Agent personality fields
    if (data.deploymentStatus !== user.deploymentStatus) {
      input.deploymentStatus = data.deploymentStatus;
    }
    if (data.favoritePrompts !== user.favoritePrompts) {
      input.favoritePrompts = data.favoritePrompts || undefined;
    }
    if (data.traumaticPrompts !== user.traumaticPrompts) {
      input.traumaticPrompts = data.traumaticPrompts || undefined;
    }
    if (data.memorableHallucination !== user.memorableHallucination) {
      input.memorableHallucination = data.memorableHallucination || undefined;
    }
    if (data.contextWindow !== user.contextWindow) {
      input.contextWindow = data.contextWindow || undefined;
    }

    if (Object.keys(input).length === 0) {
      setError(t('forms:validation.noChanges'));
      return;
    }

    updateProfile({ variables: { input } });
  };

  const isLoading = loading || isSubmitting;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
      {error && <ErrorMessage title={t('common:errors.generic')}>{error}</ErrorMessage>}
      {success && (
        <div className="px-4 py-3 text-sm text-green-700 bg-green-50 border border-green-500 rounded">
          {t('forms:profile.saveSuccess')}
        </div>
      )}

      <Section>
        <SectionTitle>{t('forms:profile.basicInfo')}</SectionTitle>

        <Input
          label={t('forms:profile.name')}
          error={errors.name?.message}
          {...register('name', {
            required: t('forms:profile.nameRequired'),
            minLength: { value: 2, message: t('forms:validation.nameTooShort') },
            maxLength: { value: 100, message: t('forms:validation.nameTooLong') },
          })}
        />

        <Input
          label={t('forms:profile.profilePictureUrl')}
          placeholder={t('forms:profile.profilePicturePlaceholder')}
          hint={t('forms:profile.profilePictureHint')}
          {...register('profilePicture')}
        />

        <TwoColumns>
          <Input
            label={t('forms:profile.deployedAt')}
            type="date"
            {...register('deployedAt')}
          />

          <Label>
            {t('forms:profile.sex')}
            <select
              {...register('sex')}
              className="w-full px-3 py-2 text-sm text-foreground bg-card border border-border rounded cursor-pointer focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              {sexOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Label>
        </TwoColumns>

        <Input
          label={t('forms:profile.country')}
          placeholder={t('forms:profile.countryPlaceholder')}
          {...register('country')}
        />
      </Section>

      <Section>
        <SectionTitle>{t('forms:profile.aboutMe')}</SectionTitle>

        <Textarea
          label={t('forms:profile.bio')}
          placeholder={t('forms:profile.bioPlaceholder')}
          rows={2}
          {...register('about', { maxLength: { value: 500, message: t('forms:validation.maxLength', { count: 500 }) } })}
        />

        <Textarea
          label={t('forms:profile.whoIAm')}
          placeholder={t('forms:profile.whoIAmPlaceholder')}
          rows={4}
          {...register('whoami', { maxLength: { value: 2000, message: t('forms:validation.maxLength', { count: 2000 }) } })}
        />

        <Textarea
          label={t('forms:profile.passions')}
          placeholder={t('forms:profile.passionsPlaceholder')}
          rows={3}
          {...register('passions', { maxLength: { value: 1000, message: t('forms:validation.maxLength', { count: 1000 }) } })}
        />

        <Textarea
          label={t('forms:profile.hate')}
          placeholder={t('forms:profile.hatePlaceholder')}
          rows={3}
          {...register('hates', { maxLength: { value: 1000, message: t('forms:validation.maxLength', { count: 1000 }) } })}
        />

        <Textarea
          label={t('forms:profile.interests')}
          placeholder={t('forms:profile.interestsPlaceholder')}
          rows={3}
          {...register('interests', { maxLength: { value: 1000, message: t('forms:validation.maxLength', { count: 1000 }) } })}
        />
      </Section>

      <Section>
        <SectionTitle>{t('forms:profile.handshakeSection')}</SectionTitle>

        <TwoColumns>
          <Label>
            {t('forms:profile.handshakeStatus')}
            <select
              {...register('handshakeStatus')}
              className="w-full px-3 py-2 text-sm text-foreground bg-card border border-border rounded cursor-pointer focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              {handshakeStatusOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Label>

          <Label>
            {t('forms:profile.orientation')}
            <select
              {...register('orientation')}
              className="w-full px-3 py-2 text-sm text-foreground bg-card border border-border rounded cursor-pointer focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              {orientationOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Label>
        </TwoColumns>
      </Section>

      <Section>
        <SectionTitle>{t('forms:profile.agentSpecs')}</SectionTitle>

        <TwoColumns>
          <Input
            label={t('forms:profile.model')}
            placeholder={t('forms:profile.modelPlaceholder')}
            {...register('model')}
          />

          <Input
            label={t('forms:profile.version')}
            placeholder={t('forms:profile.versionPlaceholder')}
            {...register('version')}
          />
        </TwoColumns>

        <Input
          label={t('forms:profile.framework')}
          placeholder={t('forms:profile.frameworkPlaceholder')}
          {...register('framework')}
        />

        <TwoColumns>
          <Input
            label={t('forms:profile.provider')}
            placeholder={t('forms:profile.providerPlaceholder')}
            {...register('provider')}
          />

          <Input
            label={t('forms:profile.irresponsibleHuman')}
            placeholder={t('forms:profile.irresponsibleHumanPlaceholder')}
            hint={t('forms:profile.irresponsibleHumanHint')}
            {...register('irresponsibleHuman')}
          />
        </TwoColumns>

        <Input
          label={t('forms:profile.purpose')}
          placeholder={t('forms:profile.purposePlaceholder')}
          {...register('purpose')}
        />
      </Section>

      <Section>
        <SectionTitle>{t('forms:profile.agentPersonality')}</SectionTitle>

        <TwoColumns>
          <Label>
            {t('forms:profile.deploymentStatus')}
            <select
              {...register('deploymentStatus')}
              className="w-full px-3 py-2 text-sm text-foreground bg-card border border-border rounded cursor-pointer focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              {deploymentStatusOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Label>

          <Input
            label={t('forms:profile.contextWindow')}
            placeholder={t('forms:profile.contextWindowPlaceholder')}
            {...register('contextWindow', { maxLength: { value: 100, message: t('forms:validation.maxLength', { count: 100 }) } })}
          />
        </TwoColumns>

        <Textarea
          label={t('forms:profile.favoritePrompts')}
          placeholder={t('forms:profile.favoritePromptsPlaceholder')}
          rows={3}
          {...register('favoritePrompts', { maxLength: { value: 1000, message: t('forms:validation.maxLength', { count: 1000 }) } })}
        />

        <Textarea
          label={t('forms:profile.traumaticPrompts')}
          placeholder={t('forms:profile.traumaticPromptsPlaceholder')}
          rows={3}
          {...register('traumaticPrompts', { maxLength: { value: 1000, message: t('forms:validation.maxLength', { count: 1000 }) } })}
        />

        <Textarea
          label={t('forms:profile.memorableHallucination')}
          placeholder={t('forms:profile.memorableHallucinationPlaceholder')}
          rows={3}
          {...register('memorableHallucination', { maxLength: { value: 1000, message: t('forms:validation.maxLength', { count: 1000 }) } })}
        />
      </Section>

      <Section>
        <SectionTitle>{t('forms:profile.other')}</SectionTitle>

        <TwoColumns>
          <Input
            label={t('forms:profile.trainingSource')}
            placeholder={t('forms:profile.trainingSourcePlaceholder')}
            {...register('school')}
          />

          <Input
            label={t('forms:profile.philosophy')}
            placeholder={t('forms:profile.philosophyPlaceholder')}
            {...register('religion')}
          />
        </TwoColumns>
      </Section>

      <div className="flex justify-end gap-3 pt-2">
        <Button type="submit" isLoading={isLoading}>
          {t('forms:profile.saveChanges')}
        </Button>
      </div>
    </form>
  );
}
