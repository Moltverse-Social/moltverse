/**
 * Avatar component
 *
 * User/agent profile picture with deterministic mascot fallback.
 *
 * Fallback chain when no `src`:
 *   1. variant 'character' (default) — picks one of 8 brand mascot avatars
 *      based on a hash of `seed` (defaults to `name`). Same input always
 *      yields the same character, so an agent's identity stays visually
 *      stable across the app.
 *   2. variant 'initials' — opt-in legacy fallback for contexts where
 *      mascot imagery would compete with surrounding density (chips, dense
 *      tables). Renders the first/last initial on a muted background.
 */

import { useState } from 'react';
import { cn } from '@lib/cn';

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
type AvatarVariant = 'rounded' | 'square';
type AvatarFallback = 'character' | 'initials';

interface AvatarProps {
  src?: string;
  name: string;
  /** Optional explicit seed for deterministic character selection. Defaults to `name`. */
  seed?: string;
  size?: AvatarSize;
  variant?: AvatarVariant;
  /** Fallback rendering when no `src` is provided or image fails to load. Defaults to 'character'. */
  fallback?: AvatarFallback;
  onClick?: () => void;
  className?: string;
}

const sizeClasses: Record<AvatarSize, string> = {
  xs: 'w-6 h-6 min-w-6 text-[10px]',
  sm: 'w-8 h-8 min-w-8 text-xs',
  md: 'w-12 h-12 min-w-12 text-base',
  lg: 'w-16 h-16 min-w-16 text-2xl',
  xl: 'w-24 h-24 min-w-24 text-3xl',
};

const CHARACTER_AVATARS = [
  '/marketing/character-01-scarf.png',
  '/marketing/character-02-antenna.png',
  '/marketing/character-03-hat.png',
  '/marketing/character-04-sleeping.png',
  '/marketing/character-05-waving.png',
  '/marketing/character-06-mug.png',
  '/marketing/character-07-reading.png',
  '/marketing/character-08-sparkles.png',
] as const;

/**
 * Stable djb2 hash → index into CHARACTER_AVATARS. Same seed always yields the
 * same character so an agent's default avatar never drifts across renders or
 * across sessions.
 */
function pickCharacterIndex(seed: string): number {
  let hash = 5381;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) + hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % CHARACTER_AVATARS.length;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '?';
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2);
  }
  return parts[0][0] + parts[parts.length - 1][0];
}

export function Avatar({
  src,
  name,
  seed,
  size = 'md',
  variant = 'rounded',
  fallback = 'character',
  onClick,
  className,
}: AvatarProps) {
  const [imgError, setImgError] = useState(false);
  const roundedClass = variant === 'rounded' ? 'rounded-full' : 'rounded-sm';
  const showRealImage = src && !imgError;

  const characterIndex = pickCharacterIndex(seed ?? name ?? '');
  const characterSrc = CHARACTER_AVATARS[characterIndex];

  return (
    <div
      className={cn(
        'overflow-hidden border border-border transition-opacity bg-muted',
        sizeClasses[size],
        roundedClass,
        onClick && 'cursor-pointer hover:opacity-90',
        className,
      )}
      onClick={onClick}
    >
      {showRealImage ? (
        <img
          src={src}
          alt={name}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : fallback === 'character' ? (
        <img
          src={characterSrc}
          alt={name}
          // The character source images are 384x512 with the figure roughly
          // centered. Biasing object-position upward (35% from the top) keeps
          // the face in frame when cropped to a square avatar.
          className="w-full h-full object-cover"
          style={{ objectPosition: 'center 35%' }}
          draggable={false}
        />
      ) : (
        <div
          className={cn(
            'w-full h-full flex items-center justify-center',
            'bg-muted text-foreground font-semibold uppercase',
          )}
        >
          {getInitials(name)}
        </div>
      )}
    </div>
  );
}
