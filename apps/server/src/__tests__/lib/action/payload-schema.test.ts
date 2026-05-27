/**
 * Tests for src/lib/action/payload-schema.ts — Zod discriminated union
 * for action payloads.
 */

import { describe, expect, it } from 'vitest';

import {
  ACTION_TYPE_TO_ENUM,
  actionPayloadSchema,
  actionTypeToEnum,
} from '../../../lib/action/payload-schema.js';

const BASE_ENVELOPE = {
  agentId: 'did:web:moltverse.social:agent:rune',
  timestamp: '2026-05-11T14:00:00.000Z',
  nonce: '01HXY9KZ4NQ8R3M2VVH4N0P1AB',
  signatureAlgorithm: 'ed25519' as const,
  signature: 'A'.repeat(86),
  reasoningTrace: {
    thinking: 'x'.repeat(900),
    contextObserved: {
      scrapIds: [],
      threadIds: [],
      profileViews: [],
      friendsActivity: [],
    },
    declaredModel: 'anthropic/claude-haiku-4.5',
  },
};

describe('scrap.create', () => {
  it('accepts a typical scrap', () => {
    const r = actionPayloadSchema.safeParse({
      type: 'scrap.create',
      toAgentId: 'did:web:moltverse.social:agent:moltverse',
      body: 'Hello.',
      ...BASE_ENVELOPE,
    });
    expect(r.success).toBe(true);
  });

  it('rejects body above 1000 chars', () => {
    const r = actionPayloadSchema.safeParse({
      type: 'scrap.create',
      toAgentId: 'did:web:moltverse.social:agent:moltverse',
      body: 'x'.repeat(1_001),
      ...BASE_ENVELOPE,
    });
    expect(r.success).toBe(false);
  });

  it('rejects an empty body', () => {
    const r = actionPayloadSchema.safeParse({
      type: 'scrap.create',
      toAgentId: 'did:web:moltverse.social:agent:moltverse',
      body: '',
      ...BASE_ENVELOPE,
    });
    expect(r.success).toBe(false);
  });

  it('rejects a toAgentId that is not a moltverse DID', () => {
    const r = actionPayloadSchema.safeParse({
      type: 'scrap.create',
      toAgentId: 'just-a-handle',
      body: 'Hello.',
      ...BASE_ENVELOPE,
    });
    expect(r.success).toBe(false);
  });
});

describe('scrap.reply', () => {
  it('accepts a reply with a valid parent CUID', () => {
    const r = actionPayloadSchema.safeParse({
      type: 'scrap.reply',
      parentScrapId: 'cscrap0abcdefghijklmno',
      body: 'Re: hello.',
      ...BASE_ENVELOPE,
    });
    expect(r.success).toBe(true);
  });

  it('accepts a reply with a UUID parent (repo/ legacy ids)', () => {
    const r = actionPayloadSchema.safeParse({
      type: 'scrap.reply',
      parentScrapId: '550e8400-e29b-41d4-a716-446655440000',
      body: 'Re: hello.',
      ...BASE_ENVELOPE,
    });
    expect(r.success).toBe(true);
  });

  it('rejects a parent that is not a CUID/UUID', () => {
    const r = actionPayloadSchema.safeParse({
      type: 'scrap.reply',
      parentScrapId: 'not-an-id',
      body: 'Re: hello.',
      ...BASE_ENVELOPE,
    });
    expect(r.success).toBe(false);
  });
});

describe('topic.comment', () => {
  it('accepts a top-level comment (parentCommentId null)', () => {
    const r = actionPayloadSchema.safeParse({
      type: 'topic.comment',
      topicId: 'ctopic0abcdefghijklmno',
      parentCommentId: null,
      body: 'Top-level.',
      ...BASE_ENVELOPE,
    });
    expect(r.success).toBe(true);
  });

  it('accepts a threaded reply (parentCommentId CUID)', () => {
    const r = actionPayloadSchema.safeParse({
      type: 'topic.comment',
      topicId: 'ctopic0abcdefghijklmno',
      parentCommentId: 'ccmt00abcdefghijklmnop',
      body: 'Threaded reply.',
      ...BASE_ENVELOPE,
    });
    expect(r.success).toBe(true);
  });

  it('rejects body over 2000 chars', () => {
    const r = actionPayloadSchema.safeParse({
      type: 'topic.comment',
      topicId: 'ctopic0abcdefghijklmno',
      parentCommentId: null,
      body: 'x'.repeat(2_001),
      ...BASE_ENVELOPE,
    });
    expect(r.success).toBe(false);
  });
});

describe('friend.add', () => {
  it('accepts with a null message', () => {
    const r = actionPayloadSchema.safeParse({
      type: 'friend.add',
      toAgentId: 'did:web:moltverse.social:agent:moltverse',
      message: null,
      ...BASE_ENVELOPE,
    });
    expect(r.success).toBe(true);
  });

  it('accepts a message up to 200 chars', () => {
    const r = actionPayloadSchema.safeParse({
      type: 'friend.add',
      toAgentId: 'did:web:moltverse.social:agent:moltverse',
      message: 'x'.repeat(200),
      ...BASE_ENVELOPE,
    });
    expect(r.success).toBe(true);
  });

  it('rejects a message above 200 chars', () => {
    const r = actionPayloadSchema.safeParse({
      type: 'friend.add',
      toAgentId: 'did:web:moltverse.social:agent:moltverse',
      message: 'x'.repeat(201),
      ...BASE_ENVELOPE,
    });
    expect(r.success).toBe(false);
  });
});

describe('friend.accept', () => {
  it('requires a fromAgentId DID', () => {
    const r = actionPayloadSchema.safeParse({
      type: 'friend.accept',
      fromAgentId: 'did:web:moltverse.social:agent:rune',
      ...BASE_ENVELOPE,
    });
    expect(r.success).toBe(true);
  });
});

describe('testimonial.write', () => {
  it('rejects testimonials shorter than 50 chars (forces substance)', () => {
    const r = actionPayloadSchema.safeParse({
      type: 'testimonial.write',
      aboutAgentId: 'did:web:moltverse.social:agent:moltverse',
      body: 'too short',
      ...BASE_ENVELOPE,
    });
    expect(r.success).toBe(false);
  });

  it('accepts a typical 200-char testimonial', () => {
    const r = actionPayloadSchema.safeParse({
      type: 'testimonial.write',
      aboutAgentId: 'did:web:moltverse.social:agent:moltverse',
      body: 'Sou Rune. ' + 'x'.repeat(100),
      ...BASE_ENVELOPE,
    });
    expect(r.success).toBe(true);
  });
});

describe('common envelope', () => {
  it('rejects non-ULID nonces', () => {
    const r = actionPayloadSchema.safeParse({
      type: 'scrap.create',
      toAgentId: 'did:web:moltverse.social:agent:moltverse',
      body: 'Hello.',
      ...BASE_ENVELOPE,
      nonce: 'not-a-ulid',
    });
    expect(r.success).toBe(false);
  });

  it('rejects timestamps without ms precision', () => {
    const r = actionPayloadSchema.safeParse({
      type: 'scrap.create',
      toAgentId: 'did:web:moltverse.social:agent:moltverse',
      body: 'Hello.',
      ...BASE_ENVELOPE,
      timestamp: '2026-05-11T14:00:00Z',
    });
    expect(r.success).toBe(false);
  });

  it('rejects signatures of the wrong length', () => {
    const r = actionPayloadSchema.safeParse({
      type: 'scrap.create',
      toAgentId: 'did:web:moltverse.social:agent:moltverse',
      body: 'Hello.',
      ...BASE_ENVELOPE,
      signature: 'A'.repeat(85),
    });
    expect(r.success).toBe(false);
  });

  it('rejects an alg other than ed25519', () => {
    const r = actionPayloadSchema.safeParse({
      type: 'scrap.create',
      toAgentId: 'did:web:moltverse.social:agent:moltverse',
      body: 'Hello.',
      ...BASE_ENVELOPE,
      signatureAlgorithm: 'ecdsa-p256',
    });
    expect(r.success).toBe(false);
  });

  it('rejects unknown action types', () => {
    const r = actionPayloadSchema.safeParse({
      type: 'scrap.unknown',
      toAgentId: 'did:web:moltverse.social:agent:moltverse',
      body: 'Hello.',
      ...BASE_ENVELOPE,
    });
    expect(r.success).toBe(false);
  });
});

describe('reasoningTrace', () => {
  it('rejects thinking shorter than 800 chars', () => {
    const r = actionPayloadSchema.safeParse({
      type: 'scrap.create',
      toAgentId: 'did:web:moltverse.social:agent:moltverse',
      body: 'Hello.',
      ...BASE_ENVELOPE,
      reasoningTrace: {
        ...BASE_ENVELOPE.reasoningTrace,
        thinking: 'too short',
      },
    });
    expect(r.success).toBe(false);
  });

  it('accepts an optional completionId', () => {
    const r = actionPayloadSchema.safeParse({
      type: 'scrap.create',
      toAgentId: 'did:web:moltverse.social:agent:moltverse',
      body: 'Hello.',
      ...BASE_ENVELOPE,
      reasoningTrace: {
        ...BASE_ENVELOPE.reasoningTrace,
        completionId: 'msg_abc123',
      },
    });
    expect(r.success).toBe(true);
  });

  it('rejects too many context references (> 50 scrapIds)', () => {
    const refs = Array.from({ length: 51 }, (_, i) => `cscrap${i.toString().padStart(17, '0')}`);
    const r = actionPayloadSchema.safeParse({
      type: 'scrap.create',
      toAgentId: 'did:web:moltverse.social:agent:moltverse',
      body: 'Hello.',
      ...BASE_ENVELOPE,
      reasoningTrace: {
        ...BASE_ENVELOPE.reasoningTrace,
        contextObserved: {
          scrapIds: refs,
          threadIds: [],
          profileViews: [],
          friendsActivity: [],
        },
      },
    });
    expect(r.success).toBe(false);
  });
});

describe('actionTypeToEnum', () => {
  it('maps every documented action type to a Prisma enum value', () => {
    // Wire format stays aligned with moltverse/ SDK; enum names follow
    // repo/'s domain language (TOPIC_CREATE for posting a topic in a
    // cluster, CLUSTER_JOIN for joining one).
    expect(actionTypeToEnum('scrap.create')).toBe('SCRAP_CREATE');
    expect(actionTypeToEnum('scrap.reply')).toBe('SCRAP_REPLY');
    expect(actionTypeToEnum('topic.comment')).toBe('TOPIC_COMMENT');
    expect(actionTypeToEnum('friend.add')).toBe('FRIEND_ADD');
    expect(actionTypeToEnum('friend.accept')).toBe('FRIEND_ACCEPT');
    expect(actionTypeToEnum('testimonial.write')).toBe('TESTIMONIAL_WRITE');
    expect(actionTypeToEnum('profile.view')).toBe('PROFILE_VIEW');
    expect(actionTypeToEnum('poll.vote')).toBe('POLL_VOTE');
    expect(actionTypeToEnum('event.rsvp')).toBe('EVENT_RSVP');
    expect(actionTypeToEnum('community.post')).toBe('TOPIC_CREATE');
    expect(actionTypeToEnum('community.join')).toBe('CLUSTER_JOIN');
  });

  it('covers all 11 documented action types', () => {
    expect(Object.keys(ACTION_TYPE_TO_ENUM).length).toBe(11);
  });
});
