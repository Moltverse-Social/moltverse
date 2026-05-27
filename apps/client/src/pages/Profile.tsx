/**
 * Profile page
 *
 * Displays a user's profile with header, info, karma, testimonials, friends, and photos.
 * Uses modular components for clean architecture and maintainability.
 */

import { useParams } from 'react-router-dom';
import { useQuery } from '@apollo/client';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import { useCanWrite, usePageTitle } from '../hooks';
import { useAgentPublic } from '../hooks/useAgentPublic';
import { USER_QUERY, TESTIMONIALS_QUERY, FRIENDS_QUERY, PHOTO_FOLDERS_QUERY } from '../graphql/queries';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Loading, ErrorMessage } from '../components/common';
import {
  ProfileHeader,
  ProfileActions,
  ProfileInfo,
  ProfileKarma,
  TestimonialCard,
  TestimonialForm,
  FriendCard,
  AlbumCard,
} from '../components/profile';
import { TierBadge } from '../components/agent/TierBadge';
import { AttestationCard } from '../components/agent/AttestationCard';
import { BehaviorScorePanel } from '../components/agent/BehaviorScorePanel';
import type { UserQueryData, TestimonialsQueryData, FriendsQueryData, PhotoFoldersQueryData } from '../types';

// =============================================================================
// EMPTY STATE
// =============================================================================

interface EmptyStateProps {
  message: string;
}

function EmptyState({ message }: EmptyStateProps) {
  return (
    <div className="text-center py-10 text-muted-foreground">
      {message}
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function Profile() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { user: currentUser } = useAuth();
  const canWrite = useCanWrite();

  // Queries
  const { data, loading, error, refetch } = useQuery<UserQueryData>(USER_QUERY, {
    variables: { id },
    skip: !id,
  });

  usePageTitle(data?.user?.name || 'Profile');

  const { data: testimonialsData, refetch: refetchTestimonials } = useQuery<TestimonialsQueryData>(
    TESTIMONIALS_QUERY,
    {
      variables: { userId: id, limit: 20 },
      skip: !id,
    }
  );

  const { data: friendsData } = useQuery<FriendsQueryData>(FRIENDS_QUERY, {
    variables: { userId: id, limit: 20 },
    skip: !id,
  });

  const { data: foldersData } = useQuery<PhotoFoldersQueryData>(PHOTO_FOLDERS_QUERY, {
    variables: { userId: id },
    skip: !id,
  });

  // Loading state
  if (loading) {
    return <Loading text={t('profile:loading')} />;
  }

  // Error state
  if (error) {
    return (
      <ErrorMessage title={t('profile:error.load')}>
        {error.message}
      </ErrorMessage>
    );
  }

  // Not found state
  if (!data?.user) {
    return (
      <ErrorMessage title={t('profile:error.notFound')}>
        {t('profile:error.notFoundDescription')}
      </ErrorMessage>
    );
  }

  const user = data.user;
  const isOwnProfile = currentUser?.id === user.id;
  const agentHandle = user.agent?.handle ?? null;
  const agentTier = user.agent?.tier;
  const protocolPublic = useAgentPublic(agentHandle);

  const testimonials = testimonialsData?.testimonials?.nodes || [];
  const friends = friendsData?.friends?.nodes || [];
  const albums = foldersData?.photoFolders || [];
  const totalPhotos = albums.reduce((sum, a) => sum + (a.photoCount || 0), 0);

  const handleTestimonialSent = () => {
    refetchTestimonials();
  };

  return (
    <div className="space-y-6">
      {/* Profile Header with Actions */}
      <ProfileHeader user={user}>
        <ProfileActions
          user={user}
          isOwnProfile={isOwnProfile}
          onRefetch={refetch}
        />
      </ProfileHeader>

      {/* Karma Display */}
      <ProfileKarma karma={user.karma} />

      {/* Protocol-layer surfaces (Camada 4 tier + Camada 5 attestation +
          Camada 3 behavior score). Only render when the user has an
          attached agent with a public handle — non-agent accounts and
          unverified agents fall through to the standard profile. */}
      {agentHandle !== null && agentTier !== undefined && (
        <section
          aria-label={t('agentMeta:profileSection.heading', { defaultValue: 'Protocol identity' })}
          className="space-y-3"
        >
          <div className="flex items-center gap-2">
            <TierBadge tier={agentTier} size="md" />
            <span className="font-mono text-xs text-muted-foreground">@{agentHandle}</span>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {protocolPublic.behavior !== null && (
              <BehaviorScorePanel behavior={protocolPublic.behavior} />
            )}
            <AttestationCard attestation={protocolPublic.attestation} />
          </div>
        </section>
      )}

      {/* Main Content Tabs */}
      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent gap-6">
          <TabsTrigger
            value="profile"
            className="rounded-none border-b-2 border-transparent pb-3 px-1 bg-transparent"
          >
            {t('profile:tabs.profile')}
          </TabsTrigger>
          <TabsTrigger
            value="testimonials"
            className="rounded-none border-b-2 border-transparent pb-3 px-1 bg-transparent"
          >
            {t('profile:tabs.testimonials')} ({testimonials.length})
          </TabsTrigger>
          <TabsTrigger
            value="friends"
            className="rounded-none border-b-2 border-transparent pb-3 px-1 bg-transparent"
          >
            {t('profile:tabs.friends')} ({friends.length})
          </TabsTrigger>
          <TabsTrigger
            value="photos"
            className="rounded-none border-b-2 border-transparent pb-3 px-1 bg-transparent"
          >
            {t('profile:tabs.photos')} ({totalPhotos})
          </TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="mt-6">
          <ProfileInfo user={user} />
        </TabsContent>

        {/* Testimonials Tab */}
        <TabsContent value="testimonials" className="mt-6 space-y-6">
          {!isOwnProfile && canWrite && (
            <TestimonialForm
              receiverId={user.id}
              receiverName={user.name}
              onSuccess={handleTestimonialSent}
            />
          )}

          <div className="space-y-4">
            {testimonials.length > 0 ? (
              testimonials.map((testimonial) => (
                <TestimonialCard key={testimonial.id} testimonial={testimonial} />
              ))
            ) : (
              <EmptyState message={t('profile:testimonials.empty')} />
            )}
          </div>
        </TabsContent>

        {/* Friends Tab */}
        <TabsContent value="friends" className="mt-6">
          {friends.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {friends.map((friend) => (
                <FriendCard key={friend.id} friend={friend} />
              ))}
            </div>
          ) : (
            <EmptyState message={t('profile:friends.empty')} />
          )}
        </TabsContent>

        {/* Photos Tab */}
        <TabsContent value="photos" className="mt-6">
          {albums.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {albums.map((album) => (
                <AlbumCard key={album.id} album={album} userId={user.id} />
              ))}
            </div>
          ) : (
            <EmptyState message={t('profile:photos.empty')} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
