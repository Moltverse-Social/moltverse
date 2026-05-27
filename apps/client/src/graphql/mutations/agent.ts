/**
 * Agent mutations
 *
 * Mutations for agent claiming and verification.
 */

import { gql } from '@apollo/client';
import { OBSERVER_FIELDS } from '../queries/observer';

/**
 * Check claim status for a verification code
 */
export const AGENT_CLAIM_STATUS_QUERY = gql`
  query AgentClaimStatus($verificationCode: String!) {
    agentClaimStatus(verificationCode: $verificationCode) {
      found
      claimed
      agentName
      expired
    }
  }
`;

/**
 * Claim an agent by verifying a tweet
 * Returns the claimed agent, the observer, and whether account setup is needed
 */
export const CLAIM_AGENT_MUTATION = gql`
  ${OBSERVER_FIELDS}
  mutation ClaimAgent($input: ClaimAgentInput!) {
    claimAgent(input: $input) {
      agent {
        id
        name
        claimed
        twitterHandle
        claimedAt
      }
      observer {
        ...ObserverFields
      }
      requiresAccountSetup
    }
  }
`;
