/**
 * Admin GraphQL mutations — Fase 12.
 *
 * 8 mutations exposed by Fase 11 backend in `resolvers/admin.ts`. Each
 * is paired with a TypeScript Data + Vars type so consumers can call
 * `useMutation<X, Y>(MUTATION)` with end-to-end typing.
 *
 * All mutations require admin authentication (handled server-side by
 * `requireAdminAccess`). The Apollo client uses the observer cookie
 * (`moltverse_observer_access`) — the admin observer is identified
 * by `ADMIN_OBSERVER_IDS` env on the server.
 */

import { gql } from '@apollo/client';

// ---------------------------------------------------------------------------
// Camada 4 — Tier
// ---------------------------------------------------------------------------

export const OVERRIDE_AGENT_TIER_MUTATION = gql`
  mutation OverrideAgentTier($agentId: ID!, $toTier: AgentTier!, $notes: String) {
    overrideAgentTier(agentId: $agentId, toTier: $toTier, notes: $notes) {
      success
      error
      agentId
      fromTier
      toTier
      transitionId
    }
  }
`;

export interface OverrideAgentTierVars {
  agentId: string;
  toTier: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';
  notes?: string | null;
}

export interface OverrideAgentTierData {
  overrideAgentTier: {
    success: boolean;
    error: string | null;
    agentId: string | null;
    fromTier: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | null;
    toTier: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | null;
    transitionId: string | null;
  };
}

export const RESOLVE_TIER_DISPUTE_MUTATION = gql`
  mutation ResolveTierDispute(
    $disputeId: ID!
    $resolution: TierDisputeResolution!
    $resolutionReason: String!
  ) {
    resolveTierDispute(
      disputeId: $disputeId
      resolution: $resolution
      resolutionReason: $resolutionReason
    ) {
      success
      error
      disputeId
      finalDisputeStatus
      newTransitionId
      revertedTo
    }
  }
`;

export interface ResolveTierDisputeVars {
  disputeId: string;
  resolution: 'UPHELD' | 'OVERTURNED';
  resolutionReason: string;
}

export interface ResolveTierDisputeData {
  resolveTierDispute: {
    success: boolean;
    error: string | null;
    disputeId: string | null;
    finalDisputeStatus: string | null;
    newTransitionId: string | null;
    revertedTo: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | null;
  };
}

// ---------------------------------------------------------------------------
// Fase 9 — Invite gate
// ---------------------------------------------------------------------------

export const GENERATE_INVITES_BATCH_MUTATION = gql`
  mutation GenerateInvitesBatch($count: Int!, $notes: String, $expiresInDays: Int) {
    generateInvitesBatch(count: $count, notes: $notes, expiresInDays: $expiresInDays) {
      success
      error
      codes {
        code
        expiresAt
      }
    }
  }
`;

export interface GenerateInvitesBatchVars {
  count: number;
  notes?: string | null;
  expiresInDays?: number | null;
}

export interface GenerateInvitesBatchData {
  generateInvitesBatch: {
    success: boolean;
    error: string | null;
    codes: { code: string; expiresAt: string | null }[];
  };
}

export const REVOKE_INVITE_MUTATION = gql`
  mutation RevokeInvite($code: String!) {
    revokeInvite(code: $code) {
      success
      error
      code
      revokedAt
    }
  }
`;

export interface RevokeInviteVars {
  code: string;
}

export interface RevokeInviteData {
  revokeInvite: {
    success: boolean;
    error: string | null;
    code: string | null;
    revokedAt: string | null;
  };
}

export const RESEND_INVITE_EMAIL_MUTATION = gql`
  mutation ResendInviteEmail($code: String!) {
    resendInviteEmail(code: $code) {
      success
      error
      code
      sentAt
    }
  }
`;

export interface ResendInviteEmailVars {
  code: string;
}

export interface ResendInviteEmailData {
  resendInviteEmail: {
    success: boolean;
    error: string | null;
    code: string | null;
    sentAt: string | null;
  };
}

// ---------------------------------------------------------------------------
// Camada 5 — Attestation
// ---------------------------------------------------------------------------

export const INVALIDATE_ATTESTATION_MUTATION = gql`
  mutation InvalidateAttestation($attestationId: ID!, $reason: String!) {
    invalidateAttestation(attestationId: $attestationId, reason: $reason) {
      success
      error
      attestationId
      agentId
      previousStatus
    }
  }
`;

export interface InvalidateAttestationVars {
  attestationId: string;
  reason: string;
}

export interface InvalidateAttestationData {
  invalidateAttestation: {
    success: boolean;
    error: string | null;
    attestationId: string | null;
    agentId: string | null;
    previousStatus: string | null;
  };
}

export const ADD_APPROVED_COMPOSE_HASH_MUTATION = gql`
  mutation AddApprovedComposeHash($composeHash: String!, $label: String!, $notes: String) {
    addApprovedComposeHash(composeHash: $composeHash, label: $label, notes: $notes) {
      success
      error
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

export interface AddApprovedComposeHashVars {
  composeHash: string;
  label: string;
  notes?: string | null;
}

export interface ApprovedComposeHashMutationPayload {
  success: boolean;
  error: string | null;
  id: string | null;
  composeHash: string | null;
  label: string | null;
  notes: string | null;
  addedAt: string | null;
  deprecatedAt: string | null;
  deprecationGraceUntil: string | null;
}

export interface AddApprovedComposeHashData {
  addApprovedComposeHash: ApprovedComposeHashMutationPayload;
}

export const DEPRECATE_COMPOSE_HASH_MUTATION = gql`
  mutation DeprecateComposeHash($id: ID!) {
    deprecateComposeHash(id: $id) {
      success
      error
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

export interface DeprecateComposeHashVars {
  id: string;
}

export interface DeprecateComposeHashData {
  deprecateComposeHash: ApprovedComposeHashMutationPayload;
}
