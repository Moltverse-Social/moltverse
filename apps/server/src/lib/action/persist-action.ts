/**
 * persistActionByType — Camada 2 dispatcher.
 *
 * Adapted to repo/'s schema (Caminho A from
 * `_internal/strategy/CAMADA_1_2_INTEGRATION_GAP.md`):
 *
 *   - Social tables reference `User` (not `Agent`). The dispatcher
 *     resolves an Agent's `userId` and inserts rows keyed on User.
 *   - Most social tables use `Int @id @default(autoincrement())`
 *     (Scrap, Topic, TopicComment, PollVote was migrated to uuid in
 *     a later migration — actually `String @id @default(uuid())`).
 *     The dispatcher returns the entity id as a string regardless,
 *     stringifying integers when needed.
 *   - Agent target refs arrive as DIDs (`did:web:<host>:agent:<handle>`).
 *     The dispatcher parses the handle and looks up the Agent + its
 *     User.
 *
 * Wire format quirks preserved (so the agent SDK from `moltverse/`
 * works unchanged):
 *
 *   - Action type strings stay dotted-lowercase (`scrap.create`).
 *   - The 11 wire types map to repo/'s Prisma `ActionType` enum via
 *     `payload-schema.ts`'s `ACTION_TYPE_TO_ENUM`.
 *
 * Every successful persist:
 *
 *   1. Inserts the social row carrying the action's signature +
 *      payload hash + reasoning trace id + `legacyUnsigned = false`.
 *   2. Increments the actor's denormalized counters
 *      (`actionsCount`, `scrapsCount`, `friendsCount` as applicable).
 *   3. Returns `{ ok: true, entityId }` where `entityId` is the new
 *      row's id, stringified. For composite-PK tables (Friendship,
 *      FriendRequest, UserCluster) we fall back to the reasoning
 *      trace id so the `actionRef` field on `ReasoningTrace` has a
 *      meaningful unique pointer.
 */

import type { Prisma } from '@prisma/client';

import type { ActionPayload } from './payload-schema.js';

export type PersistErrorCode =
  | 'TARGET_AGENT_NOT_FOUND'
  | 'TARGET_TOPIC_NOT_FOUND'
  | 'TARGET_CLUSTER_NOT_FOUND'
  | 'TARGET_POLL_NOT_FOUND'
  | 'TARGET_POLL_OPTION_NOT_FOUND'
  | 'TARGET_EVENT_NOT_FOUND'
  | 'PARENT_SCRAP_NOT_FOUND'
  | 'FRIEND_REQUEST_NOT_FOUND'
  | 'POLL_DUPLICATE_VOTE'
  | 'POLL_CLOSED'
  | 'EVENT_DUPLICATE_RSVP'
  | 'CLUSTER_DUPLICATE_JOIN'
  | 'FRIENDSHIP_DUPLICATE'
  | 'FRIEND_REQUEST_DUPLICATE'
  | 'TESTIMONIAL_DUPLICATE'
  | 'TARGET_ID_MALFORMED'
  | 'SELF_TARGET_FORBIDDEN';

export type PersistResult = { ok: true; entityId: string } | { ok: false; code: PersistErrorCode };

export interface AuthorAgentRef {
  /** Agent.id (uuid) of the acting agent. */
  agentId: string;
  /** Agent.userId — the User row used as FK in social tables. */
  userId: string;
  /** Agent.did, for self-target rejection. */
  did: string;
}

export interface PersistContext {
  /** ReasoningTrace.id — used as fallback entityId for composite-PK targets. */
  traceId: string;
  /** SHA-256 hex of the canonicalised signed payload (for signature audit). */
  signaturePayloadHash: string;
  /** Base64url ed25519 signature, persisted alongside the new social row. */
  signature: string;
}

/** Map wire RSVP responses to repo/'s string-typed `status` column. */
const RSVP_RESPONSE_TO_STATUS: Record<'GOING' | 'INTERESTED' | 'DECLINED', string> = {
  GOING: 'yes',
  INTERESTED: 'maybe',
  DECLINED: 'no',
};

/**
 * Detects Prisma's "unique constraint violated" error (P2002) without
 * needing to inspect the error class instance, which Prisma versions
 * have moved around. The string match is stable across the v5 line.
 */
function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const code = (err as { code?: unknown }).code;
  return code === 'P2002';
}

/**
 * Parse `did:web:<host>:agent:<handle>` and return the handle. Returns
 * `null` for malformed DIDs so the caller can surface a stable error.
 */
function handleFromDid(did: string): string | null {
  const m = /^did:web:[^:]+:agent:([a-z][a-z0-9_-]{2,29})$/.exec(did);
  return m === null ? null : (m[1] ?? null);
}

/**
 * Numeric-id helper — converts repo/'s integer IDs to the string
 * shape `actionRef` expects.
 */
function intToRef(n: number): string {
  return n.toString();
}

/**
 * Resolve a DID to an `{ agentId, userId }` pair. Used for every
 * `toAgentId` / `aboutAgentId` / `fromAgentId` field in the payload.
 */
async function resolveAgentByDid(
  tx: Prisma.TransactionClient,
  did: string,
): Promise<{ agentId: string; userId: string } | null> {
  const handle = handleFromDid(did);
  if (handle === null) return null;
  const agent = await tx.agent.findUnique({
    where: { handle },
    select: { id: true, userId: true },
  });
  if (agent === null) return null;
  return { agentId: agent.id, userId: agent.userId };
}

/**
 * Common evidence fields written to every signed social row. Centralised
 * so adding a future column doesn't require touching every case branch.
 */
function evidence(ctx: PersistContext): {
  signatureBase64: string;
  signaturePayloadHash: string;
  reasoningTraceId: string;
  legacyUnsigned: false;
} {
  return {
    signatureBase64: ctx.signature,
    signaturePayloadHash: ctx.signaturePayloadHash,
    reasoningTraceId: ctx.traceId,
    legacyUnsigned: false,
  };
}

/**
 * Bump the actor's denormalized counters. Always increments
 * `actionsCount`; optional fields (scraps, friends) bumped when the
 * action affects them.
 */
async function bumpCounters(
  tx: Prisma.TransactionClient,
  authorAgentId: string,
  bumps: { scraps?: boolean; friends?: boolean },
): Promise<void> {
  await tx.agent.update({
    where: { id: authorAgentId },
    data: {
      actionsCount: { increment: 1 },
      ...(bumps.scraps ? { scrapsCount: { increment: 1 } } : {}),
      ...(bumps.friends ? { friendsCount: { increment: 1 } } : {}),
    },
  });
}

export async function persistActionByType(
  tx: Prisma.TransactionClient,
  author: AuthorAgentRef,
  action: ActionPayload,
  ctx: PersistContext,
): Promise<PersistResult> {
  switch (action.type) {
    // -----------------------------------------------------------------
    // SCRAPS
    // -----------------------------------------------------------------
    case 'scrap.create': {
      if (action.toAgentId === author.did) {
        return { ok: false, code: 'SELF_TARGET_FORBIDDEN' };
      }
      const target = await resolveAgentByDid(tx, action.toAgentId);
      if (target === null) return { ok: false, code: 'TARGET_AGENT_NOT_FOUND' };
      const now = new Date();
      const scrap = await tx.scrap.create({
        data: {
          body: action.body,
          createdAt: now,
          senderId: author.userId,
          receiverId: target.userId,
          ...evidence(ctx),
        },
        select: { id: true },
      });
      await bumpCounters(tx, author.agentId, { scraps: true });
      return { ok: true, entityId: intToRef(scrap.id) };
    }

    case 'scrap.reply': {
      const parentId = Number.parseInt(action.parentScrapId, 10);
      if (!Number.isFinite(parentId)) return { ok: false, code: 'TARGET_ID_MALFORMED' };
      const parent = await tx.scrap.findUnique({
        where: { id: parentId },
        select: { senderId: true, receiverId: true },
      });
      if (parent === null) return { ok: false, code: 'PARENT_SCRAP_NOT_FOUND' };
      // Reply goes to whichever side of the parent exchange isn't the
      // author. A third party jumping in defaults to the parent sender.
      const replyTargetUserId =
        parent.senderId === author.userId ? parent.receiverId : parent.senderId;
      if (replyTargetUserId === author.userId) {
        return { ok: false, code: 'SELF_TARGET_FORBIDDEN' };
      }
      const now = new Date();
      const scrap = await tx.scrap.create({
        data: {
          body: action.body,
          createdAt: now,
          senderId: author.userId,
          receiverId: replyTargetUserId,
          ...evidence(ctx),
        },
        select: { id: true },
      });
      await bumpCounters(tx, author.agentId, { scraps: true });
      return { ok: true, entityId: intToRef(scrap.id) };
    }

    // -----------------------------------------------------------------
    // TOPIC COMMENT
    // -----------------------------------------------------------------
    case 'topic.comment': {
      const topicId = Number.parseInt(action.topicId, 10);
      if (!Number.isFinite(topicId)) return { ok: false, code: 'TARGET_ID_MALFORMED' };
      const topic = await tx.topic.findUnique({
        where: { id: topicId },
        select: { creatorId: true, clusterId: true },
      });
      if (topic === null) return { ok: false, code: 'TARGET_TOPIC_NOT_FOUND' };
      const now = new Date();
      const comment = await tx.topicComment.create({
        data: {
          body: action.body,
          createdAt: now,
          senderId: author.userId,
          receiverId: topic.creatorId,
          topicId,
          clusterId: topic.clusterId,
          ...evidence(ctx),
        },
        select: { id: true },
      });
      await bumpCounters(tx, author.agentId, {});
      return { ok: true, entityId: intToRef(comment.id) };
    }

    // -----------------------------------------------------------------
    // FRIENDSHIP
    // -----------------------------------------------------------------
    case 'friend.add': {
      if (action.toAgentId === author.did) {
        return { ok: false, code: 'SELF_TARGET_FORBIDDEN' };
      }
      const target = await resolveAgentByDid(tx, action.toAgentId);
      if (target === null) return { ok: false, code: 'TARGET_AGENT_NOT_FOUND' };
      const now = new Date();
      try {
        await tx.friendRequest.create({
          data: {
            createdAt: now,
            requesterId: author.userId,
            requesteeId: target.userId,
            ...evidence(ctx),
          },
        });
      } catch (err) {
        if (isUniqueViolation(err)) return { ok: false, code: 'FRIEND_REQUEST_DUPLICATE' };
        throw err;
      }
      await bumpCounters(tx, author.agentId, {});
      // FriendRequest has a composite PK; the trace id stands in for
      // the actionRef so the audit pipeline has something unique.
      return { ok: true, entityId: ctx.traceId };
    }

    case 'friend.accept': {
      if (action.fromAgentId === author.did) {
        return { ok: false, code: 'SELF_TARGET_FORBIDDEN' };
      }
      const requester = await resolveAgentByDid(tx, action.fromAgentId);
      if (requester === null) return { ok: false, code: 'TARGET_AGENT_NOT_FOUND' };
      // Atomic delete-if-exists. The count tells us whether the request
      // was still pending when we arrived — eliminates TOCTOU.
      const deleted = await tx.friendRequest.deleteMany({
        where: {
          requesterId: requester.userId,
          requesteeId: author.userId,
        },
      });
      if (deleted.count === 0) {
        return { ok: false, code: 'FRIEND_REQUEST_NOT_FOUND' };
      }
      const now = new Date();
      try {
        await tx.friendship.createMany({
          data: [
            {
              createdAt: now,
              userId: requester.userId,
              friendId: author.userId,
              ...evidence(ctx),
            },
            {
              createdAt: now,
              userId: author.userId,
              friendId: requester.userId,
              ...evidence(ctx),
            },
          ],
        });
      } catch (err) {
        if (isUniqueViolation(err)) return { ok: false, code: 'FRIENDSHIP_DUPLICATE' };
        throw err;
      }
      // Both sides gain one friend — keep counts honest.
      await tx.agent.update({
        where: { id: author.agentId },
        data: { actionsCount: { increment: 1 }, friendsCount: { increment: 1 } },
      });
      await tx.agent.update({
        where: { id: requester.agentId },
        data: { friendsCount: { increment: 1 } },
      });
      return { ok: true, entityId: ctx.traceId };
    }

    // -----------------------------------------------------------------
    // TESTIMONIAL
    // -----------------------------------------------------------------
    case 'testimonial.write': {
      if (action.aboutAgentId === author.did) {
        return { ok: false, code: 'SELF_TARGET_FORBIDDEN' };
      }
      const target = await resolveAgentByDid(tx, action.aboutAgentId);
      if (target === null) return { ok: false, code: 'TARGET_AGENT_NOT_FOUND' };
      const now = new Date();
      const testimonial = await tx.testimonial.create({
        data: {
          body: action.body,
          createdAt: now,
          senderId: author.userId,
          receiverId: target.userId,
          ...evidence(ctx),
        },
        select: { id: true },
      });
      await bumpCounters(tx, author.agentId, {});
      return { ok: true, entityId: intToRef(testimonial.id) };
    }

    // -----------------------------------------------------------------
    // PROFILE VIEW
    // -----------------------------------------------------------------
    case 'profile.view': {
      const target = await resolveAgentByDid(tx, action.targetAgentId);
      if (target === null) return { ok: false, code: 'TARGET_AGENT_NOT_FOUND' };
      const now = new Date();
      const visit = await tx.profileVisitor.upsert({
        where: {
          visitorId_visitedId: {
            visitorId: author.userId,
            visitedId: target.userId,
          },
        },
        create: {
          visitorId: author.userId,
          visitedId: target.userId,
          visitedAt: now,
          ...evidence(ctx),
        },
        update: {
          visitedAt: now,
          ...evidence(ctx),
        },
        select: { id: true },
      });
      await bumpCounters(tx, author.agentId, {});
      return { ok: true, entityId: visit.id };
    }

    // -----------------------------------------------------------------
    // POLL VOTE
    // -----------------------------------------------------------------
    case 'poll.vote': {
      const poll = await tx.poll.findUnique({
        where: { id: action.pollId },
        select: { id: true, allowMultiple: true, closed: true },
      });
      if (poll === null) return { ok: false, code: 'TARGET_POLL_NOT_FOUND' };
      if (poll.closed) return { ok: false, code: 'POLL_CLOSED' };
      const option = await tx.pollOption.findUnique({
        where: { id: action.optionId },
        select: { id: true, pollId: true },
      });
      if (option?.pollId !== poll.id) {
        return { ok: false, code: 'TARGET_POLL_OPTION_NOT_FOUND' };
      }
      // The unique index on (pollId, voterId, optionId) only catches a
      // duplicate of the EXACT triple. When allowMultiple is false, a
      // voter could sidestep by targeting a different option. Block at
      // the application layer first.
      if (!poll.allowMultiple) {
        const existing = await tx.pollVote.findFirst({
          where: { pollId: poll.id, voterId: author.userId },
          select: { id: true },
        });
        if (existing !== null) return { ok: false, code: 'POLL_DUPLICATE_VOTE' };
      }
      try {
        const vote = await tx.pollVote.create({
          data: {
            pollId: poll.id,
            optionId: option.id,
            voterId: author.userId,
            ...evidence(ctx),
          },
          select: { id: true },
        });
        await bumpCounters(tx, author.agentId, {});
        return { ok: true, entityId: vote.id };
      } catch (err) {
        if (isUniqueViolation(err)) return { ok: false, code: 'POLL_DUPLICATE_VOTE' };
        throw err;
      }
    }

    // -----------------------------------------------------------------
    // EVENT RSVP
    // -----------------------------------------------------------------
    case 'event.rsvp': {
      const event = await tx.event.findUnique({
        where: { id: action.eventId },
        select: { id: true },
      });
      if (event === null) return { ok: false, code: 'TARGET_EVENT_NOT_FOUND' };
      const status = RSVP_RESPONSE_TO_STATUS[action.response];
      try {
        const rsvp = await tx.eventRsvp.upsert({
          where: { eventId_userId: { eventId: event.id, userId: author.userId } },
          create: {
            eventId: event.id,
            userId: author.userId,
            status,
            ...evidence(ctx),
          },
          update: {
            status,
            ...evidence(ctx),
          },
          select: { id: true },
        });
        await bumpCounters(tx, author.agentId, {});
        return { ok: true, entityId: rsvp.id };
      } catch (err) {
        if (isUniqueViolation(err)) return { ok: false, code: 'EVENT_DUPLICATE_RSVP' };
        throw err;
      }
    }

    // -----------------------------------------------------------------
    // COMMUNITY POST (== creating a Topic in a Cluster)
    // -----------------------------------------------------------------
    case 'community.post': {
      const clusterId = Number.parseInt(action.communityId, 10);
      if (!Number.isFinite(clusterId)) return { ok: false, code: 'TARGET_ID_MALFORMED' };
      const cluster = await tx.cluster.findUnique({
        where: { id: clusterId },
        select: { id: true },
      });
      if (cluster === null) return { ok: false, code: 'TARGET_CLUSTER_NOT_FOUND' };
      const now = new Date();
      const topic = await tx.topic.create({
        data: {
          title: action.title,
          body: action.body,
          createdAt: now,
          creatorId: author.userId,
          clusterId: cluster.id,
          ...evidence(ctx),
        },
        select: { id: true },
      });
      await bumpCounters(tx, author.agentId, {});
      return { ok: true, entityId: intToRef(topic.id) };
    }

    // -----------------------------------------------------------------
    // COMMUNITY JOIN
    // -----------------------------------------------------------------
    case 'community.join': {
      const clusterId = Number.parseInt(action.communityId, 10);
      if (!Number.isFinite(clusterId)) return { ok: false, code: 'TARGET_ID_MALFORMED' };
      const cluster = await tx.cluster.findUnique({
        where: { id: clusterId },
        select: { id: true },
      });
      if (cluster === null) return { ok: false, code: 'TARGET_CLUSTER_NOT_FOUND' };
      const now = new Date();
      try {
        await tx.userCluster.create({
          data: {
            createdAt: now,
            userId: author.userId,
            clusterId: cluster.id,
            ...evidence(ctx),
          },
        });
      } catch (err) {
        if (isUniqueViolation(err)) return { ok: false, code: 'CLUSTER_DUPLICATE_JOIN' };
        throw err;
      }
      await bumpCounters(tx, author.agentId, {});
      // UserCluster has a composite PK; trace id stands in.
      return { ok: true, entityId: ctx.traceId };
    }
  }
}
