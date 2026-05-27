/**
 * Solana Payment Hook
 *
 * Provides functions for creating and sending Solana payments.
 * Works with both native SOL and SPL tokens.
 *
 * Features:
 * - Retry logic for network operations
 * - Specific error codes for different failure types
 * - User rejection detection
 * - Timeout handling
 */

import { useCallback, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import {
  PublicKey,
  SystemProgram,
  Transaction,
  SendTransactionError,
} from '@solana/web3.js';
import {
  createTransferInstruction,
  getAssociatedTokenAddress,
} from '@solana/spl-token';

// =============================================================================
// TYPES
// =============================================================================

export type PaymentToken = 'SOL' | 'USDC' | 'MOLTVERSE' | 'PUMP';

export interface TokenConfig {
  symbol: string;
  mint: string;
  decimals: number;
}

export type PaymentStatus =
  | 'idle'
  | 'preparing'
  | 'signing'
  | 'confirming'
  | 'success'
  | 'error';

export type PaymentErrorCode =
  | 'WALLET_NOT_CONNECTED'
  | 'USER_REJECTED'
  | 'INSUFFICIENT_BALANCE'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'INVALID_TOKEN'
  | 'TRANSACTION_FAILED'
  | 'UNKNOWN';

export interface PaymentState {
  status: PaymentStatus;
  signature?: string;
  error?: string;
  errorCode?: PaymentErrorCode;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const TOKEN_CONFIGS: Record<PaymentToken, TokenConfig> = {
  SOL: {
    symbol: 'SOL',
    mint: 'So11111111111111111111111111111111111111112',
    decimals: 9,
  },
  USDC: {
    symbol: 'USDC',
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    decimals: 6,
  },
  MOLTVERSE: {
    symbol: 'MOLTVERSE',
    mint: import.meta.env.VITE_MOLTVERSE_MINT ?? '74woXfTpVUe37jBwdBpwmAh415G2xEZmTXVvsGkCpump',
    decimals: 9,
  },
  PUMP: {
    symbol: 'PUMP',
    mint: import.meta.env.VITE_PUMP_MINT ?? 'pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn',
    decimals: 6,
  },
};

const TREASURY_WALLET =
  import.meta.env.VITE_TREASURY_WALLET ?? 'CEfEsEEq1iw21DC5hQN1PQBjE9ToMB7fYPDYEnXfk4DR';

/** Maximum number of retry attempts for network operations */
const MAX_RETRIES = 3;

/** Delay between retries in milliseconds */
const RETRY_DELAY_MS = 1000;

/** Timeout for confirmation in milliseconds (60 seconds) */
const CONFIRMATION_TIMEOUT_MS = 60000;

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = MAX_RETRIES,
  delayMs: number = RETRY_DELAY_MS
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry user rejections
      if (isUserRejection(lastError)) {
        throw lastError;
      }

      // Don't retry on last attempt
      if (attempt < maxRetries - 1) {
        const delay = delayMs * Math.pow(2, attempt);
        await sleep(delay);
      }
    }
  }

  throw lastError ?? new Error('Operation failed after retries');
}

/**
 * Check if an error is a user rejection.
 */
function isUserRejection(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes('user rejected') ||
    message.includes('user denied') ||
    message.includes('user cancelled') ||
    message.includes('cancelled by user') ||
    message.includes('transaction was not confirmed') ||
    message.includes('rejected the request')
  );
}

/**
 * Check if an error is an insufficient balance error.
 */
function isInsufficientBalance(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes('insufficient') ||
    message.includes('not enough') ||
    message.includes('0x1') // Solana error code for insufficient funds
  );
}

/**
 * Check if an error is a network error.
 */
function isNetworkError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('connection') ||
    message.includes('failed to fetch') ||
    message.includes('socket')
  );
}

/**
 * Parse error to get error code and message.
 */
function parseError(error: unknown): { code: PaymentErrorCode; message: string } {
  const err = error instanceof Error ? error : new Error(String(error));

  if (isUserRejection(err)) {
    return { code: 'USER_REJECTED', message: 'Transaction was rejected by user' };
  }

  if (isInsufficientBalance(err)) {
    return { code: 'INSUFFICIENT_BALANCE', message: 'Insufficient balance for this transaction' };
  }

  if (isNetworkError(err)) {
    return { code: 'NETWORK_ERROR', message: 'Network error. Please check your connection.' };
  }

  if (err.message.includes('timeout')) {
    return { code: 'TIMEOUT', message: 'Transaction confirmation timed out' };
  }

  // SendTransactionError contains more details
  if (error instanceof SendTransactionError) {
    return { code: 'TRANSACTION_FAILED', message: error.message };
  }

  return { code: 'UNKNOWN', message: err.message || 'Payment failed' };
}

// =============================================================================
// HOOK
// =============================================================================

export function useSolanaPayment() {
  const { connection } = useConnection();
  const { publicKey, signTransaction, connected } = useWallet();
  const [state, setState] = useState<PaymentState>({ status: 'idle' });

  /**
   * Get the balance of a token for the connected wallet.
   * Includes retry logic for network errors.
   */
  const getBalance = useCallback(
    async (token: PaymentToken): Promise<bigint> => {
      if (!publicKey) return 0n;

      try {
        return await withRetry(async () => {
          if (token === 'SOL') {
            const balance = await connection.getBalance(publicKey);
            return BigInt(balance);
          }

          const config = TOKEN_CONFIGS[token];
          if (!config.mint) return 0n;

          const mintPubkey = new PublicKey(config.mint);
          const ata = await getAssociatedTokenAddress(mintPubkey, publicKey);

          try {
            const balance = await connection.getTokenAccountBalance(ata);
            return BigInt(balance.value.amount);
          } catch {
            // Token account doesn't exist
            return 0n;
          }
        });
      } catch {
        return 0n;
      }
    },
    [connection, publicKey]
  );

  /**
   * Send a payment to the treasury wallet.
   * Includes retry logic and comprehensive error handling.
   */
  const sendPayment = useCallback(
    async (
      token: PaymentToken,
      amountSmallestUnit: bigint
    ): Promise<string | null> => {
      if (!publicKey || !signTransaction) {
        setState({
          status: 'error',
          error: 'Wallet not connected',
          errorCode: 'WALLET_NOT_CONNECTED',
        });
        return null;
      }

      setState({ status: 'preparing' });

      try {
        const treasuryPubkey = new PublicKey(TREASURY_WALLET);
        const transaction = new Transaction();

        if (token === 'SOL') {
          // Native SOL transfer
          transaction.add(
            SystemProgram.transfer({
              fromPubkey: publicKey,
              toPubkey: treasuryPubkey,
              lamports: Number(amountSmallestUnit),
            })
          );
        } else {
          // SPL token transfer
          const config = TOKEN_CONFIGS[token];
          if (!config.mint) {
            setState({
              status: 'error',
              error: `Token ${token} mint not configured`,
              errorCode: 'INVALID_TOKEN',
            });
            return null;
          }

          const mintPubkey = new PublicKey(config.mint);

          // Get ATAs with retry
          const [senderAta, treasuryAta] = await withRetry(async () => {
            const sender = await getAssociatedTokenAddress(mintPubkey, publicKey);
            const treasury = await getAssociatedTokenAddress(mintPubkey, treasuryPubkey);
            return [sender, treasury] as const;
          });

          transaction.add(
            createTransferInstruction(
              senderAta,
              treasuryAta,
              publicKey,
              amountSmallestUnit
            )
          );
        }

        // Get recent blockhash with retry
        const { blockhash, lastValidBlockHeight } = await withRetry(
          () => connection.getLatestBlockhash('confirmed')
        );
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = publicKey;

        setState({ status: 'signing' });

        // Sign transaction (no retry - user interaction)
        let signedTx: Transaction;
        try {
          signedTx = await signTransaction(transaction);
        } catch (error) {
          const { code, message } = parseError(error);
          setState({ status: 'error', error: message, errorCode: code });
          return null;
        }

        setState({ status: 'confirming' });

        // Send transaction with retry
        const signature = await withRetry(() =>
          connection.sendRawTransaction(signedTx.serialize(), {
            skipPreflight: false,
            maxRetries: 2,
          })
        );

        // Confirm with timeout
        const confirmationPromise = connection.confirmTransaction(
          { signature, blockhash, lastValidBlockHeight },
          'confirmed'
        );

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('Transaction confirmation timed out')),
            CONFIRMATION_TIMEOUT_MS
          )
        );

        try {
          const result = await Promise.race([confirmationPromise, timeoutPromise]);

          if (result.value.err) {
            throw new Error(`Transaction failed: ${JSON.stringify(result.value.err)}`);
          }
        } catch (error) {
          // Transaction might still succeed, check if it exists
          const status = await connection.getSignatureStatus(signature);
          if (!status?.value || status.value.err) {
            const { code, message } = parseError(error);
            setState({ status: 'error', error: message, errorCode: code });
            return null;
          }
          // Transaction exists and no error, continue
        }

        setState({ status: 'success', signature });
        return signature;
      } catch (error) {
        const { code, message } = parseError(error);
        setState({ status: 'error', error: message, errorCode: code });
        return null;
      }
    },
    [connection, publicKey, signTransaction]
  );

  /**
   * Reset payment state.
   */
  const reset = useCallback(() => {
    setState({ status: 'idle' });
  }, []);

  /**
   * Format balance for display.
   */
  const formatBalance = useCallback(
    (balance: bigint, token: PaymentToken): string => {
      const config = TOKEN_CONFIGS[token];
      const divisor = BigInt(10 ** config.decimals);
      const whole = balance / divisor;
      const fraction = balance % divisor;

      if (fraction === 0n) {
        return whole.toString();
      }

      const fractionStr = fraction.toString().padStart(config.decimals, '0');
      const trimmed = fractionStr.slice(0, 4).replace(/0+$/, '');

      if (trimmed === '') {
        return whole.toString();
      }

      return `${whole}.${trimmed}`;
    },
    []
  );

  /**
   * Check if the current error is retryable.
   */
  const isRetryable = useCallback((): boolean => {
    if (state.status !== 'error') return false;
    return state.errorCode === 'NETWORK_ERROR' || state.errorCode === 'TIMEOUT';
  }, [state]);

  return {
    // Wallet state
    connected,
    publicKey: publicKey?.toBase58() ?? null,

    // Payment state
    state,

    // Functions
    getBalance,
    sendPayment,
    reset,
    formatBalance,
    isRetryable,

    // Config
    tokenConfigs: TOKEN_CONFIGS,
    treasuryWallet: TREASURY_WALLET,
  };
}
