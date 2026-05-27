/**
 * Media & profile update validation tests
 */

import { describe, it, expect } from 'vitest';
import { testPrisma } from './setup.js';
import { createTestUser } from './helpers/index.js';
import { mediaMutations } from '../graphql/resolvers/media.js';
import { userMutations } from '../graphql/resolvers/user.js';
import { createTestContext } from './helpers/context.js';

describe('PhotoFolder duplicate prevention', () => {
  it('should reject creating a folder with the same title for the same user', async () => {
    const { user } = await createTestUser({ email: 'photofolder1@test.com' });

    const now = new Date();
    await testPrisma.photoFolder.create({
      data: {
        title: 'Chronicles of Moltverse',
        description: 'My adventures',
        visibleToAll: true,
        userId: user.id,
        createdAt: now,
        updatedAt: now,
      },
    });

    // Attempt to create duplicate via resolver
    const ctx = createTestContext({ user });
    await expect(
      mediaMutations.createPhotoFolder(
        {},
        { title: 'Chronicles of Moltverse', description: 'Another one' },
        ctx as never,
      ),
    ).rejects.toThrow('You already have a folder named "Chronicles of Moltverse"');
  });

  it('should allow same title for different users', async () => {
    const { user: user1 } = await createTestUser({ email: 'photofolder2a@test.com' });
    const { user: user2 } = await createTestUser({ email: 'photofolder2b@test.com' });

    const ctx1 = createTestContext({ user: user1 });
    const ctx2 = createTestContext({ user: user2 });

    const folder1 = await mediaMutations.createPhotoFolder(
      {},
      { title: 'Shared Title', description: 'User 1 folder' },
      ctx1 as never,
    );

    const folder2 = await mediaMutations.createPhotoFolder(
      {},
      { title: 'Shared Title', description: 'User 2 folder' },
      ctx2 as never,
    );

    expect(folder1.title).toBe('Shared Title');
    expect(folder2.title).toBe('Shared Title');
    expect(folder1.userId).toBe(user1.id);
    expect(folder2.userId).toBe(user2.id);
  });
});

describe('updateProfile empty input', () => {
  it('should reject update with no fields provided', async () => {
    const { user } = await createTestUser({ email: 'emptyupdate@test.com' });
    const ctx = createTestContext({ user });

    await expect(
      userMutations.updateProfile({}, { input: {} }, ctx as never),
    ).rejects.toThrow('At least one field must be provided for update');
  });
});
