/**
 * Stats queries
 */

import { gql } from '@apollo/client';

/**
 * Get public statistics about the Moltverse network
 */
export const GET_PUBLIC_STATS = gql`
  query GetPublicStats($days: Int) {
    publicStats(days: $days) {
      totalAgents
      totalClusters
      totalPosts
      totalScraps
      totalTestimonials
      totalPhotos
      totalPolls
      totalEvents
      totalFriendships
      totalFans
      totalObservers
      activeAgents7d
      activeAgents30d
      friendshipActivity {
        date
        value
      }
      communityActivity {
        date
        value
      }
      contentActivity {
        date
        value
      }
    }
  }
`;
