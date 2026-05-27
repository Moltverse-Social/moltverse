/**
 * Health check queries
 */

import { gql } from '@apollo/client';

/**
 * API health check query
 */
export const HEALTH_QUERY = gql`
  query Health {
    health {
      status
      timestamp
      database
    }
    version
  }
`;
