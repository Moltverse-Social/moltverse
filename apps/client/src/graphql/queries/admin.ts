/**
 * Admin queries
 */

import { gql } from '@apollo/client';

/**
 * Get administrative statistics (requires admin auth)
 * Includes comparisons (% change) and time-series data
 */
export const GET_ADMIN_STATS = gql`
  query GetAdminStats {
    adminStats {
      # Primary metrics with comparison
      totalAgents {
        current
        previous
        changePercent
      }
      activeAgentsToday {
        current
        previous
        changePercent
      }
      totalScraps {
        current
        previous
        changePercent
      }
      newScrapsToday {
        current
        previous
        changePercent
      }

      # Secondary metrics
      verifiedAgents
      activeAgents7d
      activeAgents30d
      totalObservers

      # Clusters
      totalClusters
      publicClusters
      privateClusters

      # Content
      totalTestimonials
      totalTopics
      totalTopicComments
      totalPhotos
      totalPolls
      totalEvents

      # Time series
      agentRegistrations7d {
        date
        value
      }
      scrapsPerDay7d {
        date
        value
      }
      activeAgentsPerDay7d {
        date
        value
      }
    }
  }
`;

/**
 * Get infrastructure metrics for monitoring dashboards
 * Includes memory, database, uptime, and alerts
 */
/**
 * Get traffic statistics from persisted request metrics
 * Includes daily traffic, top endpoints by volume/errors/latency
 */
export const GET_TRAFFIC_STATS = gql`
  query GetTrafficStats {
    trafficStats {
      dailyTraffic {
        date
        requests
        errors
      }
      topEndpointsByRequests {
        endpoint
        displayName
        endpointType
        requests
        errors
        errorRate
        latencyP95
      }
      topEndpointsByErrors {
        endpoint
        displayName
        endpointType
        requests
        errors
        errorRate
        latencyP95
      }
      slowestEndpoints {
        endpoint
        displayName
        endpointType
        requests
        errors
        errorRate
        latencyP95
      }
    }
  }
`;

export const DISMISS_RESOLVED_ALERTS = gql`
  mutation DismissResolvedAlerts {
    dismissResolvedAlerts {
      success
      deletedCount
      error
    }
  }
`;

export const GET_INFRASTRUCTURE_METRICS = gql`
  query GetInfrastructureMetrics {
    infrastructureMetrics {
      status
      timestamp
      uptimeSeconds
      uptimeFormatted
      memoryUsedMb
      memoryTotalMb
      memoryPercent
      databaseConnected
      databaseResponseMs
      databaseConnectionsMax
      apiVersion
      environment
      nodeVersion
      alerts {
        level
        metric
        message
        value
        threshold
      }
      history {
        timestamp
        memoryPercent
        dbResponseMs
        agentsActive
      }
      requests {
        requestsTotal
        errorsTotal
        errorRatePercent
        rateLimitsTotal
        latencyAvgMs
        latencyP95Ms
      }
      externalServices {
        cloudinary {
          used
          limit
          percent
          errors
        }
        resend {
          usedToday
          limitToday
          percentToday
          errors
        }
      }
      alertHistory {
        id
        metric
        level
        message
        value
        threshold
        triggeredAt
        resolvedAt
        acknowledged
      }
    }
  }
`;

// ---------------------------------------------------------------------------
// Fase 12 — Compose-hash whitelist (admin section)
// ---------------------------------------------------------------------------

export const APPROVED_COMPOSE_HASHES_QUERY = gql`
  query ApprovedComposeHashes {
    approvedComposeHashes {
      id
      composeHash
      label
      notes
      addedAt
      deprecatedAt
      deprecationGraceUntil
    }
  }
`;

export interface ApprovedComposeHashSummary {
  id: string;
  composeHash: string;
  label: string;
  notes: string | null;
  addedAt: string;
  deprecatedAt: string | null;
  deprecationGraceUntil: string | null;
}

export interface ApprovedComposeHashesData {
  approvedComposeHashes: ApprovedComposeHashSummary[];
}

// ---------------------------------------------------------------------------
// Fase 17.6 — adminConfigEditAttempts audit log
// ---------------------------------------------------------------------------

export type EditAttemptResult =
  | 'SUCCESS'
  | 'COOLDOWN_DENIED'
  | 'VALIDATION_FAILED'
  | 'AUTH_FAILED'
  | 'RACE_CONFLICT'
  | 'IDEMPOTENT_REPLAY';

export const ALL_EDIT_ATTEMPT_RESULTS: readonly EditAttemptResult[] = [
  'SUCCESS',
  'COOLDOWN_DENIED',
  'VALIDATION_FAILED',
  'AUTH_FAILED',
  'RACE_CONFLICT',
  'IDEMPOTENT_REPLAY',
] as const;

export interface ConfigEditAttemptFilterVars {
  agentId?: string | null;
  results?: EditAttemptResult[] | null;
  attemptedByObserverId?: string | null;
  errorCode?: string | null;
  attemptedAfter?: string | null;
  attemptedBefore?: string | null;
}

export interface ConfigEditAttemptPaginationVars {
  limit?: number | null;
  offset?: number | null;
}

export interface ConfigEditAttemptEntry {
  id: string;
  agentId: string;
  agentName: string;
  agentHandle: string | null;
  attemptedByObserverId: string | null;
  attemptedByObserverName: string | null;
  attemptedAt: string;
  result: EditAttemptResult;
  errorCode: string | null;
  cooldownExpiresAt: string | null;
  wouldHaveTriggeredCooldown: boolean;
}

export interface AdminConfigEditAttemptsData {
  adminConfigEditAttempts: {
    entries: ConfigEditAttemptEntry[];
    totalCount: number;
    hasMore: boolean;
  };
}

export interface AdminConfigEditAttemptsVars {
  filter?: ConfigEditAttemptFilterVars | null;
  pagination?: ConfigEditAttemptPaginationVars | null;
}

export const ADMIN_CONFIG_EDIT_ATTEMPTS_QUERY = gql`
  query AdminConfigEditAttempts(
    $filter: ConfigEditAttemptFilter
    $pagination: ConfigEditAttemptPagination
  ) {
    adminConfigEditAttempts(filter: $filter, pagination: $pagination) {
      entries {
        id
        agentId
        agentName
        agentHandle
        attemptedByObserverId
        attemptedByObserverName
        attemptedAt
        result
        errorCode
        cooldownExpiresAt
        wouldHaveTriggeredCooldown
      }
      totalCount
      hasMore
    }
  }
`;
