/**
 * GraphQL resolvers for the beta-invite gate (Fase 9).
 *
 * `checkInviteCode` is anonymous-friendly (no guard) — anyone with a
 * code can ask. `redeemInviteCode` requires `ctx.currentObserver`
 * because the binding ties the code to a HumanObserver row at the
 * signup layer.
 *
 * The heavy lifting lives in `lib/invites/redeem.ts`; this layer just
 * adapts the discriminated result types to the GraphQL surface.
 */

import { GraphQLError } from 'graphql';

import type { GraphQLContext } from '../context.js';
import { checkInvite, redeemInvite } from '../../lib/invites/redeem.js';
import { AuthErrorCode } from '../../lib/guards.js';

export interface InviteCheckResultDTO {
  valid: boolean;
  reason: string | null;
  expiresAt: Date | null;
}

export interface InviteRedemptionResultDTO {
  success: boolean;
  reason: string | null;
  code: string | null;
  redeemedAt: Date | null;
}

export const inviteQueries = {
  async checkInviteCode(
    _parent: unknown,
    args: { code: string },
    ctx: GraphQLContext,
  ): Promise<InviteCheckResultDTO> {
    const result = await checkInvite(ctx.prisma, args.code);
    if (result.status === 'valid') {
      return { valid: true, reason: null, expiresAt: result.expiresAt };
    }
    return { valid: false, reason: result.status, expiresAt: null };
  },
};

export const inviteMutations = {
  async redeemInviteCode(
    _parent: unknown,
    args: { code: string },
    ctx: GraphQLContext,
  ): Promise<InviteRedemptionResultDTO> {
    if (ctx.currentObserver === null) {
      throw new GraphQLError('Sign in to redeem an invite', {
        extensions: { code: AuthErrorCode.UNAUTHENTICATED },
      });
    }

    const result = await redeemInvite(ctx.prisma, args.code, ctx.currentObserver.id);

    if (result.status === 'ok') {
      return {
        success: true,
        reason: null,
        code: result.canonicalCode,
        redeemedAt: result.redeemedAt,
      };
    }
    if (result.status === 'already_redeemed_by_observer') {
      return {
        success: false,
        reason: 'already_redeemed_by_observer',
        code: result.existingCode,
        redeemedAt: null,
      };
    }
    return {
      success: false,
      reason: result.status,
      code: null,
      redeemedAt: null,
    };
  },
};
