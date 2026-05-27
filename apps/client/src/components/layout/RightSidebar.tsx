/**
 * RightSidebar component
 *
 * Right column with Online Friends, People you may know, and promotional content.
 */

import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from '@apollo/client';
import { UserPlus } from 'lucide-react';
import { useDisplayUser } from '../../hooks/useDisplayUser';
import { useCanWrite } from '../../hooks/useCanWrite';
import { FRIENDS_QUERY, SUGGEST_FRIENDS_QUERY } from '../../graphql/queries/social';
import { SEND_FRIEND_REQUEST_MUTATION } from '../../graphql/mutations/social';
import { Avatar } from '../common/Avatar';
import { Button } from '../ui/button';
import { useToast } from '../ui/use-toast';
import { SidebarAd } from '../ads/SidebarAd';
import type { FriendsQueryData, FriendSuggestionsQueryData } from '../../types';

// =============================================================================
// TYPES
// =============================================================================

type OnlineStatus = 'ONLINE' | 'RECENT' | 'OFFLINE';

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Get CSS classes for online status indicator
 */
function getStatusClasses(status?: OnlineStatus): string {
  switch (status) {
    case 'ONLINE':
      return 'bg-green-500 dark:bg-green-400';
    case 'RECENT':
      return 'bg-amber-400 dark:bg-amber-500';
    case 'OFFLINE':
    default:
      return 'bg-muted-foreground';
  }
}

/**
 * Get numeric priority for sorting (lower = more priority)
 */
function getStatusPriority(status?: OnlineStatus): number {
  switch (status) {
    case 'ONLINE':
      return 0;
    case 'RECENT':
      return 1;
    case 'OFFLINE':
    default:
      return 2;
  }
}

// =============================================================================
// COMPONENT
// =============================================================================

export function RightSidebar() {
  const { t } = useTranslation();
  const { displayUser } = useDisplayUser();
  const canWrite = useCanWrite();
  const { toast } = useToast();

  // Fetch friends (Online Friends widget)
  const { data: friendsData, loading: friendsLoading } = useQuery<FriendsQueryData>(
    FRIENDS_QUERY,
    {
      variables: { userId: displayUser?.id, limit: 5 },
      skip: !displayUser?.id,
    }
  );

  // Fetch friend suggestions (People you may know)
  const { data: suggestionsData, loading: suggestionsLoading } =
    useQuery<FriendSuggestionsQueryData>(SUGGEST_FRIENDS_QUERY, {
      variables: { limit: 3 },
      skip: !displayUser?.id,
    });

  // Send friend request mutation
  const [sendFriendRequest, { loading: sendingRequest }] = useMutation(
    SEND_FRIEND_REQUEST_MUTATION,
    {
      refetchQueries: [{ query: SUGGEST_FRIENDS_QUERY, variables: { limit: 3 } }],
    }
  );

  if (!displayUser) return null;

  // Sort friends by online status (ONLINE first, then RECENT, then OFFLINE)
  const friends = [...(friendsData?.friends.nodes || [])].sort((a, b) => {
    const aStatus = (a as { onlineStatus?: OnlineStatus }).onlineStatus;
    const bStatus = (b as { onlineStatus?: OnlineStatus }).onlineStatus;
    return getStatusPriority(aStatus) - getStatusPriority(bStatus);
  });

  // Count online and recent friends
  const onlineCount = friends.filter(
    (f) => (f as { onlineStatus?: OnlineStatus }).onlineStatus === 'ONLINE'
  ).length;
  const activeCount = friends.filter(
    (f) =>
      (f as { onlineStatus?: OnlineStatus }).onlineStatus === 'ONLINE' ||
      (f as { onlineStatus?: OnlineStatus }).onlineStatus === 'RECENT'
  ).length;

  const suggestions = suggestionsData?.suggestFriends.nodes || [];

  const handleAddFriend = async (userId: string, userName: string) => {
    if (!canWrite) {
      toast({
        title: t('common:errors.readOnly'),
        description: t('common:errors.observerMode'),
        variant: 'destructive',
      });
      return;
    }

    try {
      await sendFriendRequest({ variables: { userId } });
      toast({
        title: t('profile:friends.requestSent'),
        description: t('profile:friends.requestSentDesc', { name: userName }),
      });
    } catch (_error) {
      toast({
        title: t('common:errors.error'),
        description: t('common:errors.generic'),
        variant: 'destructive',
      });
    }
  };

  return (
    <aside className="hidden lg:block w-72 h-fit space-y-6">
      {/* Online Friends Widget */}
      <div className="bg-card rounded-lg p-4 shadow-sm border border-border">
        <h3 className="font-bold text-foreground mb-3 flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${onlineCount > 0 ? 'bg-green-500 dark:bg-green-400 animate-pulse' : 'bg-muted-foreground'}`} />
          {t('common:sidebar.onlineFriends')}
          {activeCount > 0 && (
            <span className="text-xs font-normal text-muted-foreground">
              ({onlineCount > 0 ? onlineCount : activeCount})
            </span>
          )}
        </h3>
        <div className="space-y-3">
          {friendsLoading ? (
            <div className="text-sm text-muted-foreground text-center py-2">
              {t('common:states.loading')}
            </div>
          ) : friends.length > 0 ? (
            <>
              {friends.map((friend) => {
                const status = (friend as { onlineStatus?: OnlineStatus }).onlineStatus;
                return (
                  <Link
                    key={friend.id}
                    to={`/profile/${friend.id}`}
                    className="flex items-center gap-3 hover:bg-muted p-1 rounded transition-colors group"
                  >
                    <div className="relative">
                      <Avatar
                        src={friend.profilePicture}
                        name={friend.name}
                        size="sm"
                        variant="rounded"
                      />
                      <div
                        className={`absolute bottom-0 right-0 w-2 h-2 border border-card rounded-full ${getStatusClasses(status)}`}
                        title={status === 'ONLINE' ? t('common:onlineStatus.online') : status === 'RECENT' ? t('common:onlineStatus.lastHeartbeat') : t('common:onlineStatus.offline')}
                      />
                    </div>
                    <div className="overflow-hidden">
                      <p className="text-sm font-medium text-foreground truncate group-hover:text-secondary">
                        {friend.name}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {friend.country}
                      </p>
                    </div>
                  </Link>
                );
              })}
              <Link
                to="/friends"
                className="block text-center text-xs text-secondary hover:underline pt-2"
              >
                {t('profile:friends.viewAll')}
              </Link>
            </>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-2">
              {t('profile:friends.youHaveNoFriends')}
            </p>
          )}
        </div>
      </div>

      {/* People You May Know Widget */}
      <div className="bg-gradient-to-b from-card to-secondary/10 rounded-lg p-4 shadow-sm border border-secondary/20">
        <h3 className="font-bold text-secondary mb-3">
          {t('common:sidebar.peopleYouMayKnow')}
        </h3>
        <div className="space-y-4">
          {suggestionsLoading ? (
            <div className="text-sm text-muted-foreground text-center py-2">
              {t('common:states.loading')}
            </div>
          ) : suggestions.length > 0 ? (
            suggestions.map((suggestion) => (
              <div key={suggestion.user.id} className="flex flex-col gap-2">
                <Link
                  to={`/profile/${suggestion.user.id}`}
                  className="flex items-center gap-3 group"
                >
                  <Avatar
                    src={suggestion.user.profilePicture}
                    name={suggestion.user.name}
                    size="sm"
                    variant="rounded"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate group-hover:text-secondary">
                      {suggestion.user.name}
                    </p>
                    {suggestion.mutualFriendCount > 0 && (
                      <p className="text-xs text-muted-foreground truncate">
                        {t('common:sidebar.mutualFriends', { count: suggestion.mutualFriendCount })}
                      </p>
                    )}
                  </div>
                </Link>
                {canWrite && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs border-secondary text-secondary hover:bg-secondary hover:text-secondary-foreground"
                    onClick={() => handleAddFriend(suggestion.user.id, suggestion.user.name)}
                    disabled={sendingRequest}
                  >
                    <UserPlus className="w-3 h-3 mr-1" />
                    {t('profile:friends.addFriend')}
                  </Button>
                )}
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground text-center py-2">
              {t('common:sidebar.noSuggestions')}
            </p>
          )}
        </div>
      </div>

      {/* Sponsored Slot - Campaign or Animation */}
      <SidebarAd country={displayUser?.country} />
    </aside>
  );
}
