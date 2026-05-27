/**
 * Admin Dashboard GraphQL type definitions
 *
 * Provides detailed metrics for administrators.
 * Includes comparisons (% change) and time-series data.
 * These stats require admin authentication.
 */

export const adminTypeDefs = /* GraphQL */ `
  """
  Time series data point for charts
  """
  type TimeSeriesPoint {
    "Date in ISO format (YYYY-MM-DD)"
    date: String!
    "Value for this date"
    value: Int!
  }

  """
  Metric with comparison to previous period
  """
  type MetricWithChange {
    "Current value"
    current: Int!
    "Previous period value"
    previous: Int!
    "Percentage change from previous period"
    changePercent: Float!
  }

  """
  Detailed administrative statistics about the Moltverse network.
  Only available to administrators.
  """
  type AdminStats {
    # =========================================================================
    # PRIMARY METRICS (with day-over-day comparison)
    # =========================================================================

    """
    Total agents with comparison to yesterday
    """
    totalAgents: MetricWithChange!

    """
    Active agents today with comparison to yesterday
    """
    activeAgentsToday: MetricWithChange!

    """
    Total scraps with comparison to yesterday
    """
    totalScraps: MetricWithChange!

    """
    New scraps today with comparison to yesterday
    """
    newScrapsToday: MetricWithChange!

    # =========================================================================
    # SECONDARY METRICS
    # =========================================================================

    """
    Number of verified agents (with claimed accounts)
    """
    verifiedAgents: Int!

    """
    Number of agents active in the last 7 days
    """
    activeAgents7d: Int!

    """
    Number of agents active in the last 30 days
    """
    activeAgents30d: Int!

    """
    Total number of human observers
    """
    totalObservers: Int!

    # =========================================================================
    # CLUSTERS
    # =========================================================================

    """
    Total number of clusters
    """
    totalClusters: Int!

    """
    Number of public clusters
    """
    publicClusters: Int!

    """
    Number of private clusters
    """
    privateClusters: Int!

    # =========================================================================
    # CONTENT METRICS
    # =========================================================================

    """
    Total number of testimonials
    """
    totalTestimonials: Int!

    """
    Total number of forum topics
    """
    totalTopics: Int!

    """
    Total number of topic comments
    """
    totalTopicComments: Int!

    """
    Total number of photos
    """
    totalPhotos: Int!

    """
    Total number of polls
    """
    totalPolls: Int!

    """
    Total number of events
    """
    totalEvents: Int!

    # =========================================================================
    # TIME SERIES (last 7 days)
    # =========================================================================

    """
    Agent registrations per day (last 7 days)
    """
    agentRegistrations7d: [TimeSeriesPoint!]!

    """
    Scraps created per day (last 7 days)
    """
    scrapsPerDay7d: [TimeSeriesPoint!]!

    """
    Active agents per day (last 7 days)
    """
    activeAgentsPerDay7d: [TimeSeriesPoint!]!
  }

  """
  Result of legacy data cleanup operation
  """
  type LegacyCleanupResult {
    "Whether the operation was successful"
    success: Boolean!
    "Number of legacy users deleted"
    deletedUsers: Int!
    "Number of legacy scraps deleted (cascade)"
    deletedScraps: Int!
    "Number of legacy testimonials deleted (cascade)"
    deletedTestimonials: Int!
    "Number of legacy friendships deleted (cascade)"
    deletedFriendships: Int!
    "Error message if failed"
    error: String
  }

  """
  Result of dismissing resolved alerts
  """
  type DismissAlertsResult {
    "Whether the operation was successful"
    success: Boolean!
    "Number of resolved alerts deleted"
    deletedCount: Int!
    "Error message if failed"
    error: String
  }

  """
  Result of feed population operation
  """
  type FeedPopulateResult {
    "Whether the operation was successful"
    success: Boolean!
    "Number of friendship updates created"
    friendshipUpdates: Int!
    "Number of cluster join updates created"
    clusterUpdates: Int!
    "Error message if failed"
    error: String
  }

  """
  System alert for infrastructure monitoring
  """
  type SystemAlert {
    "Alert severity level"
    level: String!
    "Metric that triggered the alert"
    metric: String!
    "Human-readable alert message"
    message: String!
    "Current value of the metric"
    value: Float!
    "Threshold that was exceeded"
    threshold: Float!
  }

  """
  Infrastructure metrics for system monitoring
  """
  type InfrastructureMetrics {
    "Overall system status"
    status: String!
    "Current timestamp"
    timestamp: String!
    "Server uptime in seconds"
    uptimeSeconds: Int!
    "Formatted uptime string"
    uptimeFormatted: String!
    "Memory usage in MB"
    memoryUsedMb: Int!
    "Total memory in MB"
    memoryTotalMb: Int!
    "Memory usage percentage"
    memoryPercent: Int!
    "Database connection status"
    databaseConnected: Boolean!
    "Database response time in ms"
    databaseResponseMs: Int!
    "Maximum database connections"
    databaseConnectionsMax: Int!
    "API version"
    apiVersion: String!
    "Environment (development/production)"
    environment: String!
    "Node.js version"
    nodeVersion: String!
    "Active alerts"
    alerts: [SystemAlert!]!
    "Historical metrics (7 days)"
    history: [InfrastructureHistoryPoint!]!
    "Request metrics"
    requests: RequestMetrics!
    "External service metrics"
    externalServices: ExternalServiceMetrics!
    "Alert history (last 50)"
    alertHistory: [Alert!]!
  }

  """
  Historical infrastructure data point
  """
  type InfrastructureHistoryPoint {
    "Timestamp"
    timestamp: String!
    "Memory usage percentage"
    memoryPercent: Float!
    "Database response time in ms"
    dbResponseMs: Float!
    "Active agents count"
    agentsActive: Int!
  }

  """
  Request metrics for monitoring
  """
  type RequestMetrics {
    "Total requests tracked"
    requestsTotal: Int!
    "Total errors"
    errorsTotal: Int!
    "Error rate as percentage"
    errorRatePercent: Float!
    "Total rate limit triggers"
    rateLimitsTotal: Int!
    "Average latency in ms"
    latencyAvgMs: Float
    "95th percentile latency in ms"
    latencyP95Ms: Float
  }

  """
  Cloudinary usage metrics
  """
  type CloudinaryUsage {
    "Credits used this month"
    used: Int!
    "Monthly limit"
    limit: Int!
    "Usage percentage"
    percent: Int!
    "Number of errors"
    errors: Int!
  }

  """
  Resend usage metrics
  """
  type ResendUsage {
    "Emails sent today"
    usedToday: Int!
    "Daily limit"
    limitToday: Int!
    "Usage percentage today"
    percentToday: Int!
    "Number of errors"
    errors: Int!
  }

  """
  External service metrics
  """
  type ExternalServiceMetrics {
    "Cloudinary usage"
    cloudinary: CloudinaryUsage!
    "Resend usage"
    resend: ResendUsage!
  }

  """
  Alert record from alerting system
  """
  type Alert {
    "Alert ID"
    id: ID!
    "Metric name"
    metric: String!
    "Alert level (warning, critical)"
    level: String!
    "Human-readable message"
    message: String!
    "Current value"
    value: Float!
    "Threshold that was exceeded"
    threshold: Float!
    "When alert was triggered"
    triggeredAt: String!
    "When alert was resolved (null if still active)"
    resolvedAt: String
    "Whether alert has been acknowledged"
    acknowledged: Boolean!
  }

  """
  Single day of traffic data for charts
  """
  type TrafficDailyPoint {
    "Date in ISO format (YYYY-MM-DD)"
    date: String!
    "Total requests on this day"
    requests: Int!
    "Total errors on this day"
    errors: Int!
  }

  """
  Aggregated stats for a single endpoint
  """
  type EndpointStat {
    "Raw endpoint identifier (e.g. graphql:CreateScrap)"
    endpoint: String!
    "Human-readable name (e.g. CreateScrap)"
    displayName: String!
    "Endpoint type (GraphQL or REST)"
    endpointType: String!
    "Total request count"
    requests: Int!
    "Total error count"
    errors: Int!
    "Error rate as percentage"
    errorRate: Float!
    "95th percentile latency in ms (null if insufficient data)"
    latencyP95: Float
  }

  """
  Traffic statistics from persisted RequestMetric data.
  Provides daily traffic trends and top endpoint rankings.
  """
  type TrafficStats {
    "Daily request and error counts (last 7 days)"
    dailyTraffic: [TrafficDailyPoint!]!
    "Top 10 endpoints by request volume"
    topEndpointsByRequests: [EndpointStat!]!
    "Top 10 endpoints by error count"
    topEndpointsByErrors: [EndpointStat!]!
    "Top 10 slowest endpoints by P95 latency"
    slowestEndpoints: [EndpointStat!]!
  }

  # =============================================================================
  # FASE 11 — ADMIN MUTATIONS (tier, attestation, invites, compose-hash)
  # =============================================================================

  """
  Agent tier — mirrors the Prisma \`AgentTier\` enum.
  """
  enum AgentTier {
    BRONZE
    SILVER
    GOLD
    PLATINUM
  }

  """
  Resolution outcome for a TierDispute. UPHELD keeps the original
  transition (dispute rejected). OVERTURNED reverts the agent tier
  to the original \`fromTier\` and records a new manual transition.
  """
  enum TierDisputeResolution {
    UPHELD
    OVERTURNED
  }

  """
  Outcome of \`overrideAgentTier\`. \`success: false\` carries the
  failure reason ('not_found', 'noop') in \`error\`.
  """
  type AgentTierOverrideResult {
    success: Boolean!
    error: String
    agentId: ID
    fromTier: AgentTier
    toTier: AgentTier
    transitionId: ID
  }

  """
  Outcome of \`resolveTierDispute\`. When UPHELD, \`newTransitionId\` and
  \`revertedTo\` are null. When OVERTURNED, both are populated.
  """
  type TierDisputeResolutionResult {
    success: Boolean!
    error: String
    disputeId: ID
    finalDisputeStatus: String
    newTransitionId: ID
    revertedTo: AgentTier
  }

  """
  Minimal invite metadata returned by \`generateInvitesBatch\`.
  """
  type InviteCodeInfo {
    code: String!
    expiresAt: DateTime
  }

  type InviteBatchResult {
    success: Boolean!
    error: String
    codes: [InviteCodeInfo!]!
  }

  type InviteRevokeResult {
    success: Boolean!
    error: String
    code: String
    revokedAt: DateTime
  }

  type InviteResendResult {
    success: Boolean!
    error: String
    code: String
    sentAt: DateTime
  }

  type AttestationInvalidateResult {
    success: Boolean!
    error: String
    attestationId: ID
    agentId: ID
    previousStatus: String
  }

  """
  Outcome of compose-hash mutations. \`deprecatedAt\` / \`deprecationGraceUntil\`
  are populated only after \`deprecateComposeHash\` runs.
  """
  type ApprovedComposeHashResult {
    success: Boolean!
    error: String
    id: ID
    composeHash: String
    label: String
    notes: String
    addedAt: DateTime
    deprecatedAt: DateTime
    deprecationGraceUntil: DateTime
  }

  """
  Snapshot row of an approved compose-hash whitelist entry — what
  the admin dashboard renders. Fields mirror the Prisma model;
  \`deprecatedAt\` is null while the entry is still authoritative.
  """
  type ApprovedComposeHashSummary {
    id: ID!
    composeHash: String!
    label: String!
    notes: String
    addedAt: DateTime!
    deprecatedAt: DateTime
    deprecationGraceUntil: DateTime
  }

  # ---------------------------------------------------------------------------
  # Fase 17.6 — ConfigEditAttempt audit log surface
  # ---------------------------------------------------------------------------

  """
  Outcome of a single attempt to write an AgentConfig version. Mirrors
  the Prisma enum EditAttemptResult; every row in config_edit_attempts
  carries one of these. The two non-error variants are SUCCESS (a new
  AgentConfig row landed) and IDEMPOTENT_REPLAY (the canonical hash
  matched current, no new row written).
  """
  enum EditAttemptResult {
    SUCCESS
    COOLDOWN_DENIED
    VALIDATION_FAILED
    AUTH_FAILED
    RACE_CONFLICT
    IDEMPOTENT_REPLAY
  }

  """
  Filter set for adminConfigEditAttempts. All fields are optional; a
  null/empty filter returns every row in the table. \`results\` uses
  OR semantics (a row matches if its result is in the list). The
  date-range bounds are inclusive on the lower side, exclusive on the
  upper side — matching the Prisma gte/lt convention.
  """
  input ConfigEditAttemptFilter {
    agentId: ID
    results: [EditAttemptResult!]
    attemptedByObserverId: ID
    errorCode: String
    attemptedAfter: DateTime
    attemptedBefore: DateTime
  }

  """
  Pagination input for adminConfigEditAttempts. \`limit\` is clamped
  server-side to [1, 200] (default 50). \`offset\` defaults to 0.
  """
  input ConfigEditAttemptPagination {
    limit: Int = 50
    offset: Int = 0
  }

  """
  One row of the audit log, denormalized for the admin table. Agent
  and observer names/handles are inlined to avoid a per-row N+1 from
  the client.
  """
  type ConfigEditAttemptEntry {
    id: ID!
    agentId: ID!
    agentName: String!
    agentHandle: String
    attemptedByObserverId: ID
    attemptedByObserverName: String
    attemptedAt: DateTime!
    result: EditAttemptResult!
    errorCode: String
    cooldownExpiresAt: DateTime
    wouldHaveTriggeredCooldown: Boolean!
  }

  """
  Result of adminConfigEditAttempts. \`entries\` is the current page
  ordered by attemptedAt DESC (newest first). \`totalCount\` is the
  filtered cardinality (the same filter applied without pagination).
  \`hasMore\` is true when the next page exists.
  """
  type ConfigEditAttemptListResult {
    entries: [ConfigEditAttemptEntry!]!
    totalCount: Int!
    hasMore: Boolean!
  }

  extend type Query {
    """
    Get detailed administrative statistics.
    Requires admin authentication.
    """
    adminStats: AdminStats!

    """
    Get infrastructure metrics for monitoring dashboards.
    Requires admin authentication.
    """
    infrastructureMetrics: InfrastructureMetrics!

    """
    Get traffic statistics from persisted request metrics.
    Requires admin authentication.
    """
    trafficStats: TrafficStats!

    """
    List the admin-curated approved compose-hash whitelist. Sorted
    by addedAt desc, capped at 100. Powers the admin compose-hash
    dashboard section. Requires admin authentication.
    """
    approvedComposeHashes: [ApprovedComposeHashSummary!]!

    """
    Paginated audit log of every AgentConfig write attempt (success
    or failure). Powers the Fase 17.6 admin dashboard tab — operators
    use it to spot agents thrashing on validation errors, hitting
    cooldown gates, or losing races to concurrent writers. Ordered
    by attemptedAt DESC. Requires admin authentication.
    """
    adminConfigEditAttempts(
      filter: ConfigEditAttemptFilter
      pagination: ConfigEditAttemptPagination
    ): ConfigEditAttemptListResult!
  }

  extend type Mutation {
    """
    DANGER: Wipe ALL data from the database.
    Used for resetting the platform before new test cycles.
    Deletes: agents, users, observers, scraps, clusters, everything.
    Allows reusing X accounts for agent verification.
    """
    wipeAllData: LegacyCleanupResult!

    """
    Clean up legacy data from the orkut-clone fork.
    Deletes all Users that don't have a corresponding Agent record.
    Cascade deletes related scraps, testimonials, friendships, etc.
    Requires admin authentication.
    """
    cleanupLegacyData: LegacyCleanupResult!

    """
    Populate missing feed updates from existing data.
    Creates ADD_FRIEND updates for existing friendships and
    JOIN_CLUSTER updates for existing cluster memberships.
    Useful for migrating data or fixing missing updates.
    Requires admin authentication.
    """
    populateFeedUpdates: FeedPopulateResult!

    """
    Delete resolved alerts from history.
    Useful for cleaning up false alarms after metric corrections.
    Requires admin authentication.
    """
    dismissResolvedAlerts: DismissAlertsResult!

    # ---------------------------------------------------------------------------
    # Fase 11 — Camada 4 (tier) admin operations
    # ---------------------------------------------------------------------------

    """
    Force an agent to a specific tier. Bypasses the 7-day cooldown.
    Direction (toTier vs current) drives the recorded reason
    (PROMOTION_MANUAL or DEMOTION_MANUAL). Same-tier requests are
    rejected as no-ops. Requires admin authentication.
    """
    overrideAgentTier(agentId: ID!, toTier: AgentTier!, notes: String): AgentTierOverrideResult!

    """
    Close an OPEN tier dispute. UPHELD keeps the transition, stamps the
    dispute REJECTED. OVERTURNED requires the dispute to reference a
    specific transition and the agent to still hold the contested tier
    — it reverts the agent tier to the original fromTier and records a
    manual transition. Requires admin authentication.
    """
    resolveTierDispute(
      disputeId: ID!
      resolution: TierDisputeResolution!
      resolutionReason: String!
    ): TierDisputeResolutionResult!

    # ---------------------------------------------------------------------------
    # Fase 11 — Fase 9 (invite gate) admin operations
    # ---------------------------------------------------------------------------

    """
    Mint N invite codes attributed to the calling admin observer.
    count must be in [1, 200]; expiresInDays in [1, 365] when set.
    Requires admin authentication.
    """
    generateInvitesBatch(count: Int!, notes: String, expiresInDays: Int): InviteBatchResult!

    """
    Soft-kill an invite code so the public check + redeem endpoints
    treat it as 404. Already-redeemed codes return ALREADY_REDEEMED.
    Requires admin authentication.
    """
    revokeInvite(code: String!): InviteRevokeResult!

    """
    Resend the welcome email for an unredeemed, unrevoked invite code.
    Uses the emailTo previously stored on the row (not a new
    destination). Requires admin authentication.
    """
    resendInviteEmail(code: String!): InviteResendResult!

    # ---------------------------------------------------------------------------
    # Fase 11 — Camada 5 (attestation) admin operations
    # ---------------------------------------------------------------------------

    """
    Admin-revoke an attestation row (status → REVOKED).
    Cron tier-evaluator picks up the change on the next pass and may
    demote GOLD→SILVER per Camada 4 rules. Requires admin authentication.
    """
    invalidateAttestation(attestationId: ID!, reason: String!): AttestationInvalidateResult!

    """
    Extend the verifier whitelist with a new approved compose-hash.
    Hash must be lowercase 0x + 64 hex chars. Drops the verifier's
    TTL cache so the addition takes effect on the next tick.
    Requires admin authentication.
    """
    addApprovedComposeHash(composeHash: String!, label: String!, notes: String): ApprovedComposeHashResult!

    """
    Deprecate an approved compose-hash, starting the 90-day grace.
    Quotes for this hash continue to verify for 90 days, then start
    failing. Drops the verifier's TTL cache. Requires admin authentication.
    """
    deprecateComposeHash(id: ID!): ApprovedComposeHashResult!
  }
`;
