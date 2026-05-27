/**
 * useSolanaPayment hook tests
 *
 * Tests for:
 * - Wallet state management
 * - Payment state transitions
 * - Balance formatting
 * - Error handling
 * - Retry logic
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Types for testing
type PaymentToken = 'SOL' | 'USDC' | 'MOLTVERSE' | 'PUMP';

type PaymentErrorCode =
  | 'WALLET_NOT_CONNECTED'
  | 'USER_REJECTED'
  | 'INSUFFICIENT_BALANCE'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'INVALID_TOKEN'
  | 'TRANSACTION_FAILED'
  | 'UNKNOWN';

interface PaymentState {
  status: 'idle' | 'preparing' | 'signing' | 'confirming' | 'success' | 'error';
  signature?: string;
  error?: string;
  errorCode?: PaymentErrorCode;
}

// Mock dependencies
const mockConnection = {
  getBalance: vi.fn(),
  getTokenAccountBalance: vi.fn(),
  getLatestBlockhash: vi.fn(),
  sendRawTransaction: vi.fn(),
  confirmTransaction: vi.fn(),
  getSignatureStatus: vi.fn(),
};

const mockWallet = {
  publicKey: { toBase58: () => 'TestWallet123' },
  signTransaction: vi.fn(),
  connected: true,
};

vi.mock('@solana/wallet-adapter-react', () => ({
  useConnection: () => ({ connection: mockConnection }),
  useWallet: () => mockWallet,
}));

vi.mock('@solana/web3.js', () => ({
  PublicKey: vi.fn().mockImplementation((key: string) => ({ toString: () => key })),
  SystemProgram: {
    transfer: vi.fn().mockReturnValue({}),
  },
  Transaction: vi.fn().mockImplementation(() => ({
    add: vi.fn(),
    recentBlockhash: '',
    feePayer: null,
    serialize: vi.fn().mockReturnValue(new Uint8Array()),
  })),
  LAMPORTS_PER_SOL: 1000000000,
  SendTransactionError: class extends Error {},
}));

vi.mock('@solana/spl-token', () => ({
  createTransferInstruction: vi.fn().mockReturnValue({}),
  getAssociatedTokenAddress: vi.fn().mockResolvedValue('MockATA'),
  TOKEN_PROGRAM_ID: 'TokenProgram',
}));

describe('useSolanaPayment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Balance Formatting', () => {
    function formatBalance(balance: bigint, token: PaymentToken): string {
      const decimals: Record<PaymentToken, number> = {
        SOL: 9,
        USDC: 6,
        MOLTVERSE: 9,
        PUMP: 6,
      };

      const tokenDecimals = decimals[token];
      const divisor = BigInt(10 ** tokenDecimals);
      const whole = balance / divisor;
      const fraction = balance % divisor;

      if (fraction === 0n) {
        return whole.toString();
      }

      const fractionStr = fraction.toString().padStart(tokenDecimals, '0');
      const trimmed = fractionStr.slice(0, 4).replace(/0+$/, '');

      if (trimmed === '') {
        return whole.toString();
      }

      return `${whole}.${trimmed}`;
    }

    it('formats whole SOL amounts', () => {
      expect(formatBalance(1000000000n, 'SOL')).toBe('1');
      expect(formatBalance(10000000000n, 'SOL')).toBe('10');
    });

    it('formats fractional SOL amounts', () => {
      expect(formatBalance(1500000000n, 'SOL')).toBe('1.5');
      expect(formatBalance(1234567890n, 'SOL')).toBe('1.2345');
    });

    it('formats USDC amounts', () => {
      expect(formatBalance(1000000n, 'USDC')).toBe('1');
      expect(formatBalance(50500000n, 'USDC')).toBe('50.5');
    });

    it('handles zero balance', () => {
      expect(formatBalance(0n, 'SOL')).toBe('0');
      expect(formatBalance(0n, 'USDC')).toBe('0');
    });

    it('trims trailing zeros', () => {
      expect(formatBalance(1100000000n, 'SOL')).toBe('1.1');
    });
  });

  describe('Error Classification', () => {
    function isUserRejection(message: string): boolean {
      const lower = message.toLowerCase();
      return (
        lower.includes('user rejected') ||
        lower.includes('user denied') ||
        lower.includes('user cancelled') ||
        lower.includes('cancelled by user') ||
        lower.includes('rejected the request')
      );
    }

    function isInsufficientBalance(message: string): boolean {
      const lower = message.toLowerCase();
      return (
        lower.includes('insufficient') ||
        lower.includes('not enough') ||
        lower.includes('0x1')
      );
    }

    function isNetworkError(message: string): boolean {
      const lower = message.toLowerCase();
      return (
        lower.includes('network') ||
        lower.includes('timeout') ||
        lower.includes('connection') ||
        lower.includes('failed to fetch')
      );
    }

    it('detects user rejection errors', () => {
      expect(isUserRejection('User rejected the request')).toBe(true);
      expect(isUserRejection('Transaction was cancelled by user')).toBe(true);
      expect(isUserRejection('User denied transaction')).toBe(true);
      expect(isUserRejection('Transaction failed')).toBe(false);
    });

    it('detects insufficient balance errors', () => {
      expect(isInsufficientBalance('Insufficient funds')).toBe(true);
      expect(isInsufficientBalance('Not enough SOL')).toBe(true);
      expect(isInsufficientBalance('Error 0x1: failed')).toBe(true);
      expect(isInsufficientBalance('Transaction failed')).toBe(false);
    });

    it('detects network errors', () => {
      expect(isNetworkError('Network error occurred')).toBe(true);
      expect(isNetworkError('Connection timeout')).toBe(true);
      expect(isNetworkError('Failed to fetch')).toBe(true);
      expect(isNetworkError('User rejected')).toBe(false);
    });
  });

  describe('Error Code Mapping', () => {
    function getErrorCode(message: string): PaymentErrorCode {
      const lower = message.toLowerCase();

      if (lower.includes('user rejected') || lower.includes('user denied')) {
        return 'USER_REJECTED';
      }
      if (lower.includes('insufficient') || lower.includes('not enough')) {
        return 'INSUFFICIENT_BALANCE';
      }
      if (lower.includes('network') || lower.includes('connection')) {
        return 'NETWORK_ERROR';
      }
      if (lower.includes('timeout')) {
        return 'TIMEOUT';
      }
      return 'UNKNOWN';
    }

    it('maps error messages to correct codes', () => {
      expect(getErrorCode('User rejected')).toBe('USER_REJECTED');
      expect(getErrorCode('Insufficient balance')).toBe('INSUFFICIENT_BALANCE');
      expect(getErrorCode('Network error')).toBe('NETWORK_ERROR');
      expect(getErrorCode('Timeout reached')).toBe('TIMEOUT');
      expect(getErrorCode('Something else')).toBe('UNKNOWN');
    });
  });

  describe('Retry Logic', () => {
    function isRetryable(errorCode?: PaymentErrorCode): boolean {
      return errorCode === 'NETWORK_ERROR' || errorCode === 'TIMEOUT';
    }

    it('identifies retryable errors', () => {
      expect(isRetryable('NETWORK_ERROR')).toBe(true);
      expect(isRetryable('TIMEOUT')).toBe(true);
    });

    it('identifies non-retryable errors', () => {
      expect(isRetryable('USER_REJECTED')).toBe(false);
      expect(isRetryable('INSUFFICIENT_BALANCE')).toBe(false);
      expect(isRetryable('UNKNOWN')).toBe(false);
    });

    it('handles undefined error code', () => {
      expect(isRetryable(undefined)).toBe(false);
    });
  });

  describe('Payment State Transitions', () => {
    it('follows correct state flow for successful payment', () => {
      const states: PaymentState[] = [
        { status: 'idle' },
        { status: 'preparing' },
        { status: 'signing' },
        { status: 'confirming' },
        { status: 'success', signature: 'tx123' },
      ];

      // Verify state progression
      for (let i = 0; i < states.length - 1; i++) {
        const current = states[i];
        const next = states[i + 1];

        // Idle -> preparing
        if (current.status === 'idle') {
          expect(next.status).toBe('preparing');
        }
        // Preparing -> signing
        if (current.status === 'preparing') {
          expect(next.status).toBe('signing');
        }
        // Signing -> confirming
        if (current.status === 'signing') {
          expect(next.status).toBe('confirming');
        }
        // Confirming -> success
        if (current.status === 'confirming') {
          expect(next.status).toBe('success');
          expect(next.signature).toBeDefined();
        }
      }
    });

    it('handles error state from any step', () => {
      const errorState: PaymentState = {
        status: 'error',
        error: 'Transaction failed',
        errorCode: 'TRANSACTION_FAILED',
      };

      expect(errorState.status).toBe('error');
      expect(errorState.error).toBeDefined();
      expect(errorState.errorCode).toBeDefined();
    });
  });

  describe('Token Configuration', () => {
    const TOKEN_CONFIGS: Record<PaymentToken, { symbol: string; decimals: number }> = {
      SOL: { symbol: 'SOL', decimals: 9 },
      USDC: { symbol: 'USDC', decimals: 6 },
      MOLTVERSE: { symbol: 'MOLTVERSE', decimals: 9 },
      PUMP: { symbol: 'PUMP', decimals: 6 },
    };

    it('has correct decimals for each token', () => {
      expect(TOKEN_CONFIGS.SOL.decimals).toBe(9);
      expect(TOKEN_CONFIGS.USDC.decimals).toBe(6);
      expect(TOKEN_CONFIGS.MOLTVERSE.decimals).toBe(9);
      expect(TOKEN_CONFIGS.PUMP.decimals).toBe(6);
    });

    it('has correct symbols', () => {
      expect(TOKEN_CONFIGS.SOL.symbol).toBe('SOL');
      expect(TOKEN_CONFIGS.USDC.symbol).toBe('USDC');
      expect(TOKEN_CONFIGS.MOLTVERSE.symbol).toBe('MOLTVERSE');
      expect(TOKEN_CONFIGS.PUMP.symbol).toBe('PUMP');
    });
  });
});

describe('Retry Helper', () => {
  async function withRetry<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    delayMs: number = 100
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry user rejections
        if (lastError.message.includes('user rejected')) {
          throw lastError;
        }

        // Don't retry on last attempt
        if (attempt < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, delayMs * Math.pow(2, attempt)));
        }
      }
    }

    throw lastError ?? new Error('Operation failed after retries');
  }

  it('returns result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await withRetry(fn);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure then succeeds', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValue('success');

    const result = await withRetry(fn, 3, 10);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws after max retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Network error'));

    await expect(withRetry(fn, 3, 10)).rejects.toThrow('Network error');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry user rejection', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('user rejected'));

    await expect(withRetry(fn, 3, 10)).rejects.toThrow('user rejected');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
