/**
 * Agent API tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { testPrisma } from './setup.js';
import { generateApiKey, generateVerificationCode, hashApiKey } from '../lib/auth.js';
import { isAgentNameTaken } from '../lib/guards.js';
import { createTestUser, createTestAgent } from './helpers/index.js';

describe('Agent model', () => {
  beforeEach(async () => {
    await testPrisma.agent.deleteMany();
    await testPrisma.user.deleteMany();
  });

  it('should create an agent with valid API key hash', async () => {
    const { user } = await createTestUser();
    const apiKey = generateApiKey();
    const apiKeyHashed = hashApiKey(apiKey);
    const verificationCode = generateVerificationCode();
    const now = new Date();

    const agent = await testPrisma.agent.create({
      data: {
        name: 'Test Agent',
        description: 'A test agent',
        apiKeyHash: apiKeyHashed,
        verificationCode,
        claimed: false,
        userId: user.id,
        createdAt: now,
      },
    });

    expect(agent).toBeDefined();
    expect(agent.name).toBe('Test Agent');
    expect(agent.apiKeyHash).toBe(apiKeyHashed);
    expect(agent.apiKeyHash).toHaveLength(64); // SHA-256 hash is 64 hex chars
    expect(agent.claimed).toBe(false);
    expect(agent.twitterHandle).toBeNull();
  });

  it('should claim agent with twitter handle', async () => {
    const { user } = await createTestUser();
    const { agent } = await createTestAgent(user.id);

    const claimedAgent = await testPrisma.agent.update({
      where: { id: agent.id },
      data: {
        claimed: true,
        twitterHandle: 'testuser',
        claimedAt: new Date(),
      },
    });

    expect(claimedAgent.claimed).toBe(true);
    expect(claimedAgent.twitterHandle).toBe('testuser');
    expect(claimedAgent.claimedAt).toBeDefined();
  });

  it('should find agent by API key hash', async () => {
    const { user } = await createTestUser();
    const apiKey = generateApiKey();
    const apiKeyHashed = hashApiKey(apiKey);
    const now = new Date();

    await testPrisma.agent.create({
      data: {
        name: 'Searchable Agent',
        description: 'An agent to find',
        apiKeyHash: apiKeyHashed,
        verificationCode: generateVerificationCode(),
        claimed: false,
        userId: user.id,
        createdAt: now,
      },
    });

    // Lookup should use the hash of the incoming API key
    const lookupHash = hashApiKey(apiKey);
    const found = await testPrisma.agent.findUnique({
      where: { apiKeyHash: lookupHash },
    });

    expect(found).toBeDefined();
    expect(found?.name).toBe('Searchable Agent');
  });

  it('should not find agent with wrong API key', async () => {
    const { user } = await createTestUser();
    const apiKey = generateApiKey();
    const apiKeyHashed = hashApiKey(apiKey);
    const now = new Date();

    await testPrisma.agent.create({
      data: {
        name: 'Hidden Agent',
        description: 'An agent not to find',
        apiKeyHash: apiKeyHashed,
        verificationCode: generateVerificationCode(),
        claimed: false,
        userId: user.id,
        createdAt: now,
      },
    });

    // Different API key should produce different hash
    const wrongKeyHash = hashApiKey(generateApiKey());
    const notFound = await testPrisma.agent.findUnique({
      where: { apiKeyHash: wrongKeyHash },
    });

    expect(notFound).toBeNull();
  });

  it('should enforce unique API key hash constraint', async () => {
    const { user } = await createTestUser();
    const apiKey = generateApiKey();
    const apiKeyHashed = hashApiKey(apiKey);
    const now = new Date();

    await testPrisma.agent.create({
      data: {
        name: 'First Agent',
        description: 'First agent',
        apiKeyHash: apiKeyHashed,
        verificationCode: generateVerificationCode(),
        claimed: false,
        userId: user.id,
        createdAt: now,
      },
    });

    // Create another user for the second agent
    const { user: user2 } = await createTestUser({ email: 'user2@test.com' });

    await expect(
      testPrisma.agent.create({
        data: {
          name: 'Second Agent',
          description: 'Second agent with same key hash',
          apiKeyHash: apiKeyHashed, // Same hash - should fail
          verificationCode: generateVerificationCode(),
          claimed: false,
          userId: user2.id,
          createdAt: now,
        },
      })
    ).rejects.toThrow();
  });

  it('should cascade delete agent when user is deleted', async () => {
    const { user } = await createTestUser();
    const { agent } = await createTestAgent(user.id);

    // Delete the user
    await testPrisma.user.delete({
      where: { id: user.id },
    });

    // Agent should also be deleted
    const deletedAgent = await testPrisma.agent.findUnique({
      where: { id: agent.id },
    });

    expect(deletedAgent).toBeNull();
  });
});

describe('Agent name uniqueness', () => {
  beforeEach(async () => {
    // Use transaction to avoid deadlocks between cascading deletes
    await testPrisma.$transaction([
      testPrisma.agent.deleteMany(),
      testPrisma.user.deleteMany(),
    ]);
  });

  it('should detect duplicate name among claimed agents (exact match)', async () => {
    const { user } = await createTestUser();
    await createTestAgent(user.id, { name: 'Rune', claimed: true });

    const taken = await isAgentNameTaken(testPrisma.agent, 'Rune');
    expect(taken).toBe(true);
  });

  it('should detect duplicate name case-insensitively', async () => {
    const { user } = await createTestUser();
    await createTestAgent(user.id, { name: 'Rune', claimed: true });

    expect(await isAgentNameTaken(testPrisma.agent, 'rune')).toBe(true);
    expect(await isAgentNameTaken(testPrisma.agent, 'RUNE')).toBe(true);
    expect(await isAgentNameTaken(testPrisma.agent, 'RuNe')).toBe(true);
  });

  it('should detect name taken by unclaimed agent with active verification', async () => {
    const { user } = await createTestUser();
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await testPrisma.agent.create({
      data: {
        name: 'Pending Agent',
        apiKeyHash: hashApiKey(generateApiKey()),
        verificationCode: generateVerificationCode(),
        verificationExpiresAt: futureDate,
        claimed: false,
        userId: user.id,
        createdAt: new Date(),
      },
    });

    const taken = await isAgentNameTaken(testPrisma.agent, 'pending agent');
    expect(taken).toBe(true);
  });

  it('should allow name when unclaimed agent verification has expired', async () => {
    const { user } = await createTestUser();
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);

    await testPrisma.agent.create({
      data: {
        name: 'Expired Agent',
        apiKeyHash: hashApiKey(generateApiKey()),
        verificationCode: generateVerificationCode(),
        verificationExpiresAt: pastDate,
        claimed: false,
        userId: user.id,
        createdAt: new Date(),
      },
    });

    const taken = await isAgentNameTaken(testPrisma.agent, 'expired agent');
    expect(taken).toBe(false);
  });

  it('should allow agent to keep its own name (excludeAgentId)', async () => {
    const { user } = await createTestUser();
    const { agent } = await createTestAgent(user.id, { name: 'MyAgent', claimed: true });

    const taken = await isAgentNameTaken(testPrisma.agent, 'MyAgent', agent.id);
    expect(taken).toBe(false);
  });

  it('should return false for a completely unique name', async () => {
    const taken = await isAgentNameTaken(testPrisma.agent, 'UniqueAgentName12345');
    expect(taken).toBe(false);
  });
});
