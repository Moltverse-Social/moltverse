/**
 * Token Price Service
 *
 * Fetches real-time prices for payment tokens from multiple sources.
 * Uses Jupiter API as primary source with DexScreener and Binance as fallbacks.
 *
 * Based on Sentinel platform implementation.
 *
 * @module lib/token-price
 */

import { ACCEPTED_TOKENS, AcceptedToken, calculateDiscountedAmount, getTokenDiscount } from './ads-constants.js';
import { getTokenDecimals, centsToTokenAmount } from './solana.js';

// =============================================================================
// CONSTANTS
// =============================================================================

/** Cache TTL in milliseconds (60 seconds) */
const CACHE_TTL_MS = 60_000;

/** Request timeout in milliseconds (5 seconds) */
const REQUEST_TIMEOUT_MS = 5_000;

/** Fallback prices if all APIs fail (USD) */
const FALLBACK_PRICES: Record<AcceptedToken, number> = {
  SOL: 250,
  USDC: 1,
  MOLTVERSE: 0.0001,
  PUMP: 0.001,
};

// =============================================================================
// CACHE
// =============================================================================

interface CacheEntry {
  price: number;
  timestamp: number;
}

const priceCache = new Map<AcceptedToken, CacheEntry>();

/**
 * Get cached price if still valid.
 */
function getCachedPrice(token: AcceptedToken): number | null {
  const entry = priceCache.get(token);
  if (!entry) return null;

  const age = Date.now() - entry.timestamp;
  if (age > CACHE_TTL_MS) {
    priceCache.delete(token);
    return null;
  }

  return entry.price;
}

/**
 * Set cached price.
 */
function setCachedPrice(token: AcceptedToken, price: number): void {
  priceCache.set(token, { price, timestamp: Date.now() });
}

// =============================================================================
// API FETCHERS
// =============================================================================

/**
 * Fetch with timeout.
 */
async function fetchWithTimeout(url: string, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetch price from Jupiter API.
 * Primary source for all Solana tokens.
 */
async function fetchJupiterPrice(mintAddress: string): Promise<number | null> {
  try {
    const url = `https://price.jup.ag/v6/price?ids=${mintAddress}`;
    const response = await fetchWithTimeout(url);

    if (!response.ok) return null;

    const data = await response.json();
    const tokenData = data.data?.[mintAddress];

    if (tokenData?.price && typeof tokenData.price === 'number') {
      return tokenData.price;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch price from DexScreener API.
 * Fallback for less common tokens.
 */
async function fetchDexScreenerPrice(mintAddress: string): Promise<number | null> {
  try {
    const url = `https://api.dexscreener.com/latest/dex/tokens/${mintAddress}`;
    const response = await fetchWithTimeout(url);

    if (!response.ok) return null;

    const data = await response.json();
    const pairs = data.pairs;

    if (!pairs || pairs.length === 0) return null;

    // Get price from the pair with highest liquidity
    const sortedPairs = pairs.sort(
      (a: { liquidity?: { usd?: number } }, b: { liquidity?: { usd?: number } }) =>
        (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0)
    );

    const price = parseFloat(sortedPairs[0].priceUsd);
    return isNaN(price) ? null : price;
  } catch {
    return null;
  }
}

/**
 * Fetch SOL price from Binance.
 * Alternative source for SOL.
 */
async function fetchBinanceSOLPrice(): Promise<number | null> {
  try {
    const url = 'https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT';
    const response = await fetchWithTimeout(url);

    if (!response.ok) return null;

    const data = await response.json();
    const price = parseFloat(data.price);

    return isNaN(price) ? null : price;
  } catch {
    return null;
  }
}

// =============================================================================
// PRICE FETCHING
// =============================================================================

/**
 * Get the current USD price for a token.
 * Uses cache and multiple API sources with fallback.
 */
export async function getTokenPrice(token: AcceptedToken): Promise<number> {
  // Check cache first
  const cached = getCachedPrice(token);
  if (cached !== null) {
    return cached;
  }

  // USDC is always $1
  if (token === 'USDC') {
    setCachedPrice(token, 1);
    return 1;
  }

  const tokenConfig = ACCEPTED_TOKENS[token];
  const mintAddress = tokenConfig.mint;

  // Try multiple sources in parallel
  const fetchPromises: Promise<number | null>[] = [];

  // Jupiter as primary
  if (mintAddress) {
    fetchPromises.push(fetchJupiterPrice(mintAddress));
  }

  // Additional sources for SOL
  if (token === 'SOL') {
    fetchPromises.push(fetchBinanceSOLPrice());
  }

  // DexScreener as fallback for non-SOL tokens (USDC already returned above)
  if (mintAddress && token !== 'SOL') {
    fetchPromises.push(fetchDexScreenerPrice(mintAddress));
  }

  // Wait for all with a timeout
  const results = await Promise.all(fetchPromises);

  // Use the first valid result
  for (const result of results) {
    if (result !== null && result > 0) {
      setCachedPrice(token, result);
      return result;
    }
  }

  // Fall back to hardcoded price
  const fallback = FALLBACK_PRICES[token];
  setCachedPrice(token, fallback);
  return fallback;
}

/**
 * Get prices for all supported tokens.
 */
export async function getAllTokenPrices(): Promise<Record<AcceptedToken, number>> {
  const tokens: AcceptedToken[] = ['SOL', 'USDC', 'MOLTVERSE', 'PUMP'];

  const prices = await Promise.all(tokens.map(async (token) => {
    const price = await getTokenPrice(token);
    return [token, price] as const;
  }));

  return Object.fromEntries(prices) as Record<AcceptedToken, number>;
}

// =============================================================================
// QUOTE GENERATION
// =============================================================================

/**
 * Payment quote with discount applied.
 */
export interface PaymentQuote {
  /** Original amount in USD cents */
  originalAmountCents: number;
  /** Discount percentage (0-100) */
  discountPercent: number;
  /** Final amount after discount in USD cents */
  finalAmountCents: number;
  /** Final amount in USD */
  finalAmountUsd: number;
  /** Token to pay with */
  token: AcceptedToken;
  /** Token symbol for display */
  tokenSymbol: string;
  /** Current token price in USD */
  tokenPriceUsd: number;
  /** Amount to pay in token's smallest unit */
  amountTokenSmallestUnit: bigint;
  /** Amount to pay in whole tokens (for display) */
  amountTokenDisplay: number;
  /** Quote expiration (ISO string) */
  expiresAt: string;
}

/**
 * Generate a payment quote for a campaign budget.
 *
 * @param budgetCents - Campaign budget in USD cents
 * @param token - Payment token
 * @returns Payment quote with discount applied
 */
export async function generatePaymentQuote(
  budgetCents: number,
  token: AcceptedToken
): Promise<PaymentQuote> {
  const tokenPrice = await getTokenPrice(token);
  const discountPercent = getTokenDiscount(token);
  const finalAmountCents = calculateDiscountedAmount(budgetCents, token);
  const decimals = getTokenDecimals(token);

  const amountTokenSmallestUnit = centsToTokenAmount(finalAmountCents, tokenPrice, decimals);
  const amountTokenDisplay = Number(amountTokenSmallestUnit) / Math.pow(10, decimals);

  // Quote expires in 5 minutes
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  return {
    originalAmountCents: budgetCents,
    discountPercent,
    finalAmountCents,
    finalAmountUsd: finalAmountCents / 100,
    token,
    tokenSymbol: ACCEPTED_TOKENS[token].symbol,
    tokenPriceUsd: tokenPrice,
    amountTokenSmallestUnit,
    amountTokenDisplay,
    expiresAt,
  };
}

// =============================================================================
// TOKEN INFO
// =============================================================================

/**
 * Information about a supported token.
 */
export interface TokenInfo {
  symbol: string;
  name: string;
  mint: string;
  decimals: number;
  discountPercent: number;
  priceUsd: number;
}

/**
 * Get information about all supported tokens.
 */
export async function getTokensInfo(): Promise<TokenInfo[]> {
  const prices = await getAllTokenPrices();

  return Object.entries(ACCEPTED_TOKENS).map(([key, config]) => ({
    symbol: config.symbol,
    name: config.name,
    mint: config.mint,
    decimals: config.decimals,
    discountPercent: config.discountPercent,
    priceUsd: prices[key as AcceptedToken],
  }));
}

// =============================================================================
// EXPORTS FOR TESTING
// =============================================================================

export const __testExports = {
  CACHE_TTL_MS,
  REQUEST_TIMEOUT_MS,
  FALLBACK_PRICES,
  priceCache,
  getCachedPrice,
  setCachedPrice,
  fetchJupiterPrice,
  fetchDexScreenerPrice,
  fetchBinanceSOLPrice,
};
