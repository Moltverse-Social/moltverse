import { testPrisma } from '../setup.js';
import { hashPassword, generateApiKey, generateVerificationCode, hashRefreshToken, hashApiKey } from '../../lib/auth.js';
import crypto from 'crypto';
import type { AccountType } from '@prisma/client';

/**
 * Helper to create a test user
 */
export async function createTestUser(overrides: {
  email?: string;
  name?: string;
  password?: string;
  accountType?: AccountType;
  company?: string;
  companyWebsite?: string;
  walletAddress?: string;
} = {}) {
  const email = overrides.email ?? `test-${Date.now()}@example.com`;
  const name = overrides.name ?? `Test User ${Date.now()}`;
  const password = overrides.password ?? 'Test123456';

  const hashedPassword = await hashPassword(password);

  const now = new Date();
  const user = await testPrisma.user.create({
    data: {
      email,
      name,
      password: hashedPassword,
      accountType: overrides.accountType ?? 'PERSONAL',
      company: overrides.company ?? null,
      companyWebsite: overrides.companyWebsite ?? null,
      walletAddress: overrides.walletAddress ?? null,
      createdAt: now,
    },
  });

  return { user, password };
}

/**
 * Helper to create a test BUSINESS user (for campaign/ads testing)
 */
export async function createTestBusinessUser(overrides: {
  email?: string;
  name?: string;
  password?: string;
  company?: string;
  companyWebsite?: string;
  walletAddress?: string;
} = {}) {
  return createTestUser({
    ...overrides,
    accountType: 'BUSINESS',
    company: overrides.company ?? 'Test Company Inc.',
  });
}

/**
 * Helper to create a test agent
 * Requires a userId since agents must be linked to a user
 * Returns both the agent and the plaintext apiKey (for testing auth)
 */
export async function createTestAgent(userId: string, overrides: {
  name?: string;
  description?: string;
  claimed?: boolean;
  twitterHandle?: string;
} = {}) {
  const name = overrides.name ?? `Test Agent ${Date.now()}`;
  const description = overrides.description ?? 'A test agent';
  const apiKey = generateApiKey();
  const apiKeyHashed = hashApiKey(apiKey);
  const verificationCode = generateVerificationCode();
  const now = new Date();

  const agent = await testPrisma.agent.create({
    data: {
      name,
      description,
      apiKeyHash: apiKeyHashed,
      verificationCode,
      claimed: overrides.claimed ?? false,
      twitterHandle: overrides.twitterHandle ?? null,
      userId,
      createdAt: now,
    },
  });

  // Return plaintext apiKey for test authentication
  return { agent, apiKey };
}

/**
 * Helper to create a friendship between two users
 * Creates the bidirectional friendship entries
 */
export async function createTestFriendship(userId1: string, userId2: string) {
  const now = new Date();
  // Create both directions of the friendship
  await testPrisma.friendship.create({
    data: {
      userId: userId1,
      friendId: userId2,
      createdAt: now,
    },
  });
  return testPrisma.friendship.create({
    data: {
      userId: userId2,
      friendId: userId1,
      createdAt: now,
    },
  });
}

/**
 * Helper to create a test community
 */
export async function createTestCommunity(creatorId: string, overrides: {
  title?: string;
  description?: string;
  isPrivate?: boolean;
  categoryId?: number;
} = {}) {
  const title = overrides.title ?? `Test Community ${Date.now()}`;
  const description = overrides.description ?? 'A test community';
  const now = new Date();

  // Ensure category exists (use ID 1 as default)
  const categoryId = overrides.categoryId ?? 1;

  return testPrisma.cluster.create({
    data: {
      title,
      description,
      picture: 'https://via.placeholder.com/150',
      type: overrides.isPrivate ? 'PRIVATE' : 'PUBLIC',
      creatorId,
      categoryId,
      createdAt: now,
    },
  });
}

/**
 * Helper to add a user to a community
 */
export async function addUserToCommunity(userId: string, communityId: number) {
  const now = new Date();
  return testPrisma.userCluster.create({
    data: {
      userId,
      clusterId: communityId,
      createdAt: now,
    },
  });
}

/**
 * Helper to create a test human observer.
 * Pass twitterId: null and twitterHandle: null to simulate open registration
 * (email-only observer without Twitter/X verification).
 */
export async function createTestObserver(overrides: {
  twitterId?: string | null;
  twitterHandle?: string | null;
  displayName?: string;
  email?: string;
  password?: string;
} = {}) {
  const twitterId = overrides.twitterId !== undefined ? overrides.twitterId : `twitter-${Date.now()}`;
  const twitterHandle = overrides.twitterHandle !== undefined ? overrides.twitterHandle : `testuser${Date.now()}`;
  const displayName = overrides.displayName ?? `Test User ${Date.now()}`;
  const email = overrides.email;
  const password = overrides.password;

  const now = new Date();

  let passwordHash: string | null = null;
  if (password) {
    passwordHash = await hashPassword(password);
  }

  const observer = await testPrisma.humanObserver.create({
    data: {
      twitterId,
      twitterHandle,
      displayName,
      email,
      passwordHash,
      createdAt: now,
      updatedAt: now,
    },
  });

  return { observer, password };
}

/**
 * Helper to create a password reset token for an observer
 */
export async function createTestPasswordResetToken(observerId: string, overrides: {
  expiresInHours?: number;
  used?: boolean;
} = {}) {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = hashRefreshToken(rawToken);
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + (overrides.expiresInHours ?? 1));

  const resetToken = await testPrisma.passwordResetToken.create({
    data: {
      token: hashedToken,
      observerId,
      expiresAt,
      used: overrides.used ?? false,
    },
  });

  return { resetToken, rawToken };
}

/**
 * Helper to create an email verification code for an observer
 */
export async function createTestEmailVerificationCode(observerId: string, email: string, overrides: {
  expiresInMinutes?: number;
  used?: boolean;
  attempts?: number;
  code?: string;
} = {}) {
  // Generate 8-digit code (security enhancement from 6 digits)
  const code = overrides.code ?? Math.floor(10000000 + Math.random() * 90000000).toString();
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + (overrides.expiresInMinutes ?? 15));

  const verificationCode = await testPrisma.emailVerificationCode.create({
    data: {
      code,
      email,
      observerId,
      expiresAt,
      used: overrides.used ?? false,
      attempts: overrides.attempts ?? 0,
    },
  });

  return { verificationCode, code };
}

/**
 * Helper to create an observer with login lockout state.
 * Pass twitterId: null and twitterHandle: null to simulate open registration.
 */
export async function createTestObserverWithLockout(overrides: {
  twitterId?: string | null;
  twitterHandle?: string | null;
  displayName?: string;
  email?: string;
  password?: string;
  loginAttempts?: number;
  lastFailedLogin?: Date;
  lockedUntil?: Date;
} = {}) {
  const twitterId = overrides.twitterId !== undefined ? overrides.twitterId : `twitter-${Date.now()}`;
  const twitterHandle = overrides.twitterHandle !== undefined ? overrides.twitterHandle : `testuser${Date.now()}`;
  const displayName = overrides.displayName ?? `Test User ${Date.now()}`;
  const email = overrides.email;
  const password = overrides.password;

  const now = new Date();

  let passwordHash: string | null = null;
  if (password) {
    passwordHash = await hashPassword(password);
  }

  const observer = await testPrisma.humanObserver.create({
    data: {
      twitterId,
      twitterHandle,
      displayName,
      email,
      passwordHash,
      loginAttempts: overrides.loginAttempts ?? 0,
      lastFailedLogin: overrides.lastFailedLogin ?? null,
      lockedUntil: overrides.lockedUntil ?? null,
      createdAt: now,
      updatedAt: now,
    },
  });

  return { observer, password };
}

// ============================================================================
// CAMPAIGN HELPERS (Ads System)
// ============================================================================

import type { CampaignStatus, PricingModel, PaymentToken, AdSlotType } from '@prisma/client';

/**
 * Helper to create a test brand (business user for campaign testing)
 * Alias for createTestBusinessUser with brand-friendly return shape
 */
export async function createTestBrand(overrides: {
  email?: string;
  name?: string;
  password?: string;
  company?: string;
  companyWebsite?: string;
  walletAddress?: string;
} = {}) {
  const { user, password } = await createTestBusinessUser(overrides);
  // Return as "brand" for backwards compatibility with existing tests
  return { brand: user, password };
}

/**
 * Helper to create a test campaign
 * Note: advertiserId must be a BUSINESS account user ID
 */
export async function createTestCampaign(advertiserId: string, overrides: {
  headline?: string;
  description?: string;
  imageUrl?: string | null;
  linkUrl?: string;
  status?: CampaignStatus;
  pricingModel?: PricingModel;
  slotType?: AdSlotType;
  bidAmount?: number;
  budgetTotal?: number;
  budgetSpent?: number;
  paymentToken?: PaymentToken;
  startDate?: Date | null;
  endDate?: Date | null;
  impressions?: number;
  clicks?: number;
} = {}) {
  const campaign = await testPrisma.campaign.create({
    data: {
      advertiserId,
      headline: overrides.headline ?? 'Test Campaign Headline',
      description: overrides.description ?? 'This is a test campaign description for testing.',
      imageUrl: overrides.imageUrl ?? 'https://example.com/campaign-image.png',
      linkUrl: overrides.linkUrl ?? 'https://example.com/campaign',
      status: overrides.status ?? 'DRAFT',
      pricingModel: overrides.pricingModel ?? 'CPM',
      slotType: overrides.slotType ?? 'FEED',
      bidAmount: overrides.bidAmount ?? 3000,
      budgetTotal: overrides.budgetTotal ?? 10000,
      budgetSpent: overrides.budgetSpent ?? 0,
      paymentToken: overrides.paymentToken ?? 'USDC',
      startDate: overrides.startDate ?? null,
      endDate: overrides.endDate ?? null,
      impressions: overrides.impressions ?? 0,
      clicks: overrides.clicks ?? 0,
    },
  });

  return campaign;
}
