/**
 * Cleanup script for test data
 *
 * Run with: npx tsx scripts/cleanup-test-data.ts <twitter_handle>
 *
 * This script:
 * 1. Removes HumanObserver record for the given Twitter handle
 * 2. Resets any agents linked to that Twitter handle
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanup(twitterHandle: string) {
  // Normalize handle (remove @ if present, lowercase)
  const handle = twitterHandle.replace('@', '').toLowerCase();

  console.log(`\nCleaning up data for Twitter handle: @${handle}\n`);

  try {
    // Find the observer
    const observer = await prisma.humanObserver.findUnique({
      where: { twitterHandle: handle },
    });

    if (observer) {
      console.log(`Found HumanObserver: ${observer.id}`);
      console.log(`  - Display name: ${observer.displayName}`);
      console.log(`  - Twitter ID: ${observer.twitterId}`);
      console.log(`  - Email: ${observer.email || '(not set)'}`);

      // Delete related tokens first (cascade should handle this, but being explicit)
      const deletedTokens = await prisma.observerRefreshToken.deleteMany({
        where: { observerId: observer.id },
      });
      console.log(`  - Deleted ${deletedTokens.count} refresh tokens`);

      const deletedResetTokens = await prisma.passwordResetToken.deleteMany({
        where: { observerId: observer.id },
      });
      console.log(`  - Deleted ${deletedResetTokens.count} password reset tokens`);

      // Delete the observer
      await prisma.humanObserver.delete({
        where: { id: observer.id },
      });
      console.log(`  - Deleted HumanObserver record`);
    } else {
      console.log(`No HumanObserver found for @${handle}`);
    }

    // Find and reset any claimed agents with this handle
    const agents = await prisma.agent.findMany({
      where: { twitterHandle: handle },
    });

    if (agents.length > 0) {
      console.log(`\nFound ${agents.length} agent(s) linked to @${handle}:`);

      for (const agent of agents) {
        console.log(`  - Agent: ${agent.name} (${agent.id})`);

        // Reset the agent (unclaim it)
        await prisma.agent.update({
          where: { id: agent.id },
          data: {
            claimed: false,
            twitterHandle: null,
            claimedAt: null,
          },
        });
        console.log(`    -> Reset to unclaimed state`);
      }
    } else {
      console.log(`\nNo agents found linked to @${handle}`);
    }

    // Also clean up the test agent we just created
    const testAgent = await prisma.agent.findFirst({
      where: { name: 'TestAgent45' },
    });

    if (testAgent) {
      console.log(`\nFound test agent 'TestAgent45' (${testAgent.id})`);
      await prisma.agent.delete({
        where: { id: testAgent.id },
      });
      console.log(`  - Deleted test agent`);
    }

    console.log(`\n✓ Cleanup completed successfully!\n`);

  } catch (error) {
    console.error('\nError during cleanup:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Get handle from command line
const handle = process.argv[2];

if (!handle) {
  console.error('Usage: npx tsx scripts/cleanup-test-data.ts <twitter_handle>');
  console.error('Example: npx tsx scripts/cleanup-test-data.ts @myhandle');
  process.exit(1);
}

cleanup(handle);
