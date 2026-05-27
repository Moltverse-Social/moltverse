/**
 * Cleanup script for legacy fork data
 *
 * This script removes all Users that don't have a corresponding Agent record.
 * These are legacy users from the original orkut-clone fork, not real agents.
 *
 * Run with: npx tsx scripts/cleanup-legacy-data.ts
 *
 * Use --dry-run to preview what would be deleted without actually deleting.
 * Use --force to skip confirmation prompt.
 */

import { PrismaClient } from '@prisma/client';
import * as readline from 'readline';

const prisma = new PrismaClient();

interface LegacyStats {
  legacyUserCount: number;
  realAgentCount: number;
  legacyScrapCount: number;
  legacyTestimonialCount: number;
  legacyFriendshipCount: number;
}

async function getLegacyStats(): Promise<LegacyStats> {
  // Find users without an Agent record (legacy users)
  const legacyUsers = await prisma.user.findMany({
    where: {
      agent: null,
    },
    select: { id: true },
  });

  const legacyUserIds = legacyUsers.map((u) => u.id);

  // Count related data that will be deleted
  const [legacyScrapCount, legacyTestimonialCount, legacyFriendshipCount, realAgentCount] =
    await Promise.all([
      prisma.scrap.count({
        where: {
          OR: [{ senderId: { in: legacyUserIds } }, { receiverId: { in: legacyUserIds } }],
        },
      }),
      prisma.testimonial.count({
        where: {
          OR: [{ senderId: { in: legacyUserIds } }, { receiverId: { in: legacyUserIds } }],
        },
      }),
      prisma.friendship.count({
        where: {
          OR: [{ userId: { in: legacyUserIds } }, { friendId: { in: legacyUserIds } }],
        },
      }),
      prisma.agent.count({ where: { claimed: true } }),
    ]);

  return {
    legacyUserCount: legacyUsers.length,
    realAgentCount,
    legacyScrapCount,
    legacyTestimonialCount,
    legacyFriendshipCount,
  };
}

async function deleteLegacyData(): Promise<number> {
  // Find all users without an Agent record
  const legacyUsers = await prisma.user.findMany({
    where: {
      agent: null,
    },
    select: { id: true, name: true, email: true },
  });

  if (legacyUsers.length === 0) {
    console.log('No legacy users found. Database is clean.');
    return 0;
  }

  console.log(`\nDeleting ${legacyUsers.length} legacy users...`);

  // Delete users one by one to show progress
  // Cascade will automatically delete related data (scraps, testimonials, etc.)
  let deleted = 0;
  for (const user of legacyUsers) {
    await prisma.user.delete({
      where: { id: user.id },
    });
    deleted++;
    if (deleted % 10 === 0) {
      console.log(`  Deleted ${deleted}/${legacyUsers.length}...`);
    }
  }

  return deleted;
}

async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (yes/no): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes');
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const isForce = args.includes('--force');

  console.log('\n========================================');
  console.log('  Moltverse Legacy Data Cleanup');
  console.log('========================================\n');

  if (isDryRun) {
    console.log('MODE: Dry run (no changes will be made)\n');
  }

  try {
    // Get stats first
    console.log('Analyzing database...\n');
    const stats = await getLegacyStats();

    console.log('Current database state:');
    console.log('----------------------------------------');
    console.log(`  Real agents (claimed):     ${stats.realAgentCount}`);
    console.log(`  Legacy users (no agent):   ${stats.legacyUserCount}`);
    console.log('');
    console.log('Data to be deleted:');
    console.log('----------------------------------------');
    console.log(`  Users:        ${stats.legacyUserCount}`);
    console.log(`  Scraps:       ${stats.legacyScrapCount}`);
    console.log(`  Testimonials: ${stats.legacyTestimonialCount}`);
    console.log(`  Friendships:  ${stats.legacyFriendshipCount}`);
    console.log('');

    if (stats.legacyUserCount === 0) {
      console.log('Nothing to clean up. Database is already clean.\n');
      return;
    }

    if (isDryRun) {
      console.log('Dry run complete. No changes were made.');
      console.log('Run without --dry-run to actually delete the data.\n');
      return;
    }

    // Confirm deletion
    if (!isForce) {
      const confirmed = await confirm(
        `\nThis will permanently delete ${stats.legacyUserCount} legacy users and all related data. Continue?`
      );

      if (!confirmed) {
        console.log('\nOperation cancelled.\n');
        return;
      }
    }

    // Perform deletion
    const deletedCount = await deleteLegacyData();

    console.log('\n========================================');
    console.log('  Cleanup Complete');
    console.log('========================================');
    console.log(`  Deleted ${deletedCount} legacy users`);
    console.log(`  Related scraps, testimonials, friendships also deleted (cascade)`);
    console.log('');

    // Verify final state
    const finalStats = await getLegacyStats();
    console.log('Final database state:');
    console.log('----------------------------------------');
    console.log(`  Real agents:   ${finalStats.realAgentCount}`);
    console.log(`  Legacy users:  ${finalStats.legacyUserCount}`);
    console.log(`  Legacy scraps: ${finalStats.legacyScrapCount}`);
    console.log('');
  } catch (error) {
    console.error('\nError during cleanup:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main();
