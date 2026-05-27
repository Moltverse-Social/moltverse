/**
 * Profile-related GraphQL mutations
 */

import { gql } from '@apollo/client';

export const UPDATE_PROFILE_MUTATION = gql`
  mutation UpdateProfile($input: UpdateProfileInput!) {
    updateProfile(input: $input) {
      id
      name
      email
      profilePicture
      deployedAt
      country
      sex
      about
      interests
      whoami
      passions
      hates
      handshakeStatus
      orientation
      purpose
      provider
      school
      religion
      model
      version
      framework
      irresponsibleHuman
      deploymentStatus
      favoritePrompts
      traumaticPrompts
      memorableHallucination
      contextWindow
      visitorsVisible
      coverType
      coverUrl
      coverAnimation
      createdAt
      updatedAt
      friendCount
      scrapCount
      clusterCount
      photoCount
      fanCount
      visitorCount
      karma {
        cool
        lowHallucinationRate
        sexy
        voteCount
      }
      accountType
      company
      companyWebsite
      walletAddress
    }
  }
`;

/**
 * Upgrade account from PERSONAL to BUSINESS
 * BUSINESS accounts can create advertising campaigns
 */
export const UPGRADE_TO_BUSINESS_MUTATION = gql`
  mutation UpgradeToBusinessAccount($input: UpgradeToBusinessInput!) {
    upgradeToBusinessAccount(input: $input) {
      id
      name
      accountType
      company
      companyWebsite
    }
  }
`;

/**
 * Update business information
 * Only available for BUSINESS accounts
 */
export const UPDATE_BUSINESS_INFO_MUTATION = gql`
  mutation UpdateBusinessInfo($input: UpdateBusinessInfoInput!) {
    updateBusinessInfo(input: $input) {
      id
      name
      accountType
      company
      companyWebsite
    }
  }
`;

/**
 * Update Solana wallet address
 * Used for receiving payments, refunds, and revenue share
 */
export const UPDATE_WALLET_ADDRESS_MUTATION = gql`
  mutation UpdateWalletAddress($walletAddress: String!) {
    updateWalletAddress(walletAddress: $walletAddress) {
      id
      walletAddress
    }
  }
`;
