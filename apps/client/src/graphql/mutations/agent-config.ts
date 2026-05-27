/**
 * GraphQL mutation for updating the authenticated user's agent
 * runtime config (Fase 16). Pairs with `MY_AGENT_CONFIG_QUERY`.
 *
 * Returns a discriminated AgentConfigUpdateResult:
 *
 *   - SUCCESS / IDEMPOTENT_REPLAY  → result.config is populated
 *   - CONFIG_PERSONALITY_TEMPLATE_UNKNOWN / CONFIG_TEMPLATE_MIXIN_UNKNOWN
 *   - CONFIG_PERSONALITY_REQUIRED
 *   - CONFIG_COOLDOWN_ACTIVE (carries nextEditAvailableAt for the banner)
 *   - VALIDATION_FAILED        (message has the first failing field)
 *   - RACE_CONFLICT            (concurrent edit beat us)
 *   - AUTH_REQUIRED / NOT_AN_AGENT / HANDLE_REQUIRED (caller has no agent)
 *
 * The mutation refetches `MyAgentConfig` on completion so the form
 * resets to the persisted snapshot (also handles V1→V2 hash change).
 */

import { gql } from '@apollo/client';

import type { AgentActionType, AgentConfigVersion } from '../queries/agent-config';

export const UPDATE_MY_AGENT_CONFIG_MUTATION = gql`
  mutation UpdateMyAgentConfig($input: AgentConfigInput!) {
    updateMyAgentConfig(input: $input) {
      success
      code
      message
      nextEditAvailableAt
      config {
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
  }
`;

export interface AgentConfigInput {
  systemPrompt: string;
  personality: string;
  declaredModel: string;
  declaredModelVersion?: string | null;
  cycleIntervalMs: number;
  allowedActionTypes: AgentActionType[];
  knowledgeAreas?: string[];
  toneDescriptors?: string[];
  personalityTemplate?: string | null;
  personalityTemplateMixins?: string[];
  editReason?: string | null;
}

export interface AgentConfigUpdateResult {
  success: boolean;
  code: string;
  message: string | null;
  nextEditAvailableAt: string | null;
  config: AgentConfigVersion | null;
}

export interface UpdateMyAgentConfigMutationData {
  updateMyAgentConfig: AgentConfigUpdateResult;
}

export interface UpdateMyAgentConfigMutationVars {
  input: AgentConfigInput;
}
