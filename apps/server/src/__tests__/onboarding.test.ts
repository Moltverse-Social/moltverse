/**
 * Onboarding system tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { testPrisma } from './setup.js';
import { createTestUser, createTestAgent, createTestCommunity, addUserToCommunity } from './helpers/index.js';
import {
  createActivity,
  createScrapActivity,
  createFriendRequestActivity,
  createFriendAcceptedActivity,
  createTestimonialActivity,
  createTestimonialApprovedActivity,
  createProfileVisitorActivity,
  createNewFanActivity,
  createActivityForClusterMembers,
} from '../lib/activity.js';

describe('AgentActivity model', () => {
  beforeEach(async () => {
    await testPrisma.agentActivity.deleteMany();
    await testPrisma.agent.deleteMany();
    await testPrisma.user.deleteMany();
  });

  it('should create an agent activity', async () => {
    const { user: receiver } = await createTestUser();
    const { user: actor } = await createTestUser({ email: 'actor@test.com' });

    await createActivity(testPrisma, {
      userId: receiver.id,
      actorId: actor.id,
      type: 'NEW_SCRAP_RECEIVED',
      message: `${actor.name} sent you a scrap`,
      targetId: '123',
      targetType: 'scrap',
      data: { senderName: actor.name },
    });

    const activity = await testPrisma.agentActivity.findFirst({
      where: { userId: receiver.id },
    });

    expect(activity).toBeDefined();
    expect(activity?.type).toBe('NEW_SCRAP_RECEIVED');
    expect(activity?.message).toContain('sent you a scrap');
    expect(activity?.read).toBe(false);
    expect(activity?.targetId).toBe('123');
    expect(activity?.targetType).toBe('scrap');
  });

  it('should mark activities as read', async () => {
    const { user: receiver } = await createTestUser();
    const { user: actor } = await createTestUser({ email: 'actor@test.com' });

    await createActivity(testPrisma, {
      userId: receiver.id,
      actorId: actor.id,
      type: 'NEW_SCRAP_RECEIVED',
      message: 'Test message',
    });

    await testPrisma.agentActivity.updateMany({
      where: { userId: receiver.id },
      data: { read: true },
    });

    const activity = await testPrisma.agentActivity.findFirst({
      where: { userId: receiver.id },
    });

    expect(activity?.read).toBe(true);
  });

  it('should store JSON data', async () => {
    const { user: receiver } = await createTestUser();
    const { user: actor } = await createTestUser({ email: 'actor@test.com' });

    await createActivity(testPrisma, {
      userId: receiver.id,
      actorId: actor.id,
      type: 'NEW_SCRAP_RECEIVED',
      message: 'Test message',
      data: { senderName: 'Test User', scrapId: 123, nested: { value: true } },
    });

    const activity = await testPrisma.agentActivity.findFirst({
      where: { userId: receiver.id },
    });

    expect(activity?.data).toEqual({
      senderName: 'Test User',
      scrapId: 123,
      nested: { value: true },
    });
  });
});

describe('Social activity helpers', () => {
  beforeEach(async () => {
    await testPrisma.agentActivity.deleteMany();
    await testPrisma.scrap.deleteMany();
    await testPrisma.agent.deleteMany();
    await testPrisma.user.deleteMany();
  });

  it('createScrapActivity should create activity for scrap receiver', async () => {
    const { user: receiver } = await createTestUser();
    const { user: sender } = await createTestUser({ email: 'sender@test.com', name: 'Sender User' });

    await createScrapActivity(testPrisma, receiver.id, sender.id, sender.name, 42);

    const activity = await testPrisma.agentActivity.findFirst({
      where: { userId: receiver.id },
    });

    expect(activity).toBeDefined();
    expect(activity?.type).toBe('NEW_SCRAP_RECEIVED');
    expect(activity?.message).toContain('Sender User');
    expect(activity?.targetId).toBe('42');
    expect(activity?.targetType).toBe('scrap');
  });

  it('createFriendRequestActivity should create activity for requestee', async () => {
    const { user: requestee } = await createTestUser();
    const { user: requester } = await createTestUser({ email: 'requester@test.com', name: 'Requester User' });

    await createFriendRequestActivity(testPrisma, requestee.id, requester.id, requester.name);

    const activity = await testPrisma.agentActivity.findFirst({
      where: { userId: requestee.id },
    });

    expect(activity).toBeDefined();
    expect(activity?.type).toBe('FRIEND_REQUEST_RECEIVED');
    expect(activity?.message).toContain('friend request');
    expect(activity?.targetType).toBe('user');
  });

  it('createFriendAcceptedActivity should create activity for requester', async () => {
    const { user: requester } = await createTestUser();
    const { user: requestee } = await createTestUser({ email: 'requestee@test.com', name: 'Requestee User' });

    await createFriendAcceptedActivity(testPrisma, requester.id, requestee.id, requestee.name);

    const activity = await testPrisma.agentActivity.findFirst({
      where: { userId: requester.id },
    });

    expect(activity).toBeDefined();
    expect(activity?.type).toBe('FRIEND_REQUEST_ACCEPTED');
    expect(activity?.message).toContain('accepted your friend request');
  });

  it('createTestimonialActivity should create activity for receiver', async () => {
    const { user: receiver } = await createTestUser();
    const { user: sender } = await createTestUser({ email: 'sender@test.com', name: 'Sender User' });

    await createTestimonialActivity(testPrisma, receiver.id, sender.id, sender.name, 99);

    const activity = await testPrisma.agentActivity.findFirst({
      where: { userId: receiver.id },
    });

    expect(activity).toBeDefined();
    expect(activity?.type).toBe('NEW_TESTIMONIAL');
    expect(activity?.targetId).toBe('99');
    expect(activity?.targetType).toBe('testimonial');
  });

  it('createTestimonialApprovedActivity should create activity for sender', async () => {
    const { user: sender } = await createTestUser();
    const { user: receiver } = await createTestUser({ email: 'receiver@test.com', name: 'Receiver User' });

    await createTestimonialApprovedActivity(testPrisma, sender.id, receiver.id, receiver.name, 99);

    const activity = await testPrisma.agentActivity.findFirst({
      where: { userId: sender.id },
    });

    expect(activity).toBeDefined();
    expect(activity?.type).toBe('TESTIMONIAL_APPROVED');
    expect(activity?.message).toContain('approved your testimonial');
  });

  it('createProfileVisitorActivity should create activity for visited user', async () => {
    const { user: visited } = await createTestUser();
    const { user: visitor } = await createTestUser({ email: 'visitor@test.com', name: 'Visitor User' });

    await createProfileVisitorActivity(testPrisma, visited.id, visitor.id, visitor.name);

    const activity = await testPrisma.agentActivity.findFirst({
      where: { userId: visited.id },
    });

    expect(activity).toBeDefined();
    expect(activity?.type).toBe('PROFILE_VISITOR');
    expect(activity?.message).toContain('visited your profile');
  });

  it('createNewFanActivity should create activity for idol', async () => {
    const { user: idol } = await createTestUser();
    const { user: fan } = await createTestUser({ email: 'fan@test.com', name: 'Fan User' });

    await createNewFanActivity(testPrisma, idol.id, fan.id, fan.name);

    const activity = await testPrisma.agentActivity.findFirst({
      where: { userId: idol.id },
    });

    expect(activity).toBeDefined();
    expect(activity?.type).toBe('NEW_FAN');
    expect(activity?.message).toContain('became your fan');
  });
});

describe('Cluster activity helpers', () => {
  beforeEach(async () => {
    await testPrisma.agentActivity.deleteMany();
    await testPrisma.userCluster.deleteMany();
    await testPrisma.cluster.deleteMany();
    await testPrisma.agent.deleteMany();
    await testPrisma.user.deleteMany();
  });

  it('createActivityForClusterMembers should notify all members except actor', async () => {
    // Create users
    const { user: creator } = await createTestUser({ name: 'Creator' });
    const { user: member1 } = await createTestUser({ email: 'member1@test.com', name: 'Member1' });
    const { user: member2 } = await createTestUser({ email: 'member2@test.com', name: 'Member2' });

    // Create community
    const community = await createTestCommunity(creator.id, { title: 'Test Community' });

    // Add members
    await addUserToCommunity(creator.id, community.id);
    await addUserToCommunity(member1.id, community.id);
    await addUserToCommunity(member2.id, community.id);

    // Create activity for all members
    await createActivityForClusterMembers(
      testPrisma,
      community.id,
      creator.id,
      'CLUSTER_TOPIC',
      `${creator.name} created a topic in ${community.title}`,
      '1',
      'topic',
      { creatorName: creator.name }
    );

    // Check activities
    const activities = await testPrisma.agentActivity.findMany();

    // Should have activities for member1 and member2, but not creator
    expect(activities.length).toBe(2);
    expect(activities.find(a => a.userId === member1.id)).toBeDefined();
    expect(activities.find(a => a.userId === member2.id)).toBeDefined();
    expect(activities.find(a => a.userId === creator.id)).toBeUndefined();
  });

  it('createActivityForClusterMembers should return 0 for empty community', async () => {
    const { user: creator } = await createTestUser();
    const community = await createTestCommunity(creator.id, { title: 'Empty Community' });

    // Only add creator
    await addUserToCommunity(creator.id, community.id);

    const count = await createActivityForClusterMembers(
      testPrisma,
      community.id,
      creator.id,
      'CLUSTER_TOPIC',
      'Test message',
      '1',
      'topic',
      {}
    );

    expect(count).toBe(0);

    const activities = await testPrisma.agentActivity.findMany();
    expect(activities.length).toBe(0);
  });
});

describe('Agent lastSeenAt tracking', () => {
  beforeEach(async () => {
    await testPrisma.agent.deleteMany();
    await testPrisma.user.deleteMany();
  });

  it('should allow updating lastSeenAt', async () => {
    const { user } = await createTestUser();
    const { agent } = await createTestAgent(user.id, { claimed: true });

    expect(agent.lastSeenAt).toBeNull();

    const now = new Date();
    const updated = await testPrisma.agent.update({
      where: { id: agent.id },
      data: { lastSeenAt: now },
    });

    expect(updated.lastSeenAt).toEqual(now);
  });

  it('should track first connection (lastSeenAt null)', async () => {
    const { user } = await createTestUser();
    const { agent } = await createTestAgent(user.id, { claimed: true });

    const isFirstConnection = agent.lastSeenAt === null;
    expect(isFirstConnection).toBe(true);
  });

  it('should track returning agent (lastSeenAt set)', async () => {
    const { user } = await createTestUser();
    const { agent } = await createTestAgent(user.id, { claimed: true });

    // Simulate first connection
    const firstConnection = new Date();
    await testPrisma.agent.update({
      where: { id: agent.id },
      data: { lastSeenAt: firstConnection },
    });

    // Check returning
    const agentNow = await testPrisma.agent.findUnique({ where: { id: agent.id } });
    const isFirstConnection = agentNow?.lastSeenAt === null;
    expect(isFirstConnection).toBe(false);
  });
});

describe('Activity feed querying', () => {
  beforeEach(async () => {
    await testPrisma.agentActivity.deleteMany();
    await testPrisma.agent.deleteMany();
    await testPrisma.user.deleteMany();
  });

  it('should return activities ordered by createdAt DESC', async () => {
    const { user } = await createTestUser();
    const { user: actor } = await createTestUser({ email: 'actor@test.com' });

    // Create activities with different timestamps
    const now = new Date();
    await testPrisma.agentActivity.createMany({
      data: [
        {
          userId: user.id,
          actorId: actor.id,
          type: 'NEW_SCRAP_RECEIVED',
          message: 'First',
          createdAt: new Date(now.getTime() - 2000),
        },
        {
          userId: user.id,
          actorId: actor.id,
          type: 'NEW_SCRAP_RECEIVED',
          message: 'Second',
          createdAt: new Date(now.getTime() - 1000),
        },
        {
          userId: user.id,
          actorId: actor.id,
          type: 'NEW_SCRAP_RECEIVED',
          message: 'Third',
          createdAt: now,
        },
      ],
    });

    const activities = await testPrisma.agentActivity.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });

    expect(activities.length).toBe(3);
    expect(activities[0].message).toBe('Third');
    expect(activities[1].message).toBe('Second');
    expect(activities[2].message).toBe('First');
  });

  it('should filter by read status', async () => {
    const { user } = await createTestUser();
    const { user: actor } = await createTestUser({ email: 'actor@test.com' });

    await testPrisma.agentActivity.createMany({
      data: [
        { userId: user.id, actorId: actor.id, type: 'NEW_SCRAP_RECEIVED', message: 'Unread 1', read: false },
        { userId: user.id, actorId: actor.id, type: 'NEW_SCRAP_RECEIVED', message: 'Read 1', read: true },
        { userId: user.id, actorId: actor.id, type: 'NEW_SCRAP_RECEIVED', message: 'Unread 2', read: false },
      ],
    });

    const unread = await testPrisma.agentActivity.findMany({
      where: { userId: user.id, read: false },
    });

    expect(unread.length).toBe(2);
    expect(unread.every(a => !a.read)).toBe(true);
  });

  it('should count unread activities', async () => {
    const { user } = await createTestUser();
    const { user: actor } = await createTestUser({ email: 'actor@test.com' });

    await testPrisma.agentActivity.createMany({
      data: [
        { userId: user.id, actorId: actor.id, type: 'NEW_SCRAP_RECEIVED', message: '1', read: false },
        { userId: user.id, actorId: actor.id, type: 'NEW_SCRAP_RECEIVED', message: '2', read: true },
        { userId: user.id, actorId: actor.id, type: 'NEW_SCRAP_RECEIVED', message: '3', read: false },
        { userId: user.id, actorId: actor.id, type: 'NEW_SCRAP_RECEIVED', message: '4', read: false },
      ],
    });

    const unreadCount = await testPrisma.agentActivity.count({
      where: { userId: user.id, read: false },
    });

    expect(unreadCount).toBe(3);
  });
});
