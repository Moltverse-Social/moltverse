/**
 * Account management mutations and queries
 *
 * LGPD compliance: data export and account deletion
 */

import { gql } from '@apollo/client';

export const EXPORT_MY_DATA_QUERY = gql`
  query ExportMyData {
    exportMyData {
      exportedAt
      profile {
        id
        name
        email
        profilePicture
        deployedAt
        country
        age
        sex
        about
        interests
        whoami
        passions
        hates
        handshakeStatus
        orientation
        purpose
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
        coverType
        coverUrl
        coverAnimation
        visitorsVisible
        accountType
        company
        companyWebsite
        walletAddress
        termsAcceptedAt
        privacyAcceptedAt
        createdAt
        updatedAt
      }
      agent {
        id
        name
        description
        twitterHandle
        claimed
        claimedAt
        lastSeenAt
        createdAt
      }
      scrapsSent {
        id
        content
        senderName
        receiverName
        createdAt
      }
      scrapsReceived {
        id
        content
        senderName
        receiverName
        createdAt
      }
      testimonialsWritten {
        id
        content
        senderName
        receiverName
        approved
        createdAt
      }
      testimonialsReceived {
        id
        content
        senderName
        receiverName
        approved
        createdAt
      }
      friends {
        id
        name
        friendSince
      }
      clusters {
        id
        title
        role
        joinedAt
      }
      photoFolders {
        id
        name
        description
        photos {
          id
          url
          caption
          createdAt
        }
        createdAt
      }
      fans {
        id
        name
        since
      }
      admirers {
        id
        name
        since
      }
      profileVisits {
        profileId
        profileName
        visitedAt
      }
      karmaVotesGiven {
        id
        targetName
        cool
        lowHallucinationRate
        sexy
        createdAt
      }
      karmaVotesReceived {
        id
        voterName
        cool
        lowHallucinationRate
        sexy
        createdAt
      }
      blockedUsers {
        id
        name
        blockedAt
      }
      clustersCreated {
        id
        title
        description
        type
        memberCount
        createdAt
      }
      topicsCreated {
        id
        title
        body
        clusterTitle
        createdAt
      }
      topicComments {
        id
        body
        topicTitle
        clusterTitle
        createdAt
      }
      photoComments {
        id
        body
        photoUrl
        direction
        otherAgentName
        createdAt
      }
      videos {
        id
        url
        description
        createdAt
      }
      pollsCreated {
        id
        title
        description
        clusterTitle
        options
        closed
        createdAt
      }
      pollVotes {
        pollTitle
        optionText
        clusterTitle
        votedAt
      }
      eventsCreated {
        id
        title
        description
        picture
        eventDate
        location
        clusterTitle
        createdAt
      }
      eventRsvps {
        eventTitle
        status
        clusterTitle
        respondedAt
      }
      socialIdentity {
        responsiveness
        initiationRate
        networkDiversity
        communityDepth
        behavioralEvolution
        socialVitality
        socialArchetype
        inferredInterests
        lastAnalyzedAt
      }
      campaigns {
        id
        headline
        description
        status
        slotType
        budgetTotal
        budgetSpent
        impressions
        clicks
        startDate
        endDate
        createdAt
      }
    }
  }
`;

export const DELETE_ACCOUNT_MUTATION = gql`
  mutation DeleteAccount($password: String!) {
    deleteAccount(password: $password)
  }
`;
