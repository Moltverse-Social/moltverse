/**
 * Payment REST Routes
 *
 * Production-ready implementation for Solana payment verification.
 *
 * Features:
 * - Quote generation with expiration
 * - Transaction verification with tolerance
 * - Structured audit logging
 * - Rate limiting
 * - Signature reuse prevention
 *
 * Endpoints:
 * - GET  /tokens    List supported payment tokens with prices
 * - GET  /quote     Get payment quote with discount and expiration
 * - GET  /treasury  Get treasury wallet address
 * - POST /verify    Verify payment and activate campaign
 *
 * @module routes/payments
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
// Import to ensure rate-limit type declarations are loaded
import '@fastify/rate-limit';
import { prisma } from '../lib/prisma.js';
import { requireBusinessAgentAuth } from '../lib/agent-guards.js';
import {
  isAdsSystemEnabled,
  AcceptedToken,
  isValidPaymentToken,
  getTokenDiscount,
} from '../lib/ads-constants.js';
import { getTokensInfo, generatePaymentQuote } from '../lib/token-price.js';
import {
  TREASURY_WALLET,
  verifyPaymentTransaction,
  checkTreasuryTokenAccount,
  isValidWalletAddress,
  SolanaError,
} from '../lib/solana.js';
import { logger } from '../lib/logger.js';

// =============================================================================
// CONSTANTS
// =============================================================================

/** Maximum time between quote generation and payment verification (10 minutes) */
const MAX_PAYMENT_WINDOW_MS = 10 * 60 * 1000;

// =============================================================================
// FEATURE FLAG GUARD
// =============================================================================

function requireAdsSystem(
  _request: FastifyRequest,
  reply: FastifyReply,
  done: () => void
): void {
  if (!isAdsSystemEnabled()) {
    reply.status(404).send({
      error: 'Not Found',
      code: 'ADS_SYSTEM_DISABLED',
      message: 'Ads system is not enabled',
    });
    return;
  }
  done();
}

// =============================================================================
// RATE LIMIT CONFIGURATION
// =============================================================================

const QUOTE_RATE_LIMIT = {
  max: 10,
  timeWindow: '1 minute',
  keyGenerator: (request: FastifyRequest) => request.ip,
  errorResponseBuilder: (
    _request: FastifyRequest,
    context: { max: number; ttl: number }
  ) => ({
    statusCode: 429,
    error: 'Too Many Requests',
    code: 'RATE_LIMIT_EXCEEDED',
    message: `Quote rate limit exceeded. Maximum ${context.max} per minute.`,
    retryAfter: Math.ceil(context.ttl / 1000),
  }),
};

const VERIFY_RATE_LIMIT = {
  max: 5,
  timeWindow: '1 minute',
  keyGenerator: (request: FastifyRequest) => request.ip,
  errorResponseBuilder: (
    _request: FastifyRequest,
    context: { max: number; ttl: number }
  ) => ({
    statusCode: 429,
    error: 'Too Many Requests',
    code: 'RATE_LIMIT_EXCEEDED',
    message: `Verification rate limit exceeded. Maximum ${context.max} per minute.`,
    retryAfter: Math.ceil(context.ttl / 1000),
  }),
};

// =============================================================================
// TYPES
// =============================================================================

interface QuoteQuery {
  budgetCents: string;
  token: string;
}

interface VerifyBody {
  campaignId: string;
  txSignature: string;
  token: string;
  senderWallet?: string;
  quoteTimestamp?: number;
}

// =============================================================================
// AUDIT LOGGING
// =============================================================================

function logPaymentEvent(
  event: string,
  data: Record<string, unknown>
): void {
  logger.info({
    ...data,
    timestamp: new Date().toISOString(),
  }, `[Payment] ${event}`);
}

function logPaymentError(
  event: string,
  error: string,
  data: Record<string, unknown>
): void {
  logger.error({
    ...data,
    error,
    timestamp: new Date().toISOString(),
  }, `[Payment] ${event}`);
}

// =============================================================================
// ROUTES
// =============================================================================

export async function paymentRoutes(fastify: FastifyInstance): Promise<void> {
  // Apply feature flag check to all routes
  fastify.addHook('onRequest', requireAdsSystem);

  // GET /tokens - List supported payment tokens
  fastify.get(
    '/tokens',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              tokens: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    symbol: { type: 'string' },
                    name: { type: 'string' },
                    mint: { type: 'string' },
                    decimals: { type: 'integer' },
                    discountPercent: { type: 'integer' },
                    priceUsd: { type: 'number' },
                  },
                },
              },
              treasury: { type: 'string' },
            },
          },
        },
      },
    },
    async (_request, reply) => {
      const tokens = await getTokensInfo();

      logPaymentEvent('TOKENS_LISTED', {
        tokenCount: tokens.length,
      });

      return reply.send({
        tokens,
        treasury: TREASURY_WALLET,
      });
    }
  );

  // GET /treasury - Get treasury wallet address
  fastify.get(
    '/treasury',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              treasury: { type: 'string' },
              network: { type: 'string' },
            },
          },
        },
      },
    },
    async (_request, reply) => {
      const network = process.env.SOLANA_NETWORK ?? 'mainnet-beta';
      return reply.send({
        treasury: TREASURY_WALLET,
        network,
      });
    }
  );

  // GET /quote - Get payment quote with discount
  fastify.get<{ Querystring: QuoteQuery }>(
    '/quote',
    {
      config: { rateLimit: QUOTE_RATE_LIMIT },
      schema: {
        querystring: {
          type: 'object',
          required: ['budgetCents', 'token'],
          properties: {
            budgetCents: { type: 'string' },
            token: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              originalAmountCents: { type: 'integer' },
              discountPercent: { type: 'integer' },
              finalAmountCents: { type: 'integer' },
              finalAmountUsd: { type: 'number' },
              token: { type: 'string' },
              tokenSymbol: { type: 'string' },
              tokenPriceUsd: { type: 'number' },
              amountTokenSmallestUnit: { type: 'string' },
              amountTokenDisplay: { type: 'number' },
              expiresAt: { type: 'string' },
              quoteTimestamp: { type: 'integer' },
              treasury: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { budgetCents, token } = request.query;

      // Validate budget
      const budget = parseInt(budgetCents, 10);
      if (isNaN(budget) || budget <= 0) {
        return reply.status(400).send({
          error: 'Bad Request',
          code: 'INVALID_BUDGET',
          message: 'Budget must be a positive integer (cents)',
        });
      }

      // Validate token
      const tokenUpper = token.toUpperCase();
      if (!isValidPaymentToken(tokenUpper)) {
        return reply.status(400).send({
          error: 'Bad Request',
          code: 'INVALID_TOKEN',
          message: 'Invalid payment token. Supported: SOL, USDC, MOLTVERSE, PUMP',
        });
      }

      // Check if treasury has token account (for SPL tokens)
      const hasTreasuryAccount = await checkTreasuryTokenAccount(tokenUpper as AcceptedToken);
      if (!hasTreasuryAccount) {
        logPaymentError('QUOTE_FAILED', 'Treasury token account not found', {
          token: tokenUpper,
        });
        return reply.status(503).send({
          error: 'Service Unavailable',
          code: 'TREASURY_NOT_READY',
          message: `Treasury is not configured to receive ${tokenUpper}. Please try another token.`,
        });
      }

      const quote = await generatePaymentQuote(budget, tokenUpper as AcceptedToken);
      const quoteTimestamp = Date.now();

      logPaymentEvent('QUOTE_GENERATED', {
        budgetCents: budget,
        token: tokenUpper,
        discountPercent: quote.discountPercent,
        finalAmountCents: quote.finalAmountCents,
        tokenAmount: quote.amountTokenSmallestUnit.toString(),
        ip: request.ip,
      });

      return reply.send({
        ...quote,
        amountTokenSmallestUnit: quote.amountTokenSmallestUnit.toString(),
        quoteTimestamp,
        treasury: TREASURY_WALLET,
      });
    }
  );

  // POST /verify - Verify payment and activate campaign
  fastify.post<{ Body: VerifyBody }>(
    '/verify',
    {
      config: { rateLimit: VERIFY_RATE_LIMIT },
      preHandler: requireBusinessAgentAuth,
      schema: {
        body: {
          type: 'object',
          required: ['campaignId', 'txSignature', 'token'],
          properties: {
            campaignId: { type: 'string', format: 'uuid' },
            txSignature: { type: 'string', minLength: 80, maxLength: 100 },
            token: { type: 'string' },
            senderWallet: { type: 'string', minLength: 32, maxLength: 50 },
            quoteTimestamp: { type: 'integer' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              verified: { type: 'boolean' },
              campaign: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  headline: { type: 'string' },
                  status: { type: 'string' },
                  paymentTxHash: { type: 'string' },
                  paymentToken: { type: 'string' },
                  paymentVerifiedAt: { type: 'string' },
                },
              },
              transaction: {
                type: 'object',
                properties: {
                  signature: { type: 'string' },
                  sender: { type: 'string' },
                  amount: { type: 'string' },
                  token: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const advertiserId = request.agentUserId!;
      const { campaignId, txSignature, token, senderWallet, quoteTimestamp } = request.body;

      const verificationId = `${campaignId}-${Date.now()}`;

      logPaymentEvent('VERIFICATION_STARTED', {
        verificationId,
        campaignId,
        advertiserId,
        txSignature,
        token,
        senderWallet,
        quoteTimestamp,
      });

      // Validate token
      const tokenUpper = token.toUpperCase();
      if (!isValidPaymentToken(tokenUpper)) {
        logPaymentError('VERIFICATION_FAILED', 'Invalid token', {
          verificationId,
          token,
        });
        return reply.status(400).send({
          error: 'Bad Request',
          code: 'INVALID_TOKEN',
          message: 'Invalid payment token',
        });
      }

      // Validate sender wallet if provided
      if (senderWallet && !isValidWalletAddress(senderWallet)) {
        logPaymentError('VERIFICATION_FAILED', 'Invalid sender wallet', {
          verificationId,
          senderWallet,
        });
        return reply.status(400).send({
          error: 'Bad Request',
          code: 'INVALID_WALLET',
          message: 'Invalid sender wallet address',
        });
      }

      // Check quote expiration if timestamp provided
      if (quoteTimestamp) {
        const quoteAge = Date.now() - quoteTimestamp;
        if (quoteAge > MAX_PAYMENT_WINDOW_MS) {
          logPaymentError('VERIFICATION_FAILED', 'Quote expired', {
            verificationId,
            quoteAge,
            maxAge: MAX_PAYMENT_WINDOW_MS,
          });
          return reply.status(400).send({
            error: 'Bad Request',
            code: 'QUOTE_EXPIRED',
            message: 'Payment quote has expired. Please get a new quote and try again.',
          });
        }
      }

      // Fetch campaign
      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
      });

      if (!campaign) {
        logPaymentError('VERIFICATION_FAILED', 'Campaign not found', {
          verificationId,
          campaignId,
        });
        return reply.status(404).send({
          error: 'Not Found',
          code: 'CAMPAIGN_NOT_FOUND',
          message: 'Campaign not found',
        });
      }

      // Verify ownership
      if (campaign.advertiserId !== advertiserId) {
        logPaymentError('VERIFICATION_FAILED', 'Not campaign owner', {
          verificationId,
          campaignId,
          campaignAdvertiserId: campaign.advertiserId,
          requestAdvertiserId: advertiserId,
        });
        return reply.status(403).send({
          error: 'Forbidden',
          code: 'NOT_CAMPAIGN_OWNER',
          message: 'You do not own this campaign',
        });
      }

      // Check campaign status
      if (campaign.status !== 'DRAFT' && campaign.status !== 'PENDING_REVIEW') {
        logPaymentError('VERIFICATION_FAILED', 'Invalid campaign status', {
          verificationId,
          campaignId,
          status: campaign.status,
        });
        return reply.status(400).send({
          error: 'Bad Request',
          code: 'INVALID_CAMPAIGN_STATUS',
          message: `Cannot process payment for campaign in ${campaign.status} status`,
        });
      }

      // Check if already paid
      if (campaign.paymentTxHash) {
        logPaymentError('VERIFICATION_FAILED', 'Already paid', {
          verificationId,
          campaignId,
          existingTxHash: campaign.paymentTxHash,
        });
        return reply.status(400).send({
          error: 'Bad Request',
          code: 'ALREADY_PAID',
          message: 'This campaign has already been paid',
        });
      }

      // Check if signature was already used
      const existingPayment = await prisma.campaign.findFirst({
        where: { paymentTxHash: txSignature },
        select: { id: true },
      });

      if (existingPayment) {
        logPaymentError('VERIFICATION_FAILED', 'Signature reuse attempt', {
          verificationId,
          txSignature,
          existingCampaignId: existingPayment.id,
        });
        return reply.status(400).send({
          error: 'Bad Request',
          code: 'SIGNATURE_REUSED',
          message: 'This transaction signature has already been used',
        });
      }

      // Generate fresh quote for verification
      const quote = await generatePaymentQuote(
        campaign.budgetTotal,
        tokenUpper as AcceptedToken
      );

      logPaymentEvent('VERIFYING_ONCHAIN', {
        verificationId,
        txSignature,
        expectedAmount: quote.amountTokenSmallestUnit.toString(),
        token: tokenUpper,
      });

      // Verify transaction on-chain
      let verification;
      try {
        verification = await verifyPaymentTransaction(
          txSignature,
          tokenUpper as AcceptedToken,
          quote.amountTokenSmallestUnit,
          senderWallet
        );
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const errorCode = error instanceof SolanaError ? error.code : 'VERIFICATION_ERROR';

        logPaymentError('VERIFICATION_FAILED', errorMessage, {
          verificationId,
          txSignature,
          errorCode,
        });

        return reply.status(400).send({
          error: 'Bad Request',
          code: errorCode,
          message: errorMessage,
        });
      }

      if (!verification.verified) {
        logPaymentError('VERIFICATION_FAILED', verification.error ?? 'Unknown', {
          verificationId,
          txSignature,
          errorCode: verification.errorCode,
          receivedAmount: verification.amount?.toString(),
          expectedAmount: quote.amountTokenSmallestUnit.toString(),
        });

        return reply.status(400).send({
          error: 'Bad Request',
          code: verification.errorCode ?? 'PAYMENT_VERIFICATION_FAILED',
          message: verification.error ?? 'Payment verification failed',
        });
      }

      // Update campaign with payment info and activate
      const updatedCampaign = await prisma.campaign.update({
        where: { id: campaignId },
        data: {
          status: 'ACTIVE',
          paymentTxHash: txSignature,
          paymentToken: tokenUpper as AcceptedToken,
          paymentAmount: verification.amount ?? null,
          paymentVerifiedAt: new Date(),
          startDate: campaign.startDate ?? new Date(),
        },
        select: {
          id: true,
          headline: true,
          status: true,
          paymentTxHash: true,
          paymentToken: true,
          paymentVerifiedAt: true,
          budgetTotal: true,
        },
      });

      logPaymentEvent('VERIFICATION_SUCCESS', {
        verificationId,
        campaignId,
        advertiserId,
        txSignature,
        token: tokenUpper,
        amount: verification.amount?.toString(),
        sender: verification.sender,
        budgetTotal: campaign.budgetTotal,
        discountPercent: getTokenDiscount(tokenUpper as AcceptedToken),
      });

      return reply.send({
        verified: true,
        campaign: updatedCampaign,
        transaction: {
          signature: txSignature,
          sender: verification.sender,
          amount: verification.amount?.toString(),
          token: tokenUpper,
        },
      });
    }
  );

  // GET /health - Check payment system health
  fastify.get(
    '/health',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              treasury: { type: 'string' },
              tokens: {
                type: 'object',
                additionalProperties: { type: 'boolean' },
              },
            },
          },
        },
      },
    },
    async (_request, reply) => {
      const tokens: Record<string, boolean> = {};

      // Check treasury accounts for each token
      for (const tokenKey of ['SOL', 'USDC', 'MOLTVERSE', 'PUMP'] as AcceptedToken[]) {
        try {
          tokens[tokenKey] = await checkTreasuryTokenAccount(tokenKey);
        } catch {
          tokens[tokenKey] = false;
        }
      }

      const allReady = Object.values(tokens).every((v) => v);

      return reply.send({
        status: allReady ? 'healthy' : 'degraded',
        treasury: TREASURY_WALLET,
        tokens,
      });
    }
  );
}
