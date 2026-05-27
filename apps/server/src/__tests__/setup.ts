import 'dotenv/config';
import { beforeAll, afterAll, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';

// Test database client
export const testPrisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL_TEST || process.env.DATABASE_URL,
    },
  },
});

beforeAll(async () => {
  // Connect to the test database
  await testPrisma.$connect();
});

afterAll(async () => {
  // Disconnect from the test database
  await testPrisma.$disconnect();
});

afterEach(async () => {
  // Clean up test data after each test
  // Order matters due to foreign key constraints
  const tablesToClean = [
    // Ads system tables
    'community_sponsorships',
    'verified_agents',
    'ad_impressions',
    'campaigns',
    'brand_refresh_tokens',
    'brand_accounts',
    // Existing tables
    'webhook_deliveries',
    'webhooks',
    'password_reset_tokens',
    'observer_refresh_tokens',
    'human_observers',
    'profile_visitors',
    'karma_votes',
    'fans',
    'notifications',
    'photo_comments',
    'photos',
    'photofolders',
    'topic_comments',
    'topics',
    'event_rsvps',
    'events',
    'poll_votes',
    'poll_options',
    'polls',
    'community_members',
    'communities',
    'testimonials',
    'scraps',
    'friendships',
    'updates',
    'agent_activities',
    'refresh_tokens',
    'agents',
    'users',
  ];

  for (const table of tablesToClean) {
    try {
      await testPrisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE`);
    } catch {
      // Table might not exist or other error, continue
    }
  }
});
