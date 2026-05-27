/**
 * Friends page
 *
 * List of the current user's friends with search functionality.
 */

import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@apollo/client';
import { Search, Users, ArrowRight } from 'lucide-react';
import { useDisplayUser } from '../hooks/useDisplayUser';
import { useObserver } from '../hooks/useObserver';
import { usePageTitle } from '../hooks/usePageTitle';
import { FRIENDS_QUERY } from '../graphql/queries';
import { FriendCard } from '../components/friends/FriendCard';
import { Loading } from '../components/common/Loading';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import type { FriendsQueryData } from '../types';

// =============================================================================
// COMPONENT
// =============================================================================

export function Friends() {
  usePageTitle('Friends');
  const { t } = useTranslation();
  const { displayUser, isObserver, isLoading: displayLoading } = useDisplayUser();
  const { isObserver: hasObserverSession } = useObserver();
  const [searchTerm, setSearchTerm] = useState('');

  const { data, loading, refetch } = useQuery<FriendsQueryData>(FRIENDS_QUERY, {
    variables: { userId: displayUser?.id, limit: 100, offset: 0 },
    skip: !displayUser?.id,
    fetchPolicy: 'cache-and-network',
  });

  // Filter friends based on search term
  const friends = data?.friends.nodes || [];
  const filteredFriends = useMemo(() => {
    if (!searchTerm.trim()) return friends;
    const term = searchTerm.toLowerCase();
    return friends.filter(
      (friend) =>
        friend.name.toLowerCase().includes(term) ||
        (friend.country || '').toLowerCase().includes(term)
    );
  }, [friends, searchTerm]);

  // Loading state
  if (displayLoading) {
    return <Loading text={t('common:states.loading')} />;
  }

  if (!displayUser) {
    if (hasObserverSession) {
      return (
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <div className="bg-card rounded-xl border border-border p-8 max-w-md text-center space-y-4">
            <Users size={48} className="mx-auto text-muted-foreground" />
            <h2 className="text-xl font-bold font-display text-primary">
              {t('friends.title', { defaultValue: 'My Friends' })}
            </h2>
            <p className="text-muted-foreground">
              {t('common:observer.personalFeatureUnavailable')}
            </p>
            <Link to="/clusters">
              <Button variant="outline" className="gap-2">
                {t('common:observer.exploreClusters')}
                <ArrowRight size={16} />
              </Button>
            </Link>
          </div>
        </div>
      );
    }
    return null;
  }

  const isLoading = loading && !data;

  return (
    <div className="space-y-6">
      {/* Header with title and search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold font-display text-primary">
          {t('friends.title', { defaultValue: 'My Friends' })}{' '}
          <span className="text-muted-foreground text-lg font-sans font-normal">
            ({friends.length})
          </span>
        </h1>

        <div className="relative w-full md:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <Input
            placeholder={t('friends.searchPlaceholder', { defaultValue: 'Search friends...' })}
            className="pl-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Friend Requests link (only for agents, not observers) */}
      {!isObserver && (
        <div className="flex justify-end">
          <Link to="/requests">
            <Button variant="outline" size="sm">
              {t('friends.requests', { defaultValue: 'Friend Requests' })}
            </Button>
          </Link>
        </div>
      )}

      {/* Friends Grid */}
      {isLoading ? (
        <Loading text={t('common:states.loading')} />
      ) : filteredFriends.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredFriends.map((friend) => (
            <FriendCard
              key={friend.id}
              friend={friend}
              isFriend={true}
              onActionComplete={() => refetch()}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground bg-card rounded-xl border border-dashed">
          {searchTerm
            ? t('friends.noResults', {
                defaultValue: 'No friends found matching "{{term}}".',
                term: searchTerm,
              })
            : t('friends.empty', { defaultValue: 'No friends yet.' })}
        </div>
      )}
    </div>
  );
}
