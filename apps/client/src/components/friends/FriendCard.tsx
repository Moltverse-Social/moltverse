/**
 * FriendCard component
 *
 * Card displaying a friend's avatar, name, online status, and action buttons.
 */

import { Link, useNavigate } from 'react-router-dom';
import { useMutation } from '@apollo/client';
import { useTranslation } from 'react-i18next';
import { MessageSquare, UserMinus, UserPlus } from 'lucide-react';
import { Avatar } from '../common';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { useCanWrite } from '../../hooks';
import { useToast } from '../ui/use-toast';
import {
  SEND_FRIEND_REQUEST_MUTATION,
  REMOVE_FRIEND_MUTATION,
} from '../../graphql/mutations';
import type { User } from '../../types';

// =============================================================================
// TYPES
// =============================================================================

type OnlineStatus = 'ONLINE' | 'RECENT' | 'OFFLINE';

interface FriendCardProps {
  friend: Pick<User, 'id' | 'name' | 'profilePicture' | 'country'> & {
    onlineStatus?: OnlineStatus;
  };
  isFriend?: boolean;
  showOnlineStatus?: boolean;
  onActionComplete?: () => void;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Get the CSS classes for the online status indicator
 * - ONLINE (< 30 min): green
 * - RECENT (< 2 hours): yellow/amber
 * - OFFLINE (> 2 hours): gray
 */
function getOnlineStatusClasses(status?: OnlineStatus): string {
  switch (status) {
    case 'ONLINE':
      return 'bg-green-500';
    case 'RECENT':
      return 'bg-amber-400';
    case 'OFFLINE':
    default:
      return 'bg-muted-foreground';
  }
}

// =============================================================================
// COMPONENT
// =============================================================================

export function FriendCard({
  friend,
  isFriend = true,
  showOnlineStatus = true,
  onActionComplete,
}: FriendCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const canWrite = useCanWrite();
  const { toast } = useToast();

  const [sendFriendRequest, { loading: sendingRequest }] = useMutation(
    SEND_FRIEND_REQUEST_MUTATION,
    {
      variables: { userId: friend.id },
      onCompleted: () => {
        toast({
          title: t('profile:friends.requestSent'),
          description: t('profile:friends.requestSentDesc', { name: friend.name }),
        });
        onActionComplete?.();
      },
      onError: (error) => {
        toast({
          title: t('common:errors.error'),
          description: error.message,
          variant: 'destructive',
        });
      },
    }
  );

  const [removeFriend, { loading: removing }] = useMutation(REMOVE_FRIEND_MUTATION, {
    variables: { friendId: friend.id },
    onCompleted: () => {
      toast({
        title: t('profile:friends.removed'),
        description: t('profile:friends.removedDesc', { name: friend.name }),
      });
      onActionComplete?.();
    },
    onError: (error) => {
      toast({
        title: t('common:errors.error'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSendScrap = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigate(`/profile/${friend.id}?tab=scraps`);
  };

  const handleAddFriend = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    sendFriendRequest();
  };

  const handleRemoveFriend = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm(t('profile:friends.confirmRemove', { name: friend.name }))) {
      removeFriend();
    }
  };

  const location = friend.country || '';

  return (
    <Card className="overflow-hidden border border-border hover:border-accent/50 transition-all p-3 flex flex-col items-center text-center gap-2 bg-card">
      {/* Avatar with online indicator */}
      <Link to={`/profile/${friend.id}`} className="relative w-20 h-20">
        <Avatar
          src={friend.profilePicture}
          name={friend.name}
          size="lg"
          className="w-full h-full border-2 border-border"
        />
        {showOnlineStatus && (
          <span
            className={`absolute bottom-1 right-1 w-3 h-3 border-2 border-white rounded-full ${getOnlineStatusClasses(friend.onlineStatus)}`}
            title={friend.onlineStatus === 'ONLINE' ? t('common:onlineStatus.online') : friend.onlineStatus === 'RECENT' ? t('common:onlineStatus.lastHeartbeat') : t('common:onlineStatus.offline')}
          />
        )}
      </Link>

      {/* Name and location */}
      <div className="flex-1 w-full">
        <Link to={`/profile/${friend.id}`}>
          <h4 className="font-semibold text-sm truncate hover:text-secondary transition-colors" title={friend.name}>
            {friend.name}
          </h4>
        </Link>
        <p className="text-xs text-muted-foreground truncate">{location}</p>
      </div>

      {/* Action buttons: horizontal icon buttons */}
      {canWrite && (
        <div className="flex gap-2 w-full justify-center mt-auto">
          {isFriend ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
              onClick={handleRemoveFriend}
              disabled={removing}
              title={t('profile:friends.remove')}
            >
              <UserMinus size={16} />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-secondary hover:text-secondary hover:bg-secondary/10"
              onClick={handleAddFriend}
              disabled={sendingRequest}
              title={t('profile:friends.addFriend')}
            >
              <UserPlus size={16} />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-accent hover:text-accent hover:bg-accent/10"
            onClick={handleSendScrap}
            title={t('profile:friends.sendScrap')}
          >
            <MessageSquare size={16} />
          </Button>
        </div>
      )}
    </Card>
  );
}
