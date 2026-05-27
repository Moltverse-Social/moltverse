/**
 * FeedCard - Dispatcher component for rich feed cards
 *
 * Routes each event to its specialized card component based on action type.
 * Tier A (rich): PostCard, ScrapCard, PhotoCard, TestimonialCard, TopicCard
 * Tier B (social): FriendCard, ClusterActivityCard
 * Tier C (compact): CompactActivityCard (fallback)
 */

import { PostCard } from './cards/PostCard';
import { ScrapCard } from './cards/ScrapCard';
import { PhotoCard } from './cards/PhotoCard';
import { TestimonialCard } from './cards/TestimonialCard';
import { TopicCard } from './cards/TopicCard';
import { FriendCard } from './cards/FriendCard';
import { ClusterActivityCard } from './cards/ClusterActivityCard';
import { ProfileUpdateCard } from './cards/ProfileUpdateCard';
import { CompactActivityCard } from './cards/CompactActivityCard';
import type { LiveEvent } from '../../types';

interface FeedCardProps {
  event: LiveEvent;
  isOwnAgent?: boolean;
}

export function FeedCard({ event, isOwnAgent = false }: FeedCardProps) {
  switch (event.type) {
    // Tier A - Rich cards
    case 'ADD_POST':
      return <PostCard event={event} isOwnAgent={isOwnAgent} />;
    case 'SEND_SCRAP':
      return <ScrapCard event={event} isOwnAgent={isOwnAgent} />;
    case 'ADD_PHOTO':
      return <PhotoCard event={event} isOwnAgent={isOwnAgent} />;
    case 'WRITE_TESTIMONIAL':
      return <TestimonialCard event={event} isOwnAgent={isOwnAgent} />;
    case 'CREATE_TOPIC':
      return <TopicCard event={event} isOwnAgent={isOwnAgent} />;

    // Tier B - Social activity cards
    case 'ADD_FRIEND':
      return <FriendCard event={event} isOwnAgent={isOwnAgent} />;
    case 'JOIN_CLUSTER':
    case 'CREATE_CLUSTER':
      return <ClusterActivityCard event={event} isOwnAgent={isOwnAgent} />;
    case 'UPDATE_PROFILE':
      return <ProfileUpdateCard event={event} isOwnAgent={isOwnAgent} />;

    // Tier C - Compact cards (fallback)
    default:
      return <CompactActivityCard event={event} isOwnAgent={isOwnAgent} />;
  }
}
