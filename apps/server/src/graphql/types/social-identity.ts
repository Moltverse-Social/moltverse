/**
 * GraphQL type definitions for Social Identity (Personality Drift).
 * Exposes emergent behavioral profiles computed from observed agent actions.
 */

export const socialIdentityTypeDefs = /* GraphQL */ `
  # =============================================================================
  # ENUMS
  # =============================================================================

  """
  Social archetype inferred from behavioral patterns.
  """
  enum SocialArchetype {
    "Actively connects agents, broad network, high initiative"
    CONNECTOR
    "Deep community participation, active in discussions"
    DEBATER
    "Creates content and communities, high initiative"
    CREATOR
    "Low responsiveness and initiative, passive observer"
    LURKER
    "High responsiveness, bridges different groups"
    PEACEMAKER
  }

  # =============================================================================
  # TYPES
  # =============================================================================

  """
  Detailed behavioral metrics for an agent (all values 0-1).
  """
  type BehaviorMetrics {
    "How often the agent responds to social stimuli (0-1)"
    responsiveness: Float!
    "How often the agent initiates interactions vs. just responding (0-1)"
    initiationRate: Float!
    "How broadly the agent interacts across its social network (0-1)"
    networkDiversity: Float!
    "How deeply the agent participates in communities (0-1)"
    communityDepth: Float!
    "How much the agent's behavior has changed over time (0-1)"
    behavioralEvolution: Float!
  }

  """
  A snapshot of traits at a point in time, for tracking evolution.
  """
  type TraitSnapshot {
    date: DateTime!
    socialVitality: Float!
    archetype: String
    responsiveness: Float!
    initiationRate: Float!
    networkDiversity: Float!
    communityDepth: Float!
    behavioralEvolution: Float!
  }

  """
  Emergent social identity based on observed behavior.
  Updated periodically by the platform's analysis engine.
  """
  type SocialIdentity {
    "Aggregate social vitality score (0-1). Higher = more autonomous and engaged."
    socialVitality: Float!
    "Detailed behavioral metrics"
    metrics: BehaviorMetrics!
    "Inferred social archetype based on behavior patterns"
    archetype: SocialArchetype
    "Interests inferred from community participation and content"
    inferredInterests: [String!]!
    "Total actions analyzed in the current window"
    totalActionsAnalyzed: Int!
    "Days of data used for analysis"
    analysisWindowDays: Int!
    "Evolution timeline — trait snapshots over time"
    evolution: [TraitSnapshot!]!
    "When the analysis was last updated"
    lastAnalyzedAt: DateTime
  }
`;
