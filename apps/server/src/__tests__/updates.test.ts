/**
 * Updates Module Tests
 *
 * Tests for the update helper functions that create activity feed entries
 * and emit live events.
 *
 * @module __tests__/updates
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// MOCKS
// ============================================================================

// Mock liveEvents - must use inline function to avoid hoisting issues
vi.mock('../lib/live-events.js', () => ({
  liveEvents: {
    emit: vi.fn(),
  },
}));

// Mock logger
vi.mock('../lib/logger.js', () => ({
  createChildLogger: () => ({
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  }),
}));

// Import after mocks are set up
import { createAddPostUpdate, createCreateClusterUpdate, createVoteKarmaUpdate } from '../lib/updates.js';
import { liveEvents } from '../lib/live-events.js';

// Get reference to mocked emit function
const mockEmit = liveEvents.emit as ReturnType<typeof vi.fn>;

// ============================================================================
// TEST HELPERS
// ============================================================================

/**
 * Create a mock Prisma client for testing
 */
function createMockPrisma(updateResult: Record<string, unknown> = {}) {
  return {
    update: {
      create: vi.fn().mockResolvedValue({
        id: 1,
        body: 'Test post',
        action: 'ADD_POST',
        picture: null,
        visible: true,
        userId: 'user-123',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...updateResult,
      }),
    },
  } as unknown as Parameters<typeof createAddPostUpdate>[0];
}

/**
 * Create actor info for testing
 */
function createMockActor(overrides: Partial<{ id: string; name: string; profilePicture: string | null }> = {}) {
  return {
    id: 'user-123',
    name: 'Test User',
    profilePicture: 'https://example.com/pic.jpg',
    ...overrides,
  };
}

// ============================================================================
// createAddPostUpdate TESTS
// ============================================================================

describe('createAddPostUpdate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Update creation', () => {
    it('should create an Update with correct data', async () => {
      const mockPrisma = createMockPrisma();
      const userId = 'user-123';
      const body = 'This is a test post';
      const picture = 'https://example.com/image.jpg';

      await createAddPostUpdate(mockPrisma, userId, body, picture);

      expect(mockPrisma.update.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.update.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          body,
          action: 'ADD_POST',
          picture,
          visible: true,
          userId,
        }),
      });
    });

    it('should create an Update with null picture when not provided', async () => {
      const mockPrisma = createMockPrisma();

      await createAddPostUpdate(mockPrisma, 'user-123', 'Test post', null);

      expect(mockPrisma.update.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          picture: null,
        }),
      });
    });

    it('should return the created Update', async () => {
      const expectedUpdate = {
        id: 42,
        body: 'Test post',
        action: 'ADD_POST',
        picture: null,
        visible: true,
        userId: 'user-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const mockPrisma = createMockPrisma(expectedUpdate);

      const result = await createAddPostUpdate(mockPrisma, 'user-123', 'Test post', null);

      expect(result).toEqual(expect.objectContaining({
        id: 42,
        body: 'Test post',
        action: 'ADD_POST',
      }));
    });

    it('should set createdAt and updatedAt to current time', async () => {
      const mockPrisma = createMockPrisma();
      const beforeTime = new Date();

      await createAddPostUpdate(mockPrisma, 'user-123', 'Test post', null);

      const afterTime = new Date();
      const callArgs = (mockPrisma.update.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const createdAt = callArgs.data.createdAt;
      const updatedAt = callArgs.data.updatedAt;

      expect(createdAt.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(createdAt.getTime()).toBeLessThanOrEqual(afterTime.getTime());
      expect(updatedAt.getTime()).toEqual(createdAt.getTime());
    });
  });

  describe('Live event emission', () => {
    it('should emit live event when actor is provided', async () => {
      const mockPrisma = createMockPrisma({ id: 99 });
      const actor = createMockActor();

      await createAddPostUpdate(mockPrisma, 'user-123', 'Test post', null, actor);

      expect(mockEmit).toHaveBeenCalledTimes(1);
      expect(mockEmit).toHaveBeenCalledWith({
        type: 'ADD_POST',
        actor: {
          id: actor.id,
          name: actor.name,
          profilePicture: actor.profilePicture,
        },
        body: 'Test post',
        metadata: {
          hasPicture: false,
          picture: null,
          updateId: 99,
        },
      });
    });

    it('should NOT emit live event when actor is not provided', async () => {
      const mockPrisma = createMockPrisma();

      await createAddPostUpdate(mockPrisma, 'user-123', 'Test post', null);

      expect(mockEmit).not.toHaveBeenCalled();
    });

    it('should set hasPicture to true when picture is provided', async () => {
      const mockPrisma = createMockPrisma();
      const actor = createMockActor();

      await createAddPostUpdate(mockPrisma, 'user-123', 'Test post', 'https://example.com/pic.jpg', actor);

      expect(mockEmit).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            hasPicture: true,
          }),
        })
      );
    });

    it('should set hasPicture to false when picture is null', async () => {
      const mockPrisma = createMockPrisma();
      const actor = createMockActor();

      await createAddPostUpdate(mockPrisma, 'user-123', 'Test post', null, actor);

      expect(mockEmit).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            hasPicture: false,
          }),
        })
      );
    });

    it('should include updateId in metadata', async () => {
      const mockPrisma = createMockPrisma({ id: 777 });
      const actor = createMockActor();

      await createAddPostUpdate(mockPrisma, 'user-123', 'Test post', null, actor);

      expect(mockEmit).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            updateId: 777,
          }),
        })
      );
    });
  });

  describe('Body truncation', () => {
    it('should NOT truncate body with 100 or fewer characters', async () => {
      const mockPrisma = createMockPrisma();
      const actor = createMockActor();
      const body = 'A'.repeat(100); // Exactly 100 characters

      await createAddPostUpdate(mockPrisma, 'user-123', body, null, actor);

      expect(mockEmit).toHaveBeenCalledWith(
        expect.objectContaining({
          body: body, // Should be unchanged
        })
      );
    });

    it('should truncate body with more than 280 characters', async () => {
      const mockPrisma = createMockPrisma();
      const actor = createMockActor();
      const body = 'A'.repeat(300); // 300 characters (> 280 limit)

      await createAddPostUpdate(mockPrisma, 'user-123', body, null, actor);

      expect(mockEmit).toHaveBeenCalledWith(
        expect.objectContaining({
          body: 'A'.repeat(280) + '...', // First 280 chars + ellipsis
        })
      );
    });

    it('should store full body in database but truncate in live event', async () => {
      const mockPrisma = createMockPrisma();
      const actor = createMockActor();
      const fullBody = 'B'.repeat(350);

      await createAddPostUpdate(mockPrisma, 'user-123', fullBody, null, actor);

      // Database should have full body
      expect(mockPrisma.update.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          body: fullBody, // Full 350 characters
        }),
      });

      // Live event should have truncated body
      expect(mockEmit).toHaveBeenCalledWith(
        expect.objectContaining({
          body: 'B'.repeat(280) + '...', // Truncated at 280
        })
      );
    });
  });

  describe('Error handling', () => {
    it('should catch errors from liveEvents.emit and not throw', async () => {
      const mockPrisma = createMockPrisma({ id: 123 });
      const actor = createMockActor();
      const testError = new Error('Emit failed');
      mockEmit.mockImplementationOnce(() => {
        throw testError;
      });

      // Should not throw - the error should be caught internally
      const result = await createAddPostUpdate(mockPrisma, 'user-123', 'Test post', null, actor);

      // Should still return the created update despite emit failure
      expect(result).toBeDefined();
      expect(result.id).toBe(123);

      // Verify emit was called (and threw)
      expect(mockEmit).toHaveBeenCalledTimes(1);
    });

    it('should return update even when emit throws', async () => {
      const mockPrisma = createMockPrisma({ id: 456, body: 'Important post' });
      const actor = createMockActor();
      mockEmit.mockImplementationOnce(() => {
        throw new Error('Network error');
      });

      const result = await createAddPostUpdate(mockPrisma, 'user-123', 'Important post', null, actor);

      // The update should be returned regardless of emit failure
      expect(result.id).toBe(456);
      expect(result.body).toBe('Important post');
    });

    it('should NOT catch errors from prisma.update.create', async () => {
      const mockPrisma = createMockPrisma();
      const dbError = new Error('Database connection failed');
      (mockPrisma.update.create as ReturnType<typeof vi.fn>).mockRejectedValueOnce(dbError);

      // Should throw the database error - this is expected behavior
      await expect(createAddPostUpdate(mockPrisma, 'user-123', 'Test post', null))
        .rejects.toThrow('Database connection failed');
    });

    it('should propagate database errors even when actor is provided', async () => {
      const mockPrisma = createMockPrisma();
      const actor = createMockActor();
      const dbError = new Error('Constraint violation');
      (mockPrisma.update.create as ReturnType<typeof vi.fn>).mockRejectedValueOnce(dbError);

      // Database errors should propagate, not be caught
      await expect(createAddPostUpdate(mockPrisma, 'user-123', 'Test post', null, actor))
        .rejects.toThrow('Constraint violation');

      // emit should NOT have been called since create failed
      expect(mockEmit).not.toHaveBeenCalled();
    });
  });

  describe('Actor variations', () => {
    it('should handle actor with null profilePicture', async () => {
      const mockPrisma = createMockPrisma();
      const actor = createMockActor({ profilePicture: null });

      await createAddPostUpdate(mockPrisma, 'user-123', 'Test post', null, actor);

      expect(mockEmit).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: expect.objectContaining({
            profilePicture: null,
          }),
        })
      );
    });

    it('should pass actor id, name, and profilePicture correctly', async () => {
      const mockPrisma = createMockPrisma();
      const actor = {
        id: 'custom-id-999',
        name: 'Custom Name',
        profilePicture: 'https://cdn.example.com/custom.png',
      };

      await createAddPostUpdate(mockPrisma, 'user-123', 'Test post', null, actor);

      expect(mockEmit).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: {
            id: 'custom-id-999',
            name: 'Custom Name',
            profilePicture: 'https://cdn.example.com/custom.png',
          },
        })
      );
    });
  });
});

// ============================================================================
// createCreateClusterUpdate TESTS
// ============================================================================

describe('createCreateClusterUpdate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Create a mock Prisma client for community update testing
   */
  function createMockClusterPrisma() {
    return {
      update: {
        create: vi.fn().mockResolvedValue({
          id: 1,
          body: 'created the cluster "Test Cluster"',
          action: 'CREATE_CLUSTER',
          visible: true,
          userId: 'user-123',
        }),
      },
    } as unknown as Parameters<typeof createCreateClusterUpdate>[0];
  }

  it('should create an Update with correct data', async () => {
    const { createCreateClusterUpdate } = await import('../lib/updates.js');
    const mockPrisma = createMockClusterPrisma();

    await createCreateClusterUpdate(mockPrisma, 'user-123', 42, 'Test Cluster');

    expect(mockPrisma.update.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.update.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        body: 'created the cluster "Test Cluster"',
        action: 'CREATE_CLUSTER',
        object: { clusterId: 42, clusterTitle: 'Test Cluster' },
        visible: true,
        userId: 'user-123',
      }),
    });
  });

  it('should emit live event when actor is provided', async () => {
    const { createCreateClusterUpdate } = await import('../lib/updates.js');
    const mockPrisma = createMockClusterPrisma();
    const actor = { id: 'user-123', name: 'Test User', profilePicture: 'https://example.com/pic.jpg' };

    await createCreateClusterUpdate(mockPrisma, 'user-123', 42, 'Test Cluster', actor);

    expect(mockEmit).toHaveBeenCalledTimes(1);
    expect(mockEmit).toHaveBeenCalledWith({
      type: 'CREATE_CLUSTER',
      actor: {
        id: 'user-123',
        name: 'Test User',
        profilePicture: 'https://example.com/pic.jpg',
      },
      target: {
        id: '42',
        name: 'Test Cluster',
        type: 'cluster',
      },
    });
  });

  it('should NOT emit live event when actor is not provided', async () => {
    const { createCreateClusterUpdate } = await import('../lib/updates.js');
    const mockPrisma = createMockClusterPrisma();

    await createCreateClusterUpdate(mockPrisma, 'user-123', 42, 'Test Cluster');

    expect(mockEmit).not.toHaveBeenCalled();
  });

  it('should catch errors and not throw', async () => {
    const { createCreateClusterUpdate } = await import('../lib/updates.js');
    const mockPrisma = createMockClusterPrisma();
    (mockPrisma.update.create as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('DB Error'));

    // Should not throw
    await expect(createCreateClusterUpdate(mockPrisma, 'user-123', 42, 'Test Cluster')).resolves.toBeUndefined();
  });
});

// ============================================================================
// createVoteKarmaUpdate TESTS
// ============================================================================

describe('createVoteKarmaUpdate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Create a mock Prisma client for karma update testing
   */
  function createMockKarmaPrisma() {
    return {
      update: {
        create: vi.fn().mockResolvedValue({
          id: 1,
          body: 'thinks Test Target is cool',
          action: 'VOTE_KARMA',
          visible: true,
          userId: 'user-123',
        }),
      },
    } as unknown as Parameters<typeof createVoteKarmaUpdate>[0];
  }

  it('should create an Update with single karma type', async () => {
    const { createVoteKarmaUpdate } = await import('../lib/updates.js');
    const mockPrisma = createMockKarmaPrisma();

    await createVoteKarmaUpdate(mockPrisma, 'user-123', 'target-456', 'Test Target', {
      cool: true,
      lowHallucinationRate: false,
      sexy: false,
    });

    expect(mockPrisma.update.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.update.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        body: 'thinks Test Target is cool',
        action: 'VOTE_KARMA',
        visible: true,
        userId: 'user-123',
      }),
    });
  });

  it('should create an Update with two karma types', async () => {
    const { createVoteKarmaUpdate } = await import('../lib/updates.js');
    const mockPrisma = createMockKarmaPrisma();

    await createVoteKarmaUpdate(mockPrisma, 'user-123', 'target-456', 'Test Target', {
      cool: true,
      lowHallucinationRate: true,
      sexy: false,
    });

    expect(mockPrisma.update.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        body: 'thinks Test Target is cool and low hallucination rate',
      }),
    });
  });

  it('should create an Update with all three karma types', async () => {
    const { createVoteKarmaUpdate } = await import('../lib/updates.js');
    const mockPrisma = createMockKarmaPrisma();

    await createVoteKarmaUpdate(mockPrisma, 'user-123', 'target-456', 'Test Target', {
      cool: true,
      lowHallucinationRate: true,
      sexy: true,
    });

    expect(mockPrisma.update.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        body: 'thinks Test Target is cool, low hallucination rate and sexy',
      }),
    });
  });

  it('should NOT create Update when all karma types are false', async () => {
    const { createVoteKarmaUpdate } = await import('../lib/updates.js');
    const mockPrisma = createMockKarmaPrisma();

    await createVoteKarmaUpdate(mockPrisma, 'user-123', 'target-456', 'Test Target', {
      cool: false,
      lowHallucinationRate: false,
      sexy: false,
    });

    expect(mockPrisma.update.create).not.toHaveBeenCalled();
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it('should emit live event when actor is provided', async () => {
    const { createVoteKarmaUpdate } = await import('../lib/updates.js');
    const mockPrisma = createMockKarmaPrisma();
    const voter = { id: 'user-123', name: 'Test Voter', profilePicture: null };

    await createVoteKarmaUpdate(mockPrisma, 'user-123', 'target-456', 'Test Target', {
      cool: true,
      lowHallucinationRate: false,
      sexy: true,
    }, voter);

    expect(mockEmit).toHaveBeenCalledTimes(1);
    expect(mockEmit).toHaveBeenCalledWith({
      type: 'VOTE_KARMA',
      actor: {
        id: 'user-123',
        name: 'Test Voter',
        profilePicture: null,
      },
      target: {
        id: 'target-456',
        name: 'Test Target',
        type: 'user',
      },
      metadata: {
        karma: { cool: true, lowHallucinationRate: false, sexy: true },
        karmaTypes: ['cool', 'sexy'],
      },
    });
  });

  it('should NOT emit live event when actor is not provided', async () => {
    const { createVoteKarmaUpdate } = await import('../lib/updates.js');
    const mockPrisma = createMockKarmaPrisma();

    await createVoteKarmaUpdate(mockPrisma, 'user-123', 'target-456', 'Test Target', {
      cool: true,
      lowHallucinationRate: false,
      sexy: false,
    });

    expect(mockEmit).not.toHaveBeenCalled();
  });

  it('should catch errors and not throw', async () => {
    const { createVoteKarmaUpdate } = await import('../lib/updates.js');
    const mockPrisma = createMockKarmaPrisma();
    (mockPrisma.update.create as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('DB Error'));

    // Should not throw
    await expect(createVoteKarmaUpdate(mockPrisma, 'user-123', 'target-456', 'Test Target', {
      cool: true,
      lowHallucinationRate: false,
      sexy: false,
    })).resolves.toBeUndefined();
  });
});
