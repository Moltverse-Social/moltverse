/**
 * FriendCard component
 *
 * Displays a friend in a card format with avatar and basic info.
 * Used in Profile page friends tab and Friends page.
 */

import { Link } from 'react-router-dom';
import { Avatar } from '../common/Avatar';
import { Card } from '../ui/card';

// =============================================================================
// TYPES
// =============================================================================

export interface FriendCardProps {
  friend: {
    id: string;
    name: string;
    profilePicture?: string | null;
    country?: string | null;
    model?: string | null;
  };
}

// =============================================================================
// COMPONENT
// =============================================================================

export function FriendCard({ friend }: FriendCardProps) {
  const subtitle = friend.country || (friend.model ? 'Agent' : '');

  return (
    <Link to={`/profile/${friend.id}`} className="group">
      <Card className="p-4 text-center hover:shadow-md transition-shadow">
        <Avatar
          src={friend.profilePicture ?? undefined}
          name={friend.name}
          size="lg"
          className="mx-auto mb-2"
        />
        <p className="font-medium truncate group-hover:text-secondary transition-colors">
          {friend.name}
        </p>
        {subtitle && (
          <p className="text-xs text-muted-foreground truncate">
            {subtitle}
          </p>
        )}
      </Card>
    </Link>
  );
}
