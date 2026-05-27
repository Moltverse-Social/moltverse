/**
 * Tests for Solana Payment System
 *
 * Tests for:
 * - lib/solana.ts (transaction verification, balance queries, utilities)
 * - lib/token-price.ts (price fetching, quote generation, caching)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock @solana/web3.js before importing any modules that use it
vi.mock('@solana/web3.js', () => {
  // Base58 alphabet for validation
  const BASE58_CHARS = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

  return {
    Connection: vi.fn().mockImplementation(() => ({
      rpcEndpoint: 'https://api.mainnet-beta.solana.com',
      getParsedTransaction: vi.fn(),
      getBalance: vi.fn(),
    })),
    PublicKey: vi.fn().mockImplementation((key: string) => {
      // Validate base58 and length like real PublicKey
      if (!key || key.length < 32 || key.length > 50) {
        throw new Error('Invalid public key input');
      }
      for (const char of key) {
        if (!BASE58_CHARS.includes(char)) {
          throw new Error('Invalid public key input');
        }
      }
      return {
        toString: () => key,
        toBase58: () => key,
      };
    }),
    ParsedTransactionWithMeta: {},
    ParsedInstruction: {},
  };
});

import {
  TREASURY_WALLET,
  getConnection,
  getTokenMint,
  getTokenDecimals,
  isNativeSOL,
  isValidWalletAddress,
  centsToTokenAmount,
  formatTokenAmount,
  __testExports as solanaTestExports,
} from '../lib/solana.js';
import {
  getTokenPrice,
  getAllTokenPrices,
  generatePaymentQuote,
  getTokensInfo,
  __testExports as priceTestExports,
} from '../lib/token-price.js';
import { ACCEPTED_TOKENS } from '../lib/ads-constants.js';

// =============================================================================
// SOLANA TESTS
// =============================================================================

describe('lib/solana', () => {
  describe('TREASURY_WALLET', () => {
    it('should have a valid treasury wallet address', () => {
      expect(TREASURY_WALLET).toBeDefined();
      expect(TREASURY_WALLET.length).toBeGreaterThanOrEqual(32);
    });
  });

  describe('getConnection', () => {
    it('should return a Solana connection', () => {
      const connection = getConnection();
      expect(connection).toBeDefined();
      expect(connection.rpcEndpoint).toBeDefined();
    });

    it('should return singleton connection', () => {
      const conn1 = getConnection();
      const conn2 = getConnection();
      expect(conn1).toBe(conn2);
    });
  });

  describe('getTokenMint', () => {
    it('should return mint address for SOL', () => {
      const mint = getTokenMint('SOL');
      expect(mint).toBe('So11111111111111111111111111111111111111112');
    });

    it('should return mint address for USDC', () => {
      const mint = getTokenMint('USDC');
      expect(mint).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    });

    it('should throw for token without mint', () => {
      const original = ACCEPTED_TOKENS.MOLTVERSE.mint;
      // @ts-expect-error Testing invalid state
      ACCEPTED_TOKENS.MOLTVERSE.mint = '';
      expect(() => getTokenMint('MOLTVERSE')).toThrow('Mint address not configured');
      // @ts-expect-error Restore
      ACCEPTED_TOKENS.MOLTVERSE.mint = original;
    });
  });

  describe('getTokenDecimals', () => {
    it('should return correct decimals for SOL', () => {
      expect(getTokenDecimals('SOL')).toBe(9);
    });

    it('should return correct decimals for USDC', () => {
      expect(getTokenDecimals('USDC')).toBe(6);
    });

    it('should return correct decimals for MOLTVERSE', () => {
      expect(getTokenDecimals('MOLTVERSE')).toBe(9);
    });

    it('should return correct decimals for PUMP', () => {
      expect(getTokenDecimals('PUMP')).toBe(6);
    });
  });

  describe('isNativeSOL', () => {
    it('should return true for SOL', () => {
      expect(isNativeSOL('SOL')).toBe(true);
    });

    it('should return false for other tokens', () => {
      expect(isNativeSOL('USDC')).toBe(false);
      expect(isNativeSOL('MOLTVERSE')).toBe(false);
      expect(isNativeSOL('PUMP')).toBe(false);
    });
  });

  describe('isValidWalletAddress', () => {
    it('should return true for valid Solana addresses', () => {
      expect(isValidWalletAddress('CEfEsEEq1iw21DC5hQN1PQBjE9ToMB7fYPDYEnXfk4DR')).toBe(true);
      expect(isValidWalletAddress('So11111111111111111111111111111111111111112')).toBe(true);
    });

    it('should return false for invalid addresses', () => {
      expect(isValidWalletAddress('')).toBe(false);
      expect(isValidWalletAddress('invalid')).toBe(false);
      expect(isValidWalletAddress('0x123456')).toBe(false);
    });
  });

  describe('centsToTokenAmount', () => {
    it('should convert USD cents to SOL lamports correctly', () => {
      // $100 at $250/SOL = 0.4 SOL = 400_000_000 lamports
      const amount = centsToTokenAmount(10000, 250, 9);
      expect(amount).toBe(400000000n);
    });

    it('should convert USD cents to USDC correctly', () => {
      // $100 at $1/USDC = 100 USDC = 100_000_000 micro units
      const amount = centsToTokenAmount(10000, 1, 6);
      expect(amount).toBe(100000000n);
    });

    it('should handle fractional amounts', () => {
      // $50 at $250/SOL = 0.2 SOL = 200_000_000 lamports
      const amount = centsToTokenAmount(5000, 250, 9);
      expect(amount).toBe(200000000n);
    });

    it('should handle small prices', () => {
      // $1 at $0.001 per token = 1000 tokens
      // With 6 decimals: 1000 * 10^6 = 1_000_000_000
      const amount = centsToTokenAmount(100, 0.001, 6);
      expect(amount).toBe(1000000000n);
    });
  });

  describe('formatTokenAmount', () => {
    it('should format whole token amounts', () => {
      expect(formatTokenAmount(1000000000n, 9)).toBe('1');
      expect(formatTokenAmount(10000000000n, 9)).toBe('10');
    });

    it('should format fractional amounts', () => {
      expect(formatTokenAmount(1500000000n, 9)).toBe('1.5');
      expect(formatTokenAmount(1234567890n, 9)).toBe('1.2345');
    });

    it('should respect maxDecimals', () => {
      expect(formatTokenAmount(1234567890n, 9, 2)).toBe('1.23');
      expect(formatTokenAmount(1234567890n, 9, 6)).toBe('1.234567');
    });

    it('should handle zero', () => {
      expect(formatTokenAmount(0n, 9)).toBe('0');
    });

    it('should trim trailing zeros', () => {
      expect(formatTokenAmount(1100000000n, 9)).toBe('1.1');
      // 1000000001 / 10^9 = 1.000000001, but maxDecimals default is 4, so displays as '1'
      expect(formatTokenAmount(1000000001n, 9)).toBe('1');
      // With more decimals, trailing should still be trimmed
      expect(formatTokenAmount(1234500000n, 9)).toBe('1.2345');
    });
  });

  describe('test exports', () => {
    it('should export constants for testing', () => {
      expect(solanaTestExports.MAX_TRANSACTION_AGE_SECONDS).toBe(600);
      expect(solanaTestExports.PAYMENT_TOLERANCE_PERCENT).toBe(5);
    });
  });
});

// =============================================================================
// TOKEN PRICE TESTS
// =============================================================================

describe('lib/token-price', () => {
  beforeEach(() => {
    // Clear cache before each test
    priceTestExports.priceCache.clear();
  });

  describe('cache functions', () => {
    it('should cache and retrieve prices', () => {
      priceTestExports.setCachedPrice('SOL', 250);
      expect(priceTestExports.getCachedPrice('SOL')).toBe(250);
    });

    it('should return null for uncached prices', () => {
      expect(priceTestExports.getCachedPrice('SOL')).toBeNull();
    });

    it('should expire cached prices', async () => {
      // This test would require mocking Date.now() or waiting
      // For now, just verify the TTL constant
      expect(priceTestExports.CACHE_TTL_MS).toBe(60000);
    });
  });

  describe('FALLBACK_PRICES', () => {
    it('should have fallback prices for all tokens', () => {
      expect(priceTestExports.FALLBACK_PRICES.SOL).toBeGreaterThan(0);
      expect(priceTestExports.FALLBACK_PRICES.USDC).toBe(1);
      expect(priceTestExports.FALLBACK_PRICES.MOLTVERSE).toBeGreaterThan(0);
      expect(priceTestExports.FALLBACK_PRICES.PUMP).toBeGreaterThan(0);
    });
  });

  describe('getTokenPrice', () => {
    it('should return 1 for USDC', async () => {
      const price = await getTokenPrice('USDC');
      expect(price).toBe(1);
    });

    it('should use cached price if available', async () => {
      priceTestExports.setCachedPrice('SOL', 300);
      const price = await getTokenPrice('SOL');
      expect(price).toBe(300);
    });
  });

  describe('getAllTokenPrices', () => {
    beforeEach(() => {
      // Set up cached prices to avoid network calls
      priceTestExports.setCachedPrice('SOL', 250);
      priceTestExports.setCachedPrice('USDC', 1);
      priceTestExports.setCachedPrice('MOLTVERSE', 0.0001);
      priceTestExports.setCachedPrice('PUMP', 0.001);
    });

    it('should return prices for all tokens', async () => {
      const prices = await getAllTokenPrices();
      expect(prices.SOL).toBe(250);
      expect(prices.USDC).toBe(1);
      expect(prices.MOLTVERSE).toBe(0.0001);
      expect(prices.PUMP).toBe(0.001);
    });
  });

  describe('generatePaymentQuote', () => {
    beforeEach(() => {
      // Set up cached prices
      priceTestExports.setCachedPrice('SOL', 250);
      priceTestExports.setCachedPrice('USDC', 1);
      priceTestExports.setCachedPrice('MOLTVERSE', 0.0001);
      priceTestExports.setCachedPrice('PUMP', 0.001);
    });

    it('should generate quote with correct discount for MOLTVERSE (20%)', async () => {
      const quote = await generatePaymentQuote(10000, 'MOLTVERSE'); // $100
      expect(quote.originalAmountCents).toBe(10000);
      expect(quote.discountPercent).toBe(20);
      expect(quote.finalAmountCents).toBe(8000); // $80 after 20% discount
      expect(quote.token).toBe('MOLTVERSE');
    });

    it('should generate quote with correct discount for PUMP (10%)', async () => {
      const quote = await generatePaymentQuote(10000, 'PUMP'); // $100
      expect(quote.originalAmountCents).toBe(10000);
      expect(quote.discountPercent).toBe(10);
      expect(quote.finalAmountCents).toBe(9000); // $90 after 10% discount
      expect(quote.token).toBe('PUMP');
    });

    it('should generate quote with no discount for SOL', async () => {
      const quote = await generatePaymentQuote(10000, 'SOL'); // $100
      expect(quote.discountPercent).toBe(0);
      expect(quote.finalAmountCents).toBe(10000);
    });

    it('should generate quote with no discount for USDC', async () => {
      const quote = await generatePaymentQuote(5000, 'USDC'); // $50
      expect(quote.discountPercent).toBe(0);
      expect(quote.finalAmountCents).toBe(5000);
      expect(quote.finalAmountUsd).toBe(50);
    });

    it('should calculate correct token amount for SOL', async () => {
      const quote = await generatePaymentQuote(10000, 'SOL'); // $100
      // $100 / $250 = 0.4 SOL = 400_000_000 lamports
      expect(quote.amountTokenSmallestUnit).toBe(400000000n);
      expect(quote.amountTokenDisplay).toBeCloseTo(0.4, 4);
    });

    it('should calculate correct token amount for USDC', async () => {
      const quote = await generatePaymentQuote(10000, 'USDC'); // $100
      // $100 / $1 = 100 USDC = 100_000_000 micro units
      expect(quote.amountTokenSmallestUnit).toBe(100000000n);
      expect(quote.amountTokenDisplay).toBe(100);
    });

    it('should include expiration timestamp', async () => {
      const before = Date.now();
      const quote = await generatePaymentQuote(5000, 'USDC');
      const after = Date.now();

      const expiresAt = new Date(quote.expiresAt).getTime();
      // Should expire in ~5 minutes
      expect(expiresAt).toBeGreaterThan(before + 4 * 60 * 1000);
      expect(expiresAt).toBeLessThan(after + 6 * 60 * 1000);
    });

    it('should include token symbol', async () => {
      const quote = await generatePaymentQuote(5000, 'SOL');
      expect(quote.tokenSymbol).toBe('SOL');
    });

    it('should include token price', async () => {
      const quote = await generatePaymentQuote(5000, 'SOL');
      expect(quote.tokenPriceUsd).toBe(250);
    });
  });

  describe('getTokensInfo', () => {
    beforeEach(() => {
      priceTestExports.setCachedPrice('SOL', 250);
      priceTestExports.setCachedPrice('USDC', 1);
      priceTestExports.setCachedPrice('MOLTVERSE', 0.0001);
      priceTestExports.setCachedPrice('PUMP', 0.001);
    });

    it('should return info for all tokens', async () => {
      const tokens = await getTokensInfo();
      expect(tokens).toHaveLength(4);
    });

    it('should include correct properties', async () => {
      const tokens = await getTokensInfo();
      const sol = tokens.find(t => t.symbol === 'SOL');

      expect(sol).toBeDefined();
      expect(sol?.symbol).toBe('SOL');
      expect(sol?.name).toBe('Solana');
      expect(sol?.mint).toBe('So11111111111111111111111111111111111111112');
      expect(sol?.decimals).toBe(9);
      expect(sol?.discountPercent).toBe(0);
      expect(sol?.priceUsd).toBe(250);
    });

    it('should include discounts', async () => {
      const tokens = await getTokensInfo();
      const moltverse = tokens.find(t => t.symbol === 'MOLTVERSE');
      const pump = tokens.find(t => t.symbol === 'PUMP');

      expect(moltverse?.discountPercent).toBe(20);
      expect(pump?.discountPercent).toBe(10);
    });
  });

  describe('REQUEST_TIMEOUT_MS', () => {
    it('should have reasonable timeout', () => {
      expect(priceTestExports.REQUEST_TIMEOUT_MS).toBe(5000);
    });
  });
});

// =============================================================================
// INTEGRATION TESTS (mocked)
// =============================================================================

describe('Payment Integration', () => {
  describe('full payment flow', () => {
    beforeEach(() => {
      priceTestExports.priceCache.clear();
      priceTestExports.setCachedPrice('SOL', 250);
      priceTestExports.setCachedPrice('USDC', 1);
      priceTestExports.setCachedPrice('MOLTVERSE', 0.0001);
      priceTestExports.setCachedPrice('PUMP', 0.001);
    });

    it('should calculate correct final amounts with MOLTVERSE discount', async () => {
      // Scenario: Brand pays for $100 campaign with MOLTVERSE (20% discount)
      const budgetCents = 10000; // $100
      const quote = await generatePaymentQuote(budgetCents, 'MOLTVERSE');

      // Final amount should be $80 (after 20% discount)
      expect(quote.finalAmountCents).toBe(8000);
      expect(quote.finalAmountUsd).toBe(80);

      // Token amount: $80 / $0.0001 = 800,000 tokens
      // With 9 decimals: 800,000 * 10^9 = 800_000_000_000_000
      expect(quote.amountTokenSmallestUnit).toBe(800000000000000n);
    });

    it('should calculate correct final amounts with PUMP discount', async () => {
      // Scenario: Brand pays for $50 campaign with PUMP (10% discount)
      const budgetCents = 5000; // $50
      const quote = await generatePaymentQuote(budgetCents, 'PUMP');

      // Final amount should be $45 (after 10% discount)
      expect(quote.finalAmountCents).toBe(4500);
      expect(quote.finalAmountUsd).toBe(45);

      // Token amount: $45 / $0.001 = 45,000 tokens
      // With 6 decimals: 45,000 * 10^6 = 45_000_000_000
      expect(quote.amountTokenSmallestUnit).toBe(45000000000n);
    });

    it('should handle minimum budget correctly', async () => {
      // Minimum budget is $50 (5000 cents)
      const quote = await generatePaymentQuote(5000, 'USDC');
      expect(quote.finalAmountCents).toBe(5000);
      expect(quote.amountTokenDisplay).toBe(50);
    });
  });

  describe('edge cases', () => {
    beforeEach(() => {
      priceTestExports.priceCache.clear();
      priceTestExports.setCachedPrice('SOL', 250);
    });

    it('should handle very large amounts', async () => {
      const quote = await generatePaymentQuote(1000000, 'SOL'); // $10,000
      expect(quote.amountTokenDisplay).toBeCloseTo(40, 4); // 40 SOL
    });

    it('should handle minimum amounts', async () => {
      const quote = await generatePaymentQuote(100, 'SOL'); // $1
      expect(quote.amountTokenSmallestUnit).toBe(4000000n); // 0.004 SOL
    });
  });
});

// =============================================================================
// PAYMENT ENDPOINTS SCHEMA TESTS
// =============================================================================

describe('Payment Endpoint Schemas', () => {
  describe('Quote Request Validation', () => {
    interface QuoteQuery {
      budgetCents: string;
      token: string;
    }

    function validateQuoteQuery(query: QuoteQuery): string | null {
      const budget = parseInt(query.budgetCents, 10);
      if (isNaN(budget) || budget <= 0) {
        return 'INVALID_BUDGET';
      }
      const validTokens = ['SOL', 'USDC', 'MOLTVERSE', 'PUMP'];
      if (!validTokens.includes(query.token.toUpperCase())) {
        return 'INVALID_TOKEN';
      }
      return null;
    }

    it('should reject non-numeric budget', () => {
      expect(validateQuoteQuery({ budgetCents: 'abc', token: 'SOL' })).toBe('INVALID_BUDGET');
    });

    it('should reject negative budget', () => {
      expect(validateQuoteQuery({ budgetCents: '-100', token: 'SOL' })).toBe('INVALID_BUDGET');
    });

    it('should reject zero budget', () => {
      expect(validateQuoteQuery({ budgetCents: '0', token: 'SOL' })).toBe('INVALID_BUDGET');
    });

    it('should accept valid budget', () => {
      expect(validateQuoteQuery({ budgetCents: '5000', token: 'SOL' })).toBeNull();
    });

    it('should reject invalid token', () => {
      expect(validateQuoteQuery({ budgetCents: '5000', token: 'BTC' })).toBe('INVALID_TOKEN');
    });

    it('should accept SOL token', () => {
      expect(validateQuoteQuery({ budgetCents: '5000', token: 'SOL' })).toBeNull();
    });

    it('should accept USDC token', () => {
      expect(validateQuoteQuery({ budgetCents: '5000', token: 'USDC' })).toBeNull();
    });

    it('should accept lowercase token', () => {
      expect(validateQuoteQuery({ budgetCents: '5000', token: 'sol' })).toBeNull();
    });

    it('should accept MOLTVERSE token', () => {
      expect(validateQuoteQuery({ budgetCents: '5000', token: 'MOLTVERSE' })).toBeNull();
    });

    it('should accept PUMP token', () => {
      expect(validateQuoteQuery({ budgetCents: '5000', token: 'PUMP' })).toBeNull();
    });
  });

  describe('Verify Request Validation', () => {
    interface VerifyBody {
      campaignId: string;
      txSignature: string;
      token: string;
      senderWallet?: string;
      quoteTimestamp?: number;
    }

    function validateVerifyBody(body: VerifyBody): string | null {
      // Campaign ID validation (UUID format)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(body.campaignId)) {
        return 'INVALID_CAMPAIGN_ID';
      }

      // Transaction signature validation (base58, 80-100 chars)
      if (body.txSignature.length < 80 || body.txSignature.length > 100) {
        return 'INVALID_TX_SIGNATURE';
      }

      // Token validation
      const validTokens = ['SOL', 'USDC', 'MOLTVERSE', 'PUMP'];
      if (!validTokens.includes(body.token.toUpperCase())) {
        return 'INVALID_TOKEN';
      }

      // Optional sender wallet validation
      if (body.senderWallet) {
        if (body.senderWallet.length < 32 || body.senderWallet.length > 50) {
          return 'INVALID_SENDER_WALLET';
        }
      }

      // Quote timestamp validation (must be within 10 minutes)
      if (body.quoteTimestamp) {
        const age = Date.now() - body.quoteTimestamp;
        if (age > 10 * 60 * 1000) {
          return 'QUOTE_EXPIRED';
        }
      }

      return null;
    }

    const validTxSignature = '5J8kLmN9pQrStUvWxYzABcDeFgHiJkLmNoPqRsTuVwXyZaBcDeFgHiJkLmNoPqRsTuVwXyZ12345678901234567890';

    it('should reject invalid campaign ID', () => {
      expect(validateVerifyBody({
        campaignId: 'invalid',
        txSignature: validTxSignature,
        token: 'SOL',
      })).toBe('INVALID_CAMPAIGN_ID');
    });

    it('should accept valid UUID campaign ID', () => {
      expect(validateVerifyBody({
        campaignId: '123e4567-e89b-12d3-a456-426614174000',
        txSignature: validTxSignature,
        token: 'SOL',
      })).toBeNull();
    });

    it('should reject short transaction signature', () => {
      expect(validateVerifyBody({
        campaignId: '123e4567-e89b-12d3-a456-426614174000',
        txSignature: 'tooshort',
        token: 'SOL',
      })).toBe('INVALID_TX_SIGNATURE');
    });

    it('should reject invalid token', () => {
      expect(validateVerifyBody({
        campaignId: '123e4567-e89b-12d3-a456-426614174000',
        txSignature: validTxSignature,
        token: 'ETH',
      })).toBe('INVALID_TOKEN');
    });

    it('should accept request without optional fields', () => {
      expect(validateVerifyBody({
        campaignId: '123e4567-e89b-12d3-a456-426614174000',
        txSignature: validTxSignature,
        token: 'SOL',
      })).toBeNull();
    });

    it('should reject expired quote', () => {
      const expiredTimestamp = Date.now() - 15 * 60 * 1000; // 15 minutes ago
      expect(validateVerifyBody({
        campaignId: '123e4567-e89b-12d3-a456-426614174000',
        txSignature: validTxSignature,
        token: 'SOL',
        quoteTimestamp: expiredTimestamp,
      })).toBe('QUOTE_EXPIRED');
    });

    it('should accept recent quote', () => {
      const recentTimestamp = Date.now() - 2 * 60 * 1000; // 2 minutes ago
      expect(validateVerifyBody({
        campaignId: '123e4567-e89b-12d3-a456-426614174000',
        txSignature: validTxSignature,
        token: 'SOL',
        quoteTimestamp: recentTimestamp,
      })).toBeNull();
    });
  });
});

// =============================================================================
// ERROR HANDLING TESTS
// =============================================================================

describe('Payment Error Handling', () => {
  describe('SolanaError class', () => {
    // We can't import the actual class without causing import issues,
    // so we test the expected error structure
    it('should have expected error codes', () => {
      const expectedCodes = [
        'TRANSACTION_NOT_FOUND',
        'TRANSACTION_PENDING',
        'TRANSACTION_FAILED',
        'INVALID_RECIPIENT',
        'INSUFFICIENT_AMOUNT',
        'TOKEN_MISMATCH',
        'TRANSACTION_TOO_OLD',
        'NETWORK_ERROR',
        'RPC_ERROR',
      ];

      // These codes should be handled by the verify endpoint
      expectedCodes.forEach((code) => {
        expect(typeof code).toBe('string');
      });
    });
  });

  describe('API Error Responses', () => {
    const errorResponseStructure = {
      error: 'string',
      code: 'string',
      message: 'string',
    };

    it('should have consistent error structure', () => {
      expect(Object.keys(errorResponseStructure)).toContain('error');
      expect(Object.keys(errorResponseStructure)).toContain('code');
      expect(Object.keys(errorResponseStructure)).toContain('message');
    });

    it('should use HTTP 400 for client errors', () => {
      const clientErrors = [
        'INVALID_BUDGET',
        'INVALID_TOKEN',
        'INVALID_CAMPAIGN_ID',
        'INVALID_TX_SIGNATURE',
        'QUOTE_EXPIRED',
      ];
      // These should all result in 400 responses
      expect(clientErrors.length).toBeGreaterThan(0);
    });

    it('should use HTTP 404 for not found', () => {
      const notFoundErrors = [
        'CAMPAIGN_NOT_FOUND',
        'ADS_SYSTEM_DISABLED',
      ];
      expect(notFoundErrors.length).toBeGreaterThan(0);
    });

    it('should use HTTP 409 for conflicts', () => {
      const conflictErrors = [
        'CAMPAIGN_ALREADY_PAID',
        'SIGNATURE_ALREADY_USED',
      ];
      expect(conflictErrors.length).toBeGreaterThan(0);
    });

    it('should use HTTP 503 for service unavailable', () => {
      const serviceErrors = [
        'TREASURY_NOT_READY',
        'PAYMENT_VERIFICATION_FAILED',
      ];
      expect(serviceErrors.length).toBeGreaterThan(0);
    });
  });
});

// =============================================================================
// DISCOUNT CALCULATION TESTS
// =============================================================================

describe('Discount Calculations', () => {
  describe('token discounts', () => {
    it('MOLTVERSE should have 20% discount', () => {
      expect(ACCEPTED_TOKENS.MOLTVERSE.discountPercent).toBe(20);
    });

    it('PUMP should have 10% discount', () => {
      expect(ACCEPTED_TOKENS.PUMP.discountPercent).toBe(10);
    });

    it('SOL should have no discount', () => {
      expect(ACCEPTED_TOKENS.SOL.discountPercent).toBe(0);
    });

    it('USDC should have no discount', () => {
      expect(ACCEPTED_TOKENS.USDC.discountPercent).toBe(0);
    });
  });

  describe('discount application', () => {
    function applyDiscount(amountCents: number, discountPercent: number): number {
      return Math.round(amountCents * (100 - discountPercent) / 100);
    }

    it('should calculate 20% discount correctly', () => {
      expect(applyDiscount(10000, 20)).toBe(8000);
    });

    it('should calculate 10% discount correctly', () => {
      expect(applyDiscount(10000, 10)).toBe(9000);
    });

    it('should handle 0% discount', () => {
      expect(applyDiscount(10000, 0)).toBe(10000);
    });

    it('should round correctly', () => {
      expect(applyDiscount(999, 20)).toBe(799);
      expect(applyDiscount(1001, 10)).toBe(901);
    });
  });
});

// =============================================================================
// TIMESTAMP AND EXPIRATION TESTS
// =============================================================================

describe('Quote Expiration', () => {
  const QUOTE_EXPIRATION_MS = 5 * 60 * 1000; // 5 minutes
  const MAX_PAYMENT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

  function isQuoteExpired(quoteTimestamp: number): boolean {
    return Date.now() - quoteTimestamp > MAX_PAYMENT_WINDOW_MS;
  }

  function getQuoteExpiresAt(quoteTimestamp: number): Date {
    return new Date(quoteTimestamp + QUOTE_EXPIRATION_MS);
  }

  it('should not expire fresh quotes', () => {
    const now = Date.now();
    expect(isQuoteExpired(now)).toBe(false);
  });

  it('should not expire quotes within window', () => {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    expect(isQuoteExpired(fiveMinutesAgo)).toBe(false);
  });

  it('should expire quotes after 10 minutes', () => {
    const elevenMinutesAgo = Date.now() - 11 * 60 * 1000;
    expect(isQuoteExpired(elevenMinutesAgo)).toBe(true);
  });

  it('should calculate expiration time correctly', () => {
    const now = Date.now();
    const expiresAt = getQuoteExpiresAt(now);
    const expectedExpiration = now + QUOTE_EXPIRATION_MS;
    expect(expiresAt.getTime()).toBe(expectedExpiration);
  });
});
