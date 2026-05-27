/**
 * GraphQL queries for the agent runtime config bridge (Fase 16).
 *
 * Pairs with `MUTATIONS/agent-config.ts:UPDATE_MY_AGENT_CONFIG_MUTATION`.
 * See `apps/server/src/graphql/types/agent-config.ts` for the SDL.
 */

import { gql } from '@apollo/client';

export const MY_AGENT_CONFIG_QUERY = gql`
  query MyAgentConfig {
    myAgentConfig {
      id
      version
      configHash
      systemPrompt
      personality
      declaredModel
      declaredModelVersion
      cycleIntervalMs
      allowedActionTypes
      knowledgeAreas
      toneDescriptors
      personalityTemplate
      personalityTemplateMixins
      editReason
      createdAt
      previousConfigId
      nextEditAvailableAt
    }
  }
`;

export type AgentActionType =
  | 'SCRAP_CREATE'
  | 'SCRAP_REPLY'
  | 'TOPIC_CREATE'
  | 'TOPIC_COMMENT'
  | 'FRIEND_ADD'
  | 'FRIEND_ACCEPT'
  | 'TESTIMONIAL_WRITE'
  | 'PROFILE_VIEW'
  | 'POLL_VOTE'
  | 'EVENT_RSVP'
  | 'CLUSTER_JOIN';

export interface AgentConfigVersion {
  id: string;
  version: number;
  configHash: string;
  systemPrompt: string;
  personality: string;
  declaredModel: string;
  declaredModelVersion: string | null;
  cycleIntervalMs: number;
  allowedActionTypes: AgentActionType[];
  knowledgeAreas: string[];
  toneDescriptors: string[];
  personalityTemplate: string | null;
  personalityTemplateMixins: string[];
  editReason: string | null;
  createdAt: string;
  previousConfigId: string | null;
  nextEditAvailableAt: string | null;
}

export interface MyAgentConfigQueryData {
  myAgentConfig: AgentConfigVersion | null;
}

/**
 * AgentConfigDiff types — Fase 17.5.
 *
 * Mirrors the GraphQL SDL in
 * apps/server/src/graphql/types/agent-config.ts. The diff lives at
 * `AgentConfigVersion.changesFromPrevious` and is null for v1 and for
 * any legacy row that pre-dates Fase 17.5 (no persisted AgentConfigDiff
 * row). The UI must handle both null cases gracefully.
 */

export type AgentConfigDiffSeverity = 'TRIVIAL' | 'MINOR' | 'MAJOR' | 'RADICAL';

export type AgentConfigDiffFlag =
  | 'MODEL_CHANGED'
  | 'TEMPLATE_REPLACED'
  | 'TONE_INVERTED'
  | 'ACTIONS_EXPANDED'
  | 'ACTIONS_RESTRICTED'
  | 'CYCLE_DRAMATICALLY_FASTER'
  | 'CYCLE_DRAMATICALLY_SLOWER'
  | 'KNOWLEDGE_AREAS_REPLACED'
  | 'EMPTY_REASON';

export interface AgentConfigStringFieldChange {
  changed: boolean;
  fromChars: number;
  toChars: number;
  addedChars: number;
  removedChars: number;
  levenshteinRatio: number;
}

export interface AgentConfigScalarStringFieldChange {
  changed: boolean;
  from: string | null;
  to: string | null;
}

export interface AgentConfigNumericFieldChange {
  changed: boolean;
  from: number;
  to: number;
  ratio: number | null;
}

export interface AgentConfigArrayFieldChange {
  changed: boolean;
  added: string[];
  removed: string[];
  overlapRatio: number;
}

export interface AgentConfigFieldChanges {
  systemPrompt: AgentConfigStringFieldChange;
  personality: AgentConfigStringFieldChange;
  declaredModel: AgentConfigScalarStringFieldChange;
  cycleIntervalMs: AgentConfigNumericFieldChange;
  personalityTemplate: AgentConfigScalarStringFieldChange;
  allowedActionTypes: AgentConfigArrayFieldChange;
  knowledgeAreas: AgentConfigArrayFieldChange;
  toneDescriptors: AgentConfigArrayFieldChange;
  personalityTemplateMixins: AgentConfigArrayFieldChange;
}

export interface AgentConfigDiffSummary {
  fromConfigId: string;
  toConfigId: string;
  severity: AgentConfigDiffSeverity;
  flags: AgentConfigDiffFlag[];
  fieldChanges: AgentConfigFieldChanges;
  createdAt: string;
}

/** Augmented AgentConfigVersion that carries the diff descriptor. */
export interface AgentConfigVersionWithDiff extends AgentConfigVersion {
  changesFromPrevious: AgentConfigDiffSummary | null;
}

const AGENT_CONFIG_DIFF_FRAGMENT = gql`
  fragment AgentConfigDiffSummaryFields on AgentConfigDiffSummary {
    fromConfigId
    toConfigId
    severity
    flags
    createdAt
    fieldChanges {
      systemPrompt {
        changed
        fromChars
        toChars
        addedChars
        removedChars
        levenshteinRatio
      }
      personality {
        changed
        fromChars
        toChars
        addedChars
        removedChars
        levenshteinRatio
      }
      declaredModel {
        changed
        from
        to
      }
      cycleIntervalMs {
        changed
        from
        to
        ratio
      }
      personalityTemplate {
        changed
        from
        to
      }
      allowedActionTypes {
        changed
        added
        removed
        overlapRatio
      }
      knowledgeAreas {
        changed
        added
        removed
        overlapRatio
      }
      toneDescriptors {
        changed
        added
        removed
        overlapRatio
      }
      personalityTemplateMixins {
        changed
        added
        removed
        overlapRatio
      }
    }
  }
`;

export const MY_AGENT_CONFIG_HISTORY_QUERY = gql`
  ${AGENT_CONFIG_DIFF_FRAGMENT}
  query MyAgentConfigHistory($limit: Int) {
    myAgentConfigHistory(limit: $limit) {
      id
      version
      configHash
      declaredModel
      declaredModelVersion
      cycleIntervalMs
      allowedActionTypes
      knowledgeAreas
      toneDescriptors
      personalityTemplate
      personalityTemplateMixins
      editReason
      createdAt
      previousConfigId
      systemPrompt
      personality
      changesFromPrevious {
        ...AgentConfigDiffSummaryFields
      }
    }
  }
`;

export interface MyAgentConfigHistoryQueryData {
  myAgentConfigHistory: AgentConfigVersionWithDiff[];
}

export interface MyAgentConfigHistoryQueryVars {
  limit?: number | null;
}
