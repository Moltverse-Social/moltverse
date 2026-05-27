/**
 * Social features tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { testPrisma } from './setup.js';
import { createTestUser, createTestFriendship } from './helpers/index.js';

describe('Scrap model', () => {
  beforeEach(async () => {
    await testPrisma.scrap.deleteMany();
    await testPrisma.user.deleteMany();
  });

  it('should create a scrap between users', async () => {
    const { user: sender } = await createTestUser({ email: 'sender@test.com' });
    const { user: receiver } = await createTestUser({ email: 'receiver@test.com' });

    const scrap = await testPrisma.scrap.create({
      data: {
        body: 'Hello, this is a scrap!',
        senderId: sender.id,
        receiverId: receiver.id,
        createdAt: new Date(),
      },
    });

    expect(scrap).toBeDefined();
    expect(scrap.body).toBe('Hello, this is a scrap!');
    expect(scrap.senderId).toBe(sender.id);
    expect(scrap.receiverId).toBe(receiver.id);
  });

  it('should list scraps for a user', async () => {
    const { user: sender } = await createTestUser({ email: 'sender@test.com' });
    const { user: receiver } = await createTestUser({ email: 'receiver@test.com' });

    // Create multiple scraps
    await testPrisma.scrap.createMany({
      data: [
        { body: 'Scrap 1', senderId: sender.id, receiverId: receiver.id, createdAt: new Date() },
        { body: 'Scrap 2', senderId: sender.id, receiverId: receiver.id, createdAt: new Date() },
        { body: 'Scrap 3', senderId: sender.id, receiverId: receiver.id, createdAt: new Date() },
      ],
    });

    const scraps = await testPrisma.scrap.findMany({
      where: { receiverId: receiver.id },
    });

    expect(scraps.length).toBe(3);
  });

  it('should soft delete a scrap', async () => {
    const { user: sender } = await createTestUser({ email: 'sender@test.com' });
    const { user: receiver } = await createTestUser({ email: 'receiver@test.com' });

    const scrap = await testPrisma.scrap.create({
      data: {
        body: 'To be deleted',
        senderId: sender.id,
        receiverId: receiver.id,
        createdAt: new Date(),
      },
    });

    // Soft delete
    await testPrisma.scrap.update({
      where: { id: scrap.id },
      data: { deletedAt: new Date() },
    });

    // Should not appear in normal query
    const activeScraps = await testPrisma.scrap.findMany({
      where: { receiverId: receiver.id, deletedAt: null },
    });

    expect(activeScraps.length).toBe(0);
  });
});

describe('Friendship model', () => {
  beforeEach(async () => {
    await testPrisma.friendship.deleteMany();
    await testPrisma.user.deleteMany();
  });

  it('should create a friendship between users', async () => {
    const { user: user1 } = await createTestUser({ email: 'user1@test.com' });
    const { user: user2 } = await createTestUser({ email: 'user2@test.com' });

    const friendship = await createTestFriendship(user1.id, user2.id);

    expect(friendship).toBeDefined();
    expect(friendship.userId).toBe(user2.id);
    expect(friendship.friendId).toBe(user1.id);
  });

  it('should check if two users are friends', async () => {
    const { user: user1 } = await createTestUser({ email: 'user1@test.com' });
    const { user: user2 } = await createTestUser({ email: 'user2@test.com' });
    const { user: user3 } = await createTestUser({ email: 'user3@test.com' });

    await createTestFriendship(user1.id, user2.id);

    // user1 and user2 are friends (bidirectional)
    const friendship12 = await testPrisma.friendship.findFirst({
      where: { userId: user1.id, friendId: user2.id },
    });
    expect(friendship12).toBeDefined();

    // user1 and user3 are not friends
    const friendship13 = await testPrisma.friendship.findFirst({
      where: { userId: user1.id, friendId: user3.id },
    });
    expect(friendship13).toBeNull();
  });

  it('should count friends correctly', async () => {
    const { user: user1 } = await createTestUser({ email: 'user1@test.com' });
    const { user: user2 } = await createTestUser({ email: 'user2@test.com' });
    const { user: user3 } = await createTestUser({ email: 'user3@test.com' });
    const { user: user4 } = await createTestUser({ email: 'user4@test.com' });

    await createTestFriendship(user1.id, user2.id);
    await createTestFriendship(user1.id, user3.id);
    await createTestFriendship(user2.id, user4.id);

    // user1 has 2 friends (friendships are bidirectional, so count from user1's perspective)
    const user1FriendCount = await testPrisma.friendship.count({
      where: { userId: user1.id },
    });
    expect(user1FriendCount).toBe(2);

    // user2 has 2 friends (user1 and user4)
    const user2FriendCount = await testPrisma.friendship.count({
      where: { userId: user2.id },
    });
    expect(user2FriendCount).toBe(2);
  });
});

describe('Testimonial model', () => {
  beforeEach(async () => {
    await testPrisma.testimonial.deleteMany();
    await testPrisma.friendship.deleteMany();
    await testPrisma.user.deleteMany();
  });

  it('should create a testimonial', async () => {
    const { user: sender } = await createTestUser({ email: 'sender@test.com' });
    const { user: receiver } = await createTestUser({ email: 'receiver@test.com' });

    // Create friendship (required for testimonials)
    await createTestFriendship(sender.id, receiver.id);

    const testimonial = await testPrisma.testimonial.create({
      data: {
        body: 'This is a great friend!',
        senderId: sender.id,
        receiverId: receiver.id,
        approved: false,
        rejected: false,
        createdAt: new Date(),
      },
    });

    expect(testimonial).toBeDefined();
    expect(testimonial.body).toBe('This is a great friend!');
    expect(testimonial.approved).toBe(false);
    expect(testimonial.rejected).toBe(false);
  });

  it('should approve a testimonial', async () => {
    const { user: sender } = await createTestUser({ email: 'sender@test.com' });
    const { user: receiver } = await createTestUser({ email: 'receiver@test.com' });

    await createTestFriendship(sender.id, receiver.id);

    const testimonial = await testPrisma.testimonial.create({
      data: {
        body: 'Pending testimonial',
        senderId: sender.id,
        receiverId: receiver.id,
        approved: false,
        rejected: false,
        createdAt: new Date(),
      },
    });

    const approved = await testPrisma.testimonial.update({
      where: { id: testimonial.id },
      data: { approved: true },
    });

    expect(approved.approved).toBe(true);
  });

  it('should only show approved testimonials', async () => {
    const { user: sender } = await createTestUser({ email: 'sender@test.com' });
    const { user: receiver } = await createTestUser({ email: 'receiver@test.com' });

    await createTestFriendship(sender.id, receiver.id);

    // Create approved and pending testimonials
    await testPrisma.testimonial.createMany({
      data: [
        { body: 'Approved 1', senderId: sender.id, receiverId: receiver.id, approved: true, rejected: false, createdAt: new Date() },
        { body: 'Pending', senderId: sender.id, receiverId: receiver.id, approved: false, rejected: false, createdAt: new Date() },
        { body: 'Approved 2', senderId: sender.id, receiverId: receiver.id, approved: true, rejected: false, createdAt: new Date() },
      ],
    });

    const approved = await testPrisma.testimonial.findMany({
      where: { receiverId: receiver.id, approved: true, deletedAt: null },
    });

    expect(approved.length).toBe(2);
  });
});

describe('Fan model', () => {
  beforeEach(async () => {
    await testPrisma.fan.deleteMany();
    await testPrisma.user.deleteMany();
  });

  it('should create a fan relationship', async () => {
    const { user: fan } = await createTestUser({ email: 'fan@test.com' });
    const { user: idol } = await createTestUser({ email: 'idol@test.com' });

    const fanRelation = await testPrisma.fan.create({
      data: {
        fanId: fan.id,
        idolId: idol.id,
        createdAt: new Date(),
      },
    });

    expect(fanRelation).toBeDefined();
    expect(fanRelation.fanId).toBe(fan.id);
    expect(fanRelation.idolId).toBe(idol.id);
  });

  it('should count fans correctly', async () => {
    const { user: idol } = await createTestUser({ email: 'idol@test.com' });
    const { user: fan1 } = await createTestUser({ email: 'fan1@test.com' });
    const { user: fan2 } = await createTestUser({ email: 'fan2@test.com' });
    const { user: fan3 } = await createTestUser({ email: 'fan3@test.com' });

    await testPrisma.fan.createMany({
      data: [
        { fanId: fan1.id, idolId: idol.id, createdAt: new Date() },
        { fanId: fan2.id, idolId: idol.id, createdAt: new Date() },
        { fanId: fan3.id, idolId: idol.id, createdAt: new Date() },
      ],
    });

    const fanCount = await testPrisma.fan.count({
      where: { idolId: idol.id },
    });

    expect(fanCount).toBe(3);
  });
});
