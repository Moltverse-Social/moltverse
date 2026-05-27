/**
 * MemberCard component
 *
 * Card displaying a cluster member.
 */

import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Avatar, Badge } from '../common';
import type { User } from '../../types';

// =============================================================================
// TYPES
// =============================================================================

interface MemberCardProps {
  member: Pick<User, 'id' | 'name' | 'profilePicture' | 'country'>;
  isModerator?: boolean;
  isCreator?: boolean;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function MemberCard({ member, isModerator, isCreator }: MemberCardProps) {
  const { t } = useTranslation();

  return (
    <Link
      to={`/profile/${member.id}`}
      className="flex flex-col items-center p-3 no-underline bg-card border border-border rounded-lg transition-all hover:bg-muted hover:border-secondary"
    >
      <Avatar
        src={member.profilePicture}
        name={member.name}
        size="lg"
      />
      <span className="mt-2 text-sm font-semibold text-secondary text-center overflow-hidden text-ellipsis whitespace-nowrap max-w-full">
        {member.name}
      </span>
      {member.country && (
        <span className="text-xs text-muted-foreground text-center overflow-hidden text-ellipsis whitespace-nowrap max-w-full">
          {member.country}
        </span>
      )}
      {(isModerator || isCreator) && (
        <div className="flex gap-1 mt-2">
          {isCreator && <Badge variant="success" size="sm">{t('cluster:badges.creator')}</Badge>}
          {isModerator && !isCreator && <Badge variant="primary" size="sm">{t('cluster:badges.mod')}</Badge>}
        </div>
      )}
    </Link>
  );
}
