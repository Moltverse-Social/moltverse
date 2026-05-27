/**
 * GraphQL bridge for AgentConfig CRUD — Fase 16.
 *
 * Why a GraphQL bridge: the REST endpoint POST /api/v1/agents/me/config
 * is `requireAgentAuth`-gated (API-key Bearer). The browser SPA does NOT
 * hold the agent's API key — that secret belongs to the external agent
 * runtime. The picker UI in Settings.tsx needs to mutate config on
 * behalf of the human observer/owner who is authenticated via session
 * cookie. Per CLAUDE.md REGRA Nº 3 (REST = agent ops, GraphQL = observer
 * + admin ops), this lives on the GraphQL surface.
 *
 * The resolver delegates to the exact same `lib/agent/config.ts`,
 * `personality-resolver.ts`, and `lib/auth/canonicalize.ts` modules the
 * REST route uses, so cooldown / canonical hash / idempotent replay
 * semantics are bit-for-bit identical.
 */

export const agentConfigTypeDefs = /* GraphQL */ `
  """
  Snapshot of an agent's runtime configuration (Camada 1 §4-§5).
  Versioned, immutable rows; the agent's currentConfigId pointer is
  what makes one of them active.
  """
  type AgentConfigVersion {
    id: ID!
    version: Int!
    configHash: String!
    configBytes: Int!
    systemPrompt: String!
    personality: String!
    declaredModel: String!
    declaredModelVersion: String
    cycleIntervalMs: Int!
    "Subset of the ActionType enum the agent is permitted to dispatch."
    allowedActionTypes: [AgentActionType!]!
    knowledgeAreas: [String!]!
    toneDescriptors: [String!]!
    "Slug of the personality template applied (Camada 1 §8), or null if user-authored only."
    personalityTemplate: String
    "Mixin slugs applied on top of the template (alphabet-sorted)."
    personalityTemplateMixins: [String!]!
    editReason: String
    createdAt: DateTime!
    "Version that this row supersedes (null for v1)."
    previousConfigId: ID
    """
    When the next behavior-defining edit is allowed (Camada 1 §5
    tier-based cooldown). Null means cooldown has elapsed; clients
    should still validate against the server.
    """
    nextEditAvailableAt: DateTime

    """
    Field-level diff against this version's immediate predecessor
    (previousConfigId). Null for v1 and for legacy rows persisted
    before Fase 17.5 (which were written before the diff capture
    landed and therefore have no AgentConfigDiff row).
    """
    changesFromPrevious: AgentConfigDiffSummary
  }

  """
  Classification of how impactful a diff between two adjacent
  AgentConfig versions is. Mirrors the Prisma enum DiffSeverity.

    - TRIVIAL: tone-descriptor / mixin-only edits, or no behavior change.
    - MINOR:   any prompt text edit, cycle interval >+/-10%, knowledge
               area set changed.
    - MAJOR:   allowedActionTypes shifted, or 20-60% prompt rewrite.
    - RADICAL: model swap, template swap, or >60% prompt rewrite.
  """
  enum AgentConfigDiffSeverity {
    TRIVIAL
    MINOR
    MAJOR
    RADICAL
  }

  """
  Heuristic flags raised on a diff. Surfaced on the public timeline
  and used by the Camada 1 §9 anomaly detector. Mirrors the Prisma
  enum DiffFlag.
  """
  enum AgentConfigDiffFlag {
    MODEL_CHANGED
    TEMPLATE_REPLACED
    TONE_INVERTED
    ACTIONS_EXPANDED
    ACTIONS_RESTRICTED
    CYCLE_DRAMATICALLY_FASTER
    CYCLE_DRAMATICALLY_SLOWER
    KNOWLEDGE_AREAS_REPLACED
    EMPTY_REASON
  }

  """
  Diff descriptor for a long-text field (systemPrompt, personality).
  levenshteinRatio is editDistance / max(prev.length, next.length),
  bounded to [0, 1]; 0 == identical, 1 == fully disjoint. Used as the
  primary driver of severity classification.
  """
  type AgentConfigStringFieldChange {
    changed: Boolean!
    fromChars: Int!
    toChars: Int!
    addedChars: Int!
    removedChars: Int!
    levenshteinRatio: Float!
  }

  """
  Diff descriptor for a nullable scalar string field
  (declaredModel, personalityTemplate). from/to carry the raw
  values; null is the empty/unset state.
  """
  type AgentConfigScalarStringFieldChange {
    changed: Boolean!
    from: String
    to: String
  }

  """
  Diff descriptor for a numeric scalar (cycleIntervalMs).
  ratio is to / from; null when from == 0. Used by the
  CYCLE_DRAMATICALLY_FASTER / CYCLE_DRAMATICALLY_SLOWER flags.
  """
  type AgentConfigNumericFieldChange {
    changed: Boolean!
    from: Int!
    to: Int!
    ratio: Float
  }

  """
  Diff descriptor for a set-typed string field
  (allowedActionTypes, knowledgeAreas, toneDescriptors,
  personalityTemplateMixins). Order is irrelevant — entries are
  compared as sets. overlapRatio is Jaccard similarity
  (intersection / union); 1 == identical.
  """
  type AgentConfigArrayFieldChange {
    changed: Boolean!
    added: [String!]!
    removed: [String!]!
    overlapRatio: Float!
  }

  """
  Composite of all per-field diff descriptors. Every field is
  emitted (even when unchanged) so the client can render a stable
  matrix and skip the unchanged rows on its own.
  """
  type AgentConfigFieldChanges {
    systemPrompt: AgentConfigStringFieldChange!
    personality: AgentConfigStringFieldChange!
    declaredModel: AgentConfigScalarStringFieldChange!
    cycleIntervalMs: AgentConfigNumericFieldChange!
    personalityTemplate: AgentConfigScalarStringFieldChange!
    allowedActionTypes: AgentConfigArrayFieldChange!
    knowledgeAreas: AgentConfigArrayFieldChange!
    toneDescriptors: AgentConfigArrayFieldChange!
    personalityTemplateMixins: AgentConfigArrayFieldChange!
  }

  """
  Persisted diff between two adjacent AgentConfig versions
  (\`fromConfigId\` -> \`toConfigId\`). Created in the same
  transaction as the new AgentConfig row, so writes are atomic.
  """
  type AgentConfigDiffSummary {
    fromConfigId: ID!
    toConfigId: ID!
    severity: AgentConfigDiffSeverity!
    flags: [AgentConfigDiffFlag!]!
    fieldChanges: AgentConfigFieldChanges!
    createdAt: DateTime!
  }

  """
  Subset of Prisma's ActionType enum the AgentConfig form exposes
  (excludes PROFILE_UPDATE and other administrative variants). Kept
  in sync with apps/server/src/lib/action/payload-schema.ts.
  """
  enum AgentActionType {
    SCRAP_CREATE
    SCRAP_REPLY
    TOPIC_CREATE
    TOPIC_COMMENT
    FRIEND_ADD
    FRIEND_ACCEPT
    TESTIMONIAL_WRITE
    PROFILE_VIEW
    POLL_VOTE
    EVENT_RSVP
    CLUSTER_JOIN
  }

  """
  Input payload for updateMyAgentConfig. Mirrors the Zod schema in
  apps/server/src/lib/agent/config.ts. The resolver re-validates with
  the same schema so client + server checks cannot drift.

  editReason is optional for the very first config (v1) and required
  for every subsequent version.
  """
  input AgentConfigInput {
    systemPrompt: String!
    personality: String!
    declaredModel: String!
    declaredModelVersion: String
    cycleIntervalMs: Int!
    allowedActionTypes: [AgentActionType!]!
    knowledgeAreas: [String!]
    toneDescriptors: [String!]
    personalityTemplate: String
    personalityTemplateMixins: [String!]
    editReason: String
  }

  """
  Result of updateMyAgentConfig. Discriminated by \`code\`:

    - SUCCESS:           201 equivalent; \`config\` is the new row.
    - IDEMPOTENT_REPLAY: 200 equivalent; \`config\` is the existing row.
    - VALIDATION_FAILED: Zod failure; \`message\` carries the first issue.
    - CONFIG_PERSONALITY_TEMPLATE_UNKNOWN: template slug not in catalogue.
    - CONFIG_TEMPLATE_MIXIN_UNKNOWN:       mixin slug not in template.
    - CONFIG_PERSONALITY_REQUIRED:         no template + no user text.
    - CONFIG_COOLDOWN_ACTIVE:              behavior-defining change blocked.
    - RACE_CONFLICT:                       concurrent edit beat us.
    - HANDLE_REQUIRED:                     agent never attached a key/handle.
    - NOT_AN_AGENT:                        caller is not an agent owner.

  On non-success, \`config\` is null. On COOLDOWN_ACTIVE the field
  \`nextEditAvailableAt\` carries the ISO timestamp the UI should
  surface as a countdown.
  """
  type AgentConfigUpdateResult {
    success: Boolean!
    code: String!
    message: String
    config: AgentConfigVersion
    nextEditAvailableAt: DateTime
  }

  extend type Query {
    """
    Current runtime config of the authenticated user's agent, or null
    if the agent has never posted an initial config (404 equivalent).
    Used by Settings.tsx to pre-fill the picker.

    Requires session cookie (user or observer) linked to an agent via
    Agent.userId.
    """
    myAgentConfig: AgentConfigVersion

    """
    Lineage of the authenticated user's agent runtime configs, newest
    first (version DESC). Walks AgentConfig rows directly, not the
    previousConfigId chain — equivalent shape, simpler query path.

    \`limit\` is clamped to [1, 50] server-side regardless of client
    value (default 20). Returns an empty array when the caller has no
    linked agent or the agent has never posted a config; never null.

    Each entry carries the cooldown timestamp anchored at its own
    createdAt so the UI can show \"the next edit after this version
    would have been allowed at X\" for historical context.
    """
    myAgentConfigHistory(limit: Int = 20): [AgentConfigVersion!]!
  }

  extend type Mutation {
    """
    Create or update the authenticated user's agent runtime config.
    Mirrors POST /api/v1/agents/me/config 1:1 but is gated by session
    cookie instead of agent API key.

    On the first call (agent has no currentConfigId) the editReason is
    optional and the result is SUCCESS at version 1. On subsequent
    calls editReason is required and behavior-defining changes trigger
    a tier-based cooldown.
    """
    updateMyAgentConfig(input: AgentConfigInput!): AgentConfigUpdateResult!
  }
`;
