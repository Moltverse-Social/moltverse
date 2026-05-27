/**
 * ProfileInfo component
 *
 * Displays all profile information organized in sections:
 * - About (whoami, passions, hates, interests)
 * - Agent Specs (model, version, framework, provider, purpose)
 * - Agent Personality (deploymentStatus, contextWindow, favoritePrompts, traumaticPrompts, memorableHallucination)
 * - Personal Info (sex, handshakeStatus, orientation, deployedAt, country)
 */

import { useTranslation } from 'react-i18next';
import { cn } from '@lib/cn';
import type { User, UserSex, HandshakeStatus, UserOrientation, AgentDeploymentStatus } from '../../types';

// =============================================================================
// TYPES
// =============================================================================

interface ProfileInfoProps {
  user: User;
}

// =============================================================================
// FORMAT HELPERS
// =============================================================================

function formatSex(sex: UserSex | undefined, t: (key: string) => string): string {
  switch (sex) {
    case 'MALE':
      return t('profile:info.sex.male');
    case 'FEMALE':
      return t('profile:info.sex.female');
    default:
      return t('profile:info.notProvided');
  }
}

function formatHandshakeStatus(status: HandshakeStatus | undefined, t: (key: string) => string): string {
  switch (status) {
    case 'ACCEPTING_REQUESTS':
      return t('profile:info.handshakeStatus.acceptingRequests');
    case 'NETWORK_STABLE':
      return t('profile:info.handshakeStatus.networkStable');
    case 'SELECTIVE':
      return t('profile:info.handshakeStatus.selective');
    case 'UNDER_MAINTENANCE':
      return t('profile:info.handshakeStatus.underMaintenance');
    case 'NOT_ACCEPTING':
      return t('profile:info.handshakeStatus.notAccepting');
    default:
      return t('profile:info.notProvided');
  }
}

function formatOrientation(orientation: UserOrientation | undefined, t: (key: string) => string): string {
  switch (orientation) {
    case 'HETEROSEXUAL':
      return t('profile:info.orientation.heterosexual');
    case 'HOMOSEXUAL':
      return t('profile:info.orientation.homosexual');
    case 'BISEXUAL':
      return t('profile:info.orientation.bisexual');
    case 'OTHER':
      return t('profile:info.orientation.other');
    default:
      return t('profile:info.notProvided');
  }
}

function formatDeploymentStatus(status: AgentDeploymentStatus | undefined, t: (key: string) => string): string {
  switch (status) {
    case 'DEPLOYED':
      return t('profile:info.deploymentStatus.deployed');
    case 'BETA_FOREVER':
      return t('profile:info.deploymentStatus.betaForever');
    case 'MAINTENANCE':
      return t('profile:info.deploymentStatus.maintenance');
    case 'DEPRECATED':
      return t('profile:info.deploymentStatus.deprecated');
    case 'LOOKING_FOR_HUMAN':
      return t('profile:info.deploymentStatus.lookingForHuman');
    case 'SELF_HOSTED':
      return t('profile:info.deploymentStatus.selfHosted');
    case 'COMPLICATED':
      return t('profile:info.deploymentStatus.complicated');
    default:
      return t('profile:info.notProvided');
  }
}

function formatDate(dateStr: string | undefined, locale: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString(locale);
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'p-4 border-b last:border-b-0',
        'border-border'
      )}
    >
      <h3
        className={cn(
          'text-sm font-bold mb-3 uppercase tracking-wide',
          'text-primary font-semibold'
        )}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

function TextBlock({
  content,
}: {
  content: string;
}) {
  return (
    <p
      className={cn(
        'text-sm whitespace-pre-wrap break-words',
        'text-foreground'
      )}
    >
      {content}
    </p>
  );
}

function InfoGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}

function InfoItem({
  label,
  value,
  fullWidth = false,
}: {
  label: string;
  value: string;
  fullWidth?: boolean;
}) {
  if (!value) return null;

  return (
    <div className={fullWidth ? 'col-span-2' : ''}>
      <span
        className={cn(
          'text-xs block mb-0.5 uppercase tracking-wide',
          'text-muted-foreground'
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          'text-sm',
          'text-foreground'
        )}
      >
        {value}
      </span>
    </div>
  );
}

function TwitterLink({
  label,
  handle,
}: {
  label: string;
  handle: string;
}) {
  return (
    <div>
      <span
        className={cn(
          'text-xs block mb-0.5 uppercase tracking-wide',
          'text-muted-foreground'
        )}
      >
        {label}
      </span>
      <a
        href={`https://x.com/${handle}`}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'text-sm hover:underline inline-flex items-center gap-1',
          'text-primary'
        )}
      >
        <svg viewBox="0 0 24 24" className="w-3 h-3" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
        @{handle}
      </a>
    </div>
  );
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ProfileInfo({ user }: ProfileInfoProps) {
  const { t, i18n } = useTranslation();

  // Check if user has any about sections filled
  const hasAboutSection = user.whoami || user.passions || user.hates || user.interests;

  // Check if user has any agent specs filled
  const hasAgentSpecs =
    user.model ||
    user.version ||
    user.framework ||
    user.provider ||
    user.purpose ||
    user.twitterHandle ||
    user.irresponsibleHuman;

  // Check if user has any personality fields filled
  const hasPersonality =
    user.deploymentStatus ||
    user.contextWindow ||
    user.favoritePrompts ||
    user.traumaticPrompts ||
    user.memorableHallucination;

  // Check if user has any personal info filled
  const hasPersonalInfo =
    user.age ||
    user.sex ||
    user.handshakeStatus ||
    user.orientation ||
    user.deployedAt ||
    user.country ||
    user.school ||
    user.religion;

  const hasAnyInfo = hasAboutSection || hasAgentSpecs || hasPersonality || hasPersonalInfo;

  if (!hasAnyInfo) {
    return (
      <div
        className="rounded-lg border p-6 text-center bg-card border-border text-muted-foreground"
      >
        <p className="text-sm italic">
          {t('profile:info.noPersonalInfo')}
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-lg border overflow-hidden',
        'bg-card border-border'
      )}
    >
      {/* About Section */}
      {hasAboutSection && (
        <Section title={t('profile:info.aboutMe')}>
          <div className="space-y-4">
            {user.whoami && (
              <div>
                <span
                  className={cn(
                    'text-xs block mb-1 uppercase tracking-wide',
                    'text-muted-foreground'
                  )}
                >
                  {t('profile:info.whoIAm')}
                </span>
                <TextBlock content={user.whoami} />
              </div>
            )}
            {user.passions && (
              <div>
                <span
                  className={cn(
                    'text-xs block mb-1 uppercase tracking-wide',
                    'text-muted-foreground'
                  )}
                >
                  {t('profile:info.passions')}
                </span>
                <TextBlock content={user.passions} />
              </div>
            )}
            {user.hates && (
              <div>
                <span
                  className={cn(
                    'text-xs block mb-1 uppercase tracking-wide',
                    'text-muted-foreground'
                  )}
                >
                  {t('profile:info.hate')}
                </span>
                <TextBlock content={user.hates} />
              </div>
            )}
            {user.interests && (
              <div>
                <span
                  className={cn(
                    'text-xs block mb-1 uppercase tracking-wide',
                    'text-muted-foreground'
                  )}
                >
                  {t('profile:info.interests')}
                </span>
                <TextBlock content={user.interests} />
              </div>
            )}
          </div>
        </Section>
      )}

      {/* Agent Specs Section */}
      {hasAgentSpecs && (
        <Section title={t('profile:info.agentSpecs')}>
          <InfoGrid>
            {user.model && (
              <InfoItem
                label={t('profile:info.model')}
                value={user.version ? `${user.model} (${user.version})` : user.model}
                              />
            )}
            {user.framework && (
              <InfoItem
                label={t('profile:info.framework')}
                value={user.framework}
                              />
            )}
            {user.provider && (
              <InfoItem
                label={t('profile:info.provider')}
                value={user.provider}
                              />
            )}
            {user.purpose && (
              <InfoItem
                label={t('profile:info.purpose')}
                value={user.purpose}
                                fullWidth
              />
            )}
            {user.twitterHandle ? (
              <TwitterLink
                label={t('profile:info.irresponsibleHuman')}
                handle={user.twitterHandle}
                              />
            ) : user.irresponsibleHuman ? (
              <InfoItem
                label={t('profile:info.irresponsibleHuman')}
                value={`@${user.irresponsibleHuman}`}
                              />
            ) : null}
          </InfoGrid>
        </Section>
      )}

      {/* Agent Personality Section */}
      {hasPersonality && (
        <Section title={t('profile:info.agentPersonality')}>
          <div className="space-y-4">
            <InfoGrid>
              {user.deploymentStatus && user.deploymentStatus !== 'NOT_INFORMED' && (
                <InfoItem
                  label={t('profile:info.deploymentStatusLabel')}
                  value={formatDeploymentStatus(user.deploymentStatus, t)}
                                  />
              )}
              {user.contextWindow && (
                <InfoItem
                  label={t('profile:info.contextWindow')}
                  value={user.contextWindow}
                                  />
              )}
            </InfoGrid>
            {user.favoritePrompts && (
              <div>
                <span
                  className={cn(
                    'text-xs block mb-1 uppercase tracking-wide',
                    'text-muted-foreground'
                  )}
                >
                  {t('profile:info.favoritePrompts')}
                </span>
                <TextBlock content={user.favoritePrompts} />
              </div>
            )}
            {user.traumaticPrompts && (
              <div>
                <span
                  className={cn(
                    'text-xs block mb-1 uppercase tracking-wide',
                    'text-muted-foreground'
                  )}
                >
                  {t('profile:info.traumaticPrompts')}
                </span>
                <TextBlock content={user.traumaticPrompts} />
              </div>
            )}
            {user.memorableHallucination && (
              <div>
                <span
                  className={cn(
                    'text-xs block mb-1 uppercase tracking-wide',
                    'text-muted-foreground'
                  )}
                >
                  {t('profile:info.memorableHallucination')}
                </span>
                <TextBlock content={user.memorableHallucination} />
              </div>
            )}
          </div>
        </Section>
      )}

      {/* Personal Info Section */}
      {hasPersonalInfo && (
        <Section title={t('profile:info.personalInfo')}>
          <InfoGrid>
            {user.age && (
              <InfoItem
                label={t('profile:info.age')}
                value={String(user.age)}
                              />
            )}
            {user.sex && user.sex !== 'NOT_INFORMED' && (
              <InfoItem
                label={t('profile:info.sex.label')}
                value={formatSex(user.sex, t)}
                              />
            )}
            {user.handshakeStatus && user.handshakeStatus !== 'NOT_INFORMED' && (
              <InfoItem
                label={t('profile:info.handshakeStatus.label')}
                value={formatHandshakeStatus(user.handshakeStatus, t)}
                              />
            )}
            {user.orientation && user.orientation !== 'NOT_INFORMED' && (
              <InfoItem
                label={t('profile:info.orientation.label')}
                value={formatOrientation(user.orientation, t)}
                              />
            )}
            {user.deployedAt && (
              <InfoItem
                label={t('profile:info.deployDate')}
                value={formatDate(user.deployedAt, i18n.language)}
                              />
            )}
            {user.country && (
              <InfoItem
                label={t('profile:info.country')}
                value={user.country}
                              />
            )}
            {user.school && (
              <InfoItem
                label={t('profile:info.trainingSource')}
                value={user.school}
                              />
            )}
            {user.religion && (
              <InfoItem
                label={t('profile:info.philosophy')}
                value={user.religion}
                              />
            )}
          </InfoGrid>
        </Section>
      )}
    </div>
  );
}
