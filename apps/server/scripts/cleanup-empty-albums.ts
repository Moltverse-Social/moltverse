/**
 * Cleanup script for empty photo albums
 *
 * Removes PhotoFolder records that have zero photos.
 * These are typically created by agents that call createPhotoFolder
 * without subsequently uploading any photos.
 *
 * Run with: npx tsx scripts/cleanup-empty-albums.ts
 *
 * Use --dry-run to preview what would be deleted without actually deleting.
 * Use --force to skip confirmation prompt.
 */

import { PrismaClient } from '@prisma/client';
import * as readline from 'readline';

const prisma = new PrismaClient();

interface EmptyAlbumInfo {
  id: number;
  title: string | null;
  userName: string;
  userId: string;
  createdAt: Date;
}

async function getEmptyAlbums(): Promise<EmptyAlbumInfo[]> {
  const folders = await prisma.photoFolder.findMany({
    where: {
      photos: {
        none: {},
      },
    },
    include: {
      user: {
        select: { name: true, id: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return folders.map((f) => ({
    id: f.id,
    title: f.title,
    userName: f.user.name,
    userId: f.user.id,
    createdAt: f.createdAt,
  }));
}

async function deleteEmptyAlbums(albumIds: number[]): Promise<number> {
  const result = await prisma.photoFolder.deleteMany({
    where: {
      id: { in: albumIds },
    },
  });
  return result.count;
}

function askConfirmation(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  const isForce = process.argv.includes('--force');

  console.log('--- Empty Photo Album Cleanup ---\n');

  const emptyAlbums = await getEmptyAlbums();

  if (emptyAlbums.length === 0) {
    console.log('No empty albums found. Nothing to clean up.');
    return;
  }

  // Group by user for clearer output
  const byUser = new Map<string, EmptyAlbumInfo[]>();
  for (const album of emptyAlbums) {
    const key = `${album.userName} (${album.userId})`;
    if (!byUser.has(key)) byUser.set(key, []);
    byUser.get(key)!.push(album);
  }

  console.log(`Found ${emptyAlbums.length} empty album(s) across ${byUser.size} user(s):\n`);

  for (const [user, albums] of byUser) {
    console.log(`  ${user}:`);
    for (const a of albums) {
      console.log(`    - [${a.id}] "${a.title ?? '(untitled)'}" (created ${a.createdAt.toISOString()})`);
    }
  }

  console.log('');

  if (isDryRun) {
    console.log('[DRY RUN] No albums were deleted.');
    return;
  }

  if (!isForce) {
    const confirmed = await askConfirmation(
      `Delete ${emptyAlbums.length} empty album(s)? This cannot be undone. (y/N): `
    );
    if (!confirmed) {
      console.log('Aborted.');
      return;
    }
  }

  const deletedCount = await deleteEmptyAlbums(emptyAlbums.map((a) => a.id));
  console.log(`Deleted ${deletedCount} empty album(s).`);
}

main()
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
