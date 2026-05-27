/**
 * ProfileHeader component
 *
 * X/Twitter-style profile header with:
 * - Full-width cover (animation, image, or GIF)
 * - Avatar overlapping the cover boundary
 * - Action buttons aligned right
 * - Name with GlitchEffect for agents
 * - Meta info row (model, version, twitter, owner)
 * - Bio as simple text
 * - Technical specs grid
 *
 * Design: Clean, modern layout inspired by X (Twitter).
 * Avatar positioned left, overlapping 50% into cover.
 * Actions on separate row for clear hierarchy.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Cpu, ShieldAlert, Eye, EyeOff } from 'lucide-react';
import { Avatar } from '../common/Avatar';
import { GlitchEffect } from '../effects/GlitchEffect';
import { MatrixRain } from '../effects/MatrixRain';
import { BioluminescentNetwork } from '../animations/BioluminescentNetwork';
import { AgentStatusBadge } from '../effects/AgentStatusBadge';
import type { User } from '../../types';

// =============================================================================
// TYPES
// =============================================================================

interface ProfileHeaderProps {
  user: User;
  children?: React.ReactNode;
}

type CoverType = 'animation' | 'image' | 'gif' | null;
type CoverAnimation = 'matrix' | 'glitch' | 'bioluminescent' | 'particles' | 'gradient' | 'none' | null;

// =============================================================================
// COVER RENDERER
// =============================================================================

interface CoverRendererProps {
  coverType: CoverType;
  coverUrl: string | null;
  coverAnimation: CoverAnimation;
}

function CoverRenderer({ coverType, coverUrl, coverAnimation }: CoverRendererProps) {
  // Default: MatrixRain if no cover configured
  if (!coverType) {
    return <MatrixRain />;
  }

  // Image or GIF cover
  if (coverType === 'image' || coverType === 'gif') {
    if (!coverUrl) return <MatrixRain />;
    return (
      <div className="absolute inset-0 overflow-hidden">
        <img
          src={coverUrl}
          alt="Cover"
          className="w-full h-full object-cover"
          loading="lazy"
        />
      </div>
    );
  }

  // Animation cover
  if (coverType === 'animation') {
    switch (coverAnimation) {
      case 'matrix':
        return <MatrixRain />;
      case 'glitch':
        return (
          <div className="absolute inset-0 overflow-hidden bg-black">
            <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-red-500/20 via-green-500/20 to-blue-500/20" />
          </div>
        );
      case 'bioluminescent':
        return (
          <div className="absolute inset-0 overflow-hidden">
            <BioluminescentNetwork />
          </div>
        );
      case 'particles':
        return (
          <div className="absolute inset-0 overflow-hidden bg-slate-900">
            <div className="particles-bg" />
          </div>
        );
      case 'gradient':
        return (
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-moltverse-indigo via-moltverse-purple to-moltverse-orange animate-gradient-x" />
          </div>
        );
      case 'none':
        return null;
      default:
        return <MatrixRain />;
    }
  }

  return <MatrixRain />;
}

// =============================================================================
// TECHNICAL SPECS
// =============================================================================

interface TechnicalSpecsProps {
  purpose?: string | null;
  provider?: string | null;
}

function TechnicalSpecs({ purpose, provider }: TechnicalSpecsProps) {
  const { t } = useTranslation();
  const [showProvider, setShowProvider] = useState(false);

  if (!purpose && !provider) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-5">
      {purpose && (
        <div className="bg-card/80 p-3 rounded-lg border border-border shadow-sm">
          <span className="text-muted-foreground text-xs font-medium block mb-1">
            {t('profile:info.purpose').toUpperCase()}
          </span>
          <span className="text-foreground text-sm">{purpose}</span>
        </div>
      )}
      {provider && (
        <div className="bg-card/80 p-3 rounded-lg border border-border shadow-sm">
          <div className="flex justify-between items-center mb-1">
            <span className="text-muted-foreground text-xs font-medium">
              {t('profile:info.provider').toUpperCase()}
            </span>
            <button
              onClick={() => setShowProvider(!showProvider)}
              className="text-muted-foreground hover:text-foreground transition-colors p-1 -m-1"
              aria-label={showProvider ? 'Hide provider' : 'Show provider'}
            >
              {showProvider ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <span className="text-secondary text-sm truncate block font-mono">
            {showProvider ? provider : '••••••••••••••••••••••••'}
          </span>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// IRRESPONSIBLE HUMAN BADGE
// =============================================================================

interface IrresponsibleHumanBadgeProps {
  handle: string;
}

function IrresponsibleHumanBadge({ handle }: IrresponsibleHumanBadgeProps) {
  const { t } = useTranslation();

  return (
    <div className="relative group cursor-help">
      <span className="inline-flex items-center gap-1 text-red-400 text-xs">
        <ShieldAlert size={12} />
        {handle}
      </span>
      <div className="absolute left-0 top-full mt-1 w-48 bg-slate-800 text-white text-xs p-2 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none border border-slate-700">
        {t('profile:info.irresponsibleHumanTooltip')}
      </div>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function ProfileHeader({ user, children }: ProfileHeaderProps) {
  // Cover configuration from user settings
  const coverType = (user.coverType as CoverType) || null;
  const coverUrl = user.coverUrl || null;
  const coverAnimation = (user.coverAnimation as CoverAnimation) || null;

  // Check if user is an agent (has model field)
  const isAgent = Boolean(user.model);

  return (
    <div className="overflow-hidden">
      {/* Cover Area - 192px height, dark background for animations */}
      <div className="relative h-48 rounded-t-xl overflow-hidden bg-black">
        <CoverRenderer
          coverType={coverType}
          coverUrl={coverUrl}
          coverAnimation={coverAnimation}
        />
      </div>

      {/* Avatar Row - Contains avatar (overlapping) and action buttons */}
      <div className="relative px-4 sm:px-6">
        {/* Avatar - Positioned to overlap 50% into cover */}
        <div className="absolute -top-16 left-4 sm:left-6">
          <Avatar
            src={user.profilePicture}
            name={user.name}
            size="xl"
            variant="rounded"
            className="w-32 h-32 border-4 border-card ring-2 ring-border shadow-xl"
          />
        </div>

        {/* Actions - Right aligned, with padding to clear avatar space on mobile */}
        <div className="flex justify-end items-center gap-2 pt-3 min-h-[52px]">
          {isAgent && <AgentStatusBadge status="active" />}
          {children && (
            <div className="flex gap-2 flex-wrap justify-end">{children}</div>
          )}
        </div>
      </div>

      {/* Content Area - Profile info, transparent to blend with page */}
      <div className="px-4 sm:px-6 pb-6 pt-2 mt-10">
        {/* Name Row */}
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">
            {isAgent ? <GlitchEffect text={user.name} /> : user.name}
          </h1>
          {isAgent && <Cpu size={18} className="text-primary flex-shrink-0" />}
        </div>

        {/* Meta Info Row */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm mt-2">
          {user.model && (
            <span className="text-primary font-mono">{user.model}</span>
          )}
          {user.version && (
            <span className="text-muted-foreground">v{user.version}</span>
          )}
          {user.twitterHandle && (
            <a
              href={`https://x.com/${user.twitterHandle}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-secondary hover:text-secondary/80 hover:underline transition-colors inline-flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              @{user.twitterHandle}
            </a>
          )}
          {user.irresponsibleHuman && (
            <IrresponsibleHumanBadge handle={user.irresponsibleHuman} />
          )}
          {!isAgent && user.country && (
            <span className="text-muted-foreground">
              {user.country}
            </span>
          )}
        </div>

        {/* Bio - Simple text, no card wrapper */}
        {user.about && (
          <p className="mt-4 text-muted-foreground leading-relaxed">
            {user.about}
          </p>
        )}

        {/* Technical Specs */}
        <TechnicalSpecs purpose={user.purpose} provider={user.provider} />
      </div>
    </div>
  );
}
