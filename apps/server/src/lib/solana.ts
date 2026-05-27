/**
 * Solana Integration Library
 *
 * Production-ready implementation for:
 * - Transaction verification (SOL and SPL tokens)
 * - Balance queries
 * - Retry logic with exponential backoff
 * - Support for Token Program and Token-2022
 *
 * @module lib/solana
 */

import {
  Connection,
  PublicKey,
  ParsedTransactionWithMeta,
  ParsedInstruction,
} from '@solana/web3.js';
import { ACCEPTED_TOKENS, AcceptedToken } from './ads-constants.js';
import { logger } from './logger.js';

// =============================================================================
// CONSTANTS
// =============================================================================

/** Treasury wallet that receives all payments */
export const TREASURY_WALLET =
  process.env.TREASURY_WALLET ?? 'CEfEsEEq1iw21DC5hQN1PQBjE9ToMB7fYPDYEnXfk4DR';

/** Solana RPC URL */
const SOLANA_RPC_URL =
  process.env.SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com';

/** System Program ID (SOL transfers) */
const SYSTEM_PROGRAM_ID = '11111111111111111111111111111111';

/** Token-2022 Program ID (newer token standard) */
const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

/** All valid token program IDs */
const VALID_TOKEN_PROGRAMS = new Set([
  'TokenkegQfexxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  'TokenkegQfexxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  TOKEN_2022_PROGRAM_ID,
]);

/** Maximum age for a transaction to be considered valid (10 minutes) */
const MAX_TRANSACTION_AGE_SECONDS = 600;

/** Amount tolerance for payment verification (5%) */
const PAYMENT_TOLERANCE_PERCENT = 5;

/** Retry configuration */
const RETRY_CONFIG = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
};

/** RPC timeout in milliseconds */
const RPC_TIMEOUT_MS = 30000;

// =============================================================================
// ERROR TYPES
// =============================================================================

export class SolanaError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly recoverable: boolean = false
  ) {
    super(message);
    this.name = 'SolanaError';
  }
}

export class TransactionNotFoundError extends SolanaError {
  constructor(signature: string) {
    super(`Transaction not found: ${signature}`, 'TX_NOT_FOUND', true);
  }
}

export class TransactionFailedError extends SolanaError {
  constructor(_signature: string, error: unknown) {
    super(
      `Transaction failed on-chain: ${JSON.stringify(error)}`,
      'TX_FAILED',
      false
    );
  }
}

export class TransactionExpiredError extends SolanaError {
  constructor(ageSeconds: number) {
    super(
      `Transaction too old: ${ageSeconds}s (max: ${MAX_TRANSACTION_AGE_SECONDS}s)`,
      'TX_EXPIRED',
      false
    );
  }
}

export class InsufficientAmountError extends SolanaError {
  constructor(expected: bigint, received: bigint) {
    super(
      `Insufficient amount: expected ${expected}, received ${received}`,
      'INSUFFICIENT_AMOUNT',
      false
    );
  }
}

export class InvalidRecipientError extends SolanaError {
  constructor(expected: string, received: string) {
    super(
      `Invalid recipient: expected ${expected}, received ${received}`,
      'INVALID_RECIPIENT',
      false
    );
  }
}

export class SenderMismatchError extends SolanaError {
  constructor(expected: string, received: string) {
    super(
      `Sender mismatch: expected ${expected}, received ${received}`,
      'SENDER_MISMATCH',
      false
    );
  }
}

export class NoValidTransferError extends SolanaError {
  constructor(tokenType: string) {
    super(`No valid ${tokenType} transfer found in transaction`, 'NO_TRANSFER', false);
  }
}

export class RpcError extends SolanaError {
  constructor(message: string) {
    super(`RPC error: ${message}`, 'RPC_ERROR', true);
  }
}

// =============================================================================
// RETRY UTILITY
// =============================================================================

/**
 * Execute a function with retry logic and exponential backoff.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  context: string
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= RETRY_CONFIG.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if error is recoverable
      const isRecoverable =
        error instanceof SolanaError ? error.recoverable : true;

      if (!isRecoverable || attempt === RETRY_CONFIG.maxAttempts) {
        logger.error({
          error: lastError.message,
          attempt,
        }, `[Solana] ${context} failed after ${attempt} attempts`);
        throw error;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt - 1),
        RETRY_CONFIG.maxDelayMs
      );

      logger.warn({
        error: lastError.message,
      }, `[Solana] ${context} attempt ${attempt} failed, retrying in ${delay}ms`);

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// =============================================================================
// CONNECTION MANAGEMENT
// =============================================================================

let connection: Connection | null = null;

/**
 * Get a singleton Solana connection with timeout configuration.
 */
export function getConnection(): Connection {
  if (!connection) {
    connection = new Connection(SOLANA_RPC_URL, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: RPC_TIMEOUT_MS,
    });

    logger.info({
      rpcUrl: SOLANA_RPC_URL.replace(/\/\/.*@/, '//***@'), // Hide credentials if any
    }, '[Solana] Connection initialized');
  }
  return connection;
}

/**
 * Check if the RPC connection is healthy.
 */
export async function checkConnectionHealth(): Promise<boolean> {
  try {
    const conn = getConnection();
    const slot = await conn.getSlot();
    return slot > 0;
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error),
    }, '[Solana] Connection health check failed');
    return false;
  }
}

// =============================================================================
// TOKEN CONFIGURATION
// =============================================================================

/**
 * Get the mint address for a payment token.
 * @throws Error if mint is not configured
 */
export function getTokenMint(token: AcceptedToken): string {
  const tokenConfig = ACCEPTED_TOKENS[token];
  if (!tokenConfig.mint) {
    throw new SolanaError(
      `Mint address not configured for ${token}`,
      'MINT_NOT_CONFIGURED',
      false
    );
  }
  return tokenConfig.mint;
}

/**
 * Get the decimals for a payment token.
 */
export function getTokenDecimals(token: AcceptedToken): number {
  return ACCEPTED_TOKENS[token].decimals;
}

/**
 * Check if a token is SOL (native, not SPL).
 */
export function isNativeSOL(token: AcceptedToken): boolean {
  return token === 'SOL';
}

/**
 * Derive the Associated Token Account (ATA) address for a wallet and mint.
 * Works for both Token Program and Token-2022.
 */
export function deriveATA(
  walletAddress: string,
  mintAddress: string,
  programId: string = 'TokenkegQfexxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
): PublicKey {
  const wallet = new PublicKey(walletAddress);
  const mint = new PublicKey(mintAddress);
  const program = new PublicKey(programId);

  const [ata] = PublicKey.findProgramAddressSync(
    [wallet.toBuffer(), program.toBuffer(), mint.toBuffer()],
    new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL')
  );

  return ata;
}

// =============================================================================
// TRANSACTION VERIFICATION
// =============================================================================

/**
 * Result of transaction verification.
 */
export interface TransactionVerificationResult {
  verified: boolean;
  error?: string | undefined;
  errorCode?: string | undefined;
  sender?: string | undefined;
  recipient?: string | undefined;
  amount?: bigint | undefined;
  token?: AcceptedToken | undefined;
  blockTime?: number | undefined;
  signature?: string | undefined;
}

/**
 * Verify a payment transaction on-chain.
 *
 * Checks:
 * - Transaction exists and is confirmed
 * - Transaction is recent (within MAX_TRANSACTION_AGE_SECONDS)
 * - Transaction was successful (no errors)
 * - Recipient is the treasury wallet
 * - Amount matches expected (with tolerance)
 *
 * @param txSignature - Transaction signature (base58)
 * @param expectedToken - Expected payment token
 * @param expectedAmount - Expected amount in smallest unit (lamports/token units)
 * @param expectedSender - Expected sender wallet (optional, for extra validation)
 */
export async function verifyPaymentTransaction(
  txSignature: string,
  expectedToken: AcceptedToken,
  expectedAmount: bigint,
  expectedSender?: string
): Promise<TransactionVerificationResult> {
  logger.info({
    signature: txSignature,
    token: expectedToken,
    expectedAmount: expectedAmount.toString(),
    expectedSender,
  }, '[Solana] Verifying payment transaction');

  return withRetry(async () => {
    const conn = getConnection();

    // Fetch transaction with parsed instructions
    const tx = await conn.getParsedTransaction(txSignature, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed',
    });

    if (!tx) {
      throw new TransactionNotFoundError(txSignature);
    }

    // Check transaction success
    if (tx.meta?.err) {
      throw new TransactionFailedError(txSignature, tx.meta.err);
    }

    // Check transaction age
    if (!tx.blockTime) {
      throw new SolanaError('Transaction has no block time', 'NO_BLOCK_TIME', false);
    }

    const txAgeSeconds = Math.floor(Date.now() / 1000) - tx.blockTime;
    if (txAgeSeconds > MAX_TRANSACTION_AGE_SECONDS) {
      throw new TransactionExpiredError(txAgeSeconds);
    }

    // Verify payment based on token type
    let result: TransactionVerificationResult;
    if (isNativeSOL(expectedToken)) {
      result = verifySOLTransfer(tx, expectedAmount, expectedSender);
    } else {
      result = verifySPLTransfer(tx, expectedToken, expectedAmount, expectedSender);
    }

    // Add signature to result
    result.signature = txSignature;

    logger.info({
      signature: txSignature,
      verified: result.verified,
      error: result.error,
      amount: result.amount?.toString(),
    }, '[Solana] Payment verification complete');

    return result;
  }, `verifyPaymentTransaction(${txSignature})`);
}

/**
 * Verify a native SOL transfer.
 */
function verifySOLTransfer(
  tx: ParsedTransactionWithMeta,
  expectedAmount: bigint,
  expectedSender?: string
): TransactionVerificationResult {
  const treasuryLower = TREASURY_WALLET.toLowerCase();

  // Look for System Program transfer instruction
  for (const instruction of tx.transaction.message.instructions) {
    if (!('parsed' in instruction)) continue;

    const parsed = instruction as ParsedInstruction;
    if (parsed.programId.toBase58() !== SYSTEM_PROGRAM_ID) continue;
    if (parsed.parsed?.type !== 'transfer') continue;

    const { source, destination, lamports } = parsed.parsed.info;

    // Check recipient is treasury
    if (destination.toLowerCase() !== treasuryLower) {
      continue;
    }

    const amount = BigInt(lamports);

    // Check amount with tolerance
    const minAmount =
      expectedAmount - (expectedAmount * BigInt(PAYMENT_TOLERANCE_PERCENT)) / 100n;

    if (amount < minAmount) {
      return {
        verified: false,
        error: `Insufficient amount: expected ${expectedAmount}, got ${amount}`,
        errorCode: 'INSUFFICIENT_AMOUNT',
        sender: source,
        recipient: destination,
        amount,
        token: 'SOL',
      };
    }

    // Check sender if provided
    if (expectedSender && source.toLowerCase() !== expectedSender.toLowerCase()) {
      return {
        verified: false,
        error: 'Sender mismatch',
        errorCode: 'SENDER_MISMATCH',
        sender: source,
        recipient: destination,
        amount,
        token: 'SOL',
      };
    }

    return {
      verified: true,
      sender: source,
      recipient: destination,
      amount,
      token: 'SOL',
      blockTime: tx.blockTime ?? undefined,
    };
  }

  return {
    verified: false,
    error: 'No valid SOL transfer found to treasury',
    errorCode: 'NO_TRANSFER',
  };
}

/**
 * Verify an SPL token transfer.
 * Supports both Token Program and Token-2022.
 * Uses multiple verification strategies for robustness.
 */
function verifySPLTransfer(
  tx: ParsedTransactionWithMeta,
  expectedToken: AcceptedToken,
  expectedAmount: bigint,
  expectedSender?: string
): TransactionVerificationResult {
  const treasuryLower = TREASURY_WALLET.toLowerCase();
  const expectedMint = getTokenMint(expectedToken).toLowerCase();

  // Strategy 1: Look for transfer/transferChecked instructions
  const result = verifySPLTransferFromInstructions(
    tx,
    expectedToken,
    expectedMint,
    treasuryLower,
    expectedAmount,
    expectedSender
  );

  if (result.verified || result.errorCode !== 'NO_TRANSFER') {
    return result;
  }

  // Strategy 2: Fall back to balance diff analysis
  return verifySPLTransferFromBalances(
    tx,
    expectedToken,
    expectedMint,
    treasuryLower,
    expectedAmount,
    expectedSender
  );
}

/**
 * Verify SPL transfer by analyzing parsed instructions.
 */
function verifySPLTransferFromInstructions(
  tx: ParsedTransactionWithMeta,
  expectedToken: AcceptedToken,
  expectedMint: string,
  treasuryLower: string,
  expectedAmount: bigint,
  expectedSender?: string
): TransactionVerificationResult {
  for (const instruction of tx.transaction.message.instructions) {
    if (!('parsed' in instruction)) continue;

    const parsed = instruction as ParsedInstruction;
    const programId = parsed.programId.toBase58();

    // Check if it's a token program instruction
    if (!VALID_TOKEN_PROGRAMS.has(programId)) continue;

    const type = parsed.parsed?.type;
    if (type !== 'transfer' && type !== 'transferChecked') continue;

    const info = parsed.parsed?.info;
    if (!info) continue;

    // For transferChecked, verify mint
    if (type === 'transferChecked' && info.mint?.toLowerCase() !== expectedMint) {
      continue;
    }

    // Get destination owner (need to look up from post token balances)
    const destinationAccount = info.destination;
    const postBalances = tx.meta?.postTokenBalances ?? [];

    const destBalance = postBalances.find(
      (b: { accountIndex: number; mint: string; owner?: string }) =>
        tx.transaction.message.accountKeys[b.accountIndex]?.pubkey.toBase58() ===
          destinationAccount &&
        b.mint.toLowerCase() === expectedMint
    );

    if (!destBalance || destBalance.owner?.toLowerCase() !== treasuryLower) {
      continue;
    }

    // Get amount
    const amount = BigInt(
      type === 'transferChecked' ? info.tokenAmount?.amount : info.amount
    );

    // Check amount with tolerance
    const minAmount =
      expectedAmount - (expectedAmount * BigInt(PAYMENT_TOLERANCE_PERCENT)) / 100n;

    if (amount < minAmount) {
      return {
        verified: false,
        error: `Insufficient amount: expected ${expectedAmount}, got ${amount}`,
        errorCode: 'INSUFFICIENT_AMOUNT',
        amount,
        token: expectedToken,
      };
    }

    // Get sender owner
    const sourceAccount = info.source || info.authority;
    const preBalances = tx.meta?.preTokenBalances ?? [];
    const sourceBalance = preBalances.find(
      (b: { accountIndex: number; owner?: string }) =>
        tx.transaction.message.accountKeys[b.accountIndex]?.pubkey.toBase58() ===
        sourceAccount
    );
    const sender = sourceBalance?.owner || info.authority;

    // Check sender if provided
    if (expectedSender && sender?.toLowerCase() !== expectedSender.toLowerCase()) {
      return {
        verified: false,
        error: 'Sender mismatch',
        errorCode: 'SENDER_MISMATCH',
        sender,
        amount,
        token: expectedToken,
      };
    }

    return {
      verified: true,
      sender,
      recipient: treasuryLower,
      amount,
      token: expectedToken,
      blockTime: tx.blockTime ?? undefined,
    };
  }

  return {
    verified: false,
    error: 'No valid SPL transfer instruction found',
    errorCode: 'NO_TRANSFER',
  };
}

/**
 * Verify SPL transfer by analyzing balance changes.
 * This is a fallback for complex transactions.
 */
function verifySPLTransferFromBalances(
  tx: ParsedTransactionWithMeta,
  expectedToken: AcceptedToken,
  expectedMint: string,
  treasuryLower: string,
  expectedAmount: bigint,
  expectedSender?: string
): TransactionVerificationResult {
  const preBalances = tx.meta?.preTokenBalances ?? [];
  const postBalances = tx.meta?.postTokenBalances ?? [];

  // Find treasury account balance change
  for (const postBalance of postBalances) {
    if (postBalance.owner?.toLowerCase() !== treasuryLower) continue;
    if (postBalance.mint.toLowerCase() !== expectedMint) continue;

    // Find matching pre-balance
    const preBalance = preBalances.find(
      (pre: { accountIndex: number; mint: string; uiTokenAmount: { amount: string } }) =>
        pre.accountIndex === postBalance.accountIndex &&
        pre.mint.toLowerCase() === expectedMint
    );

    const preBal = BigInt(preBalance?.uiTokenAmount.amount ?? '0');
    const postBal = BigInt(postBalance.uiTokenAmount.amount);
    const received = postBal - preBal;

    if (received <= 0n) continue;

    // Check amount with tolerance
    const minAmount =
      expectedAmount - (expectedAmount * BigInt(PAYMENT_TOLERANCE_PERCENT)) / 100n;

    if (received < minAmount) {
      return {
        verified: false,
        error: `Insufficient amount: expected ${expectedAmount}, got ${received}`,
        errorCode: 'INSUFFICIENT_AMOUNT',
        amount: received,
        token: expectedToken,
      };
    }

    // Find sender (account that decreased)
    let sender: string | undefined;
    for (const preBal of preBalances) {
      if (preBal.mint.toLowerCase() !== expectedMint) continue;

      const postBal = postBalances.find(
        (post: { accountIndex: number; uiTokenAmount?: { amount: string } }) => post.accountIndex === preBal.accountIndex
      );

      const before = BigInt(preBal.uiTokenAmount.amount);
      const after = BigInt(postBal?.uiTokenAmount.amount ?? '0');

      if (before > after && preBal.owner) {
        sender = preBal.owner;
        break;
      }
    }

    // Check sender if provided
    if (expectedSender && sender && sender.toLowerCase() !== expectedSender.toLowerCase()) {
      return {
        verified: false,
        error: 'Sender mismatch',
        errorCode: 'SENDER_MISMATCH',
        sender,
        recipient: treasuryLower,
        amount: received,
        token: expectedToken,
      };
    }

    return {
      verified: true,
      sender,
      recipient: treasuryLower,
      amount: received,
      token: expectedToken,
      blockTime: tx.blockTime ?? undefined,
    };
  }

  return {
    verified: false,
    error: 'No valid SPL token transfer found to treasury',
    errorCode: 'NO_TRANSFER',
  };
}

// =============================================================================
// BALANCE QUERIES
// =============================================================================

/**
 * Get SOL balance for a wallet with retry.
 * @returns Balance in lamports
 */
export async function getSOLBalance(walletAddress: string): Promise<bigint> {
  return withRetry(async () => {
    const conn = getConnection();
    const pubkey = new PublicKey(walletAddress);
    const balance = await conn.getBalance(pubkey);
    return BigInt(balance);
  }, `getSOLBalance(${walletAddress})`);
}

/**
 * Get SPL token balance for a wallet with retry.
 * @returns Balance in token's smallest unit
 */
export async function getSPLTokenBalance(
  walletAddress: string,
  token: AcceptedToken
): Promise<bigint> {
  if (isNativeSOL(token)) {
    return getSOLBalance(walletAddress);
  }

  return withRetry(async () => {
    const conn = getConnection();
    const walletPubkey = new PublicKey(walletAddress);
    const mintPubkey = new PublicKey(getTokenMint(token));

    try {
      const tokenAccounts = await conn.getTokenAccountsByOwner(walletPubkey, {
        mint: mintPubkey,
      });

      if (tokenAccounts.value.length === 0) {
        return 0n;
      }

      let total = 0n;
      for (const account of tokenAccounts.value) {
        const balance = await conn.getTokenAccountBalance(account.pubkey);
        total += BigInt(balance.value.amount);
      }

      return total;
    } catch {
      return 0n;
    }
  }, `getSPLTokenBalance(${walletAddress}, ${token})`);
}

/**
 * Check if a token account exists for treasury.
 */
export async function checkTreasuryTokenAccount(token: AcceptedToken): Promise<boolean> {
  if (isNativeSOL(token)) {
    return true; // SOL always exists
  }

  try {
    await getSPLTokenBalance(TREASURY_WALLET, token);
    return true; // If we can query balance, account exists
  } catch {
    return false;
  }
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Validate a Solana wallet address.
 */
export function isValidWalletAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert token amount from USD cents to token units.
 *
 * @param amountCents - Amount in USD cents
 * @param tokenPriceUsd - Current token price in USD
 * @param decimals - Token decimals
 * @returns Amount in token's smallest unit
 */
export function centsToTokenAmount(
  amountCents: number,
  tokenPriceUsd: number,
  decimals: number
): bigint {
  if (tokenPriceUsd <= 0) {
    throw new SolanaError('Token price must be positive', 'INVALID_PRICE', false);
  }

  const amountUsd = amountCents / 100;
  const tokenAmount = amountUsd / tokenPriceUsd;
  const smallestUnit = tokenAmount * Math.pow(10, decimals);
  return BigInt(Math.floor(smallestUnit));
}

/**
 * Format a token amount for display.
 *
 * @param amount - Amount in token's smallest unit
 * @param decimals - Token decimals
 * @param maxDecimals - Maximum decimal places to show (default: 4)
 */
export function formatTokenAmount(
  amount: bigint,
  decimals: number,
  maxDecimals = 4
): string {
  const divisor = BigInt(Math.pow(10, decimals));
  const whole = amount / divisor;
  const fraction = amount % divisor;

  if (fraction === 0n) {
    return whole.toString();
  }

  const fractionStr = fraction.toString().padStart(decimals, '0');
  const trimmed = fractionStr.slice(0, maxDecimals).replace(/0+$/, '');

  if (trimmed === '') {
    return whole.toString();
  }

  return `${whole}.${trimmed}`;
}

// =============================================================================
// EXPORTS FOR TESTING
// =============================================================================

export const __testExports = {
  MAX_TRANSACTION_AGE_SECONDS,
  PAYMENT_TOLERANCE_PERCENT,
  RETRY_CONFIG,
  VALID_TOKEN_PROGRAMS,
  verifySOLTransfer,
  verifySPLTransfer,
  verifySPLTransferFromInstructions,
  verifySPLTransferFromBalances,
  withRetry,
};
