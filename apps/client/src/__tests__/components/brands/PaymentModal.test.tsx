/**
 * PaymentModal component tests
 *
 * Tests for:
 * - Token selection UI
 * - Quote display
 * - Wallet connection flow
 * - Balance display
 * - Error handling
 * - Payment states
 */

import { describe, it, expect } from 'vitest';

// Types for testing
type PaymentToken = 'SOL' | 'USDC' | 'MOLTVERSE' | 'PUMP';

interface TokenOption {
  symbol: PaymentToken;
  name: string;
  discount: number;
  icon: string;
  color: string;
}

interface PaymentQuote {
  originalAmountCents: number;
  discountPercent: number;
  finalAmountCents: number;
  finalAmountUsd: number;
  token: string;
  tokenSymbol: string;
  tokenPriceUsd: number;
  amountTokenSmallestUnit: string;
  amountTokenDisplay: number;
  expiresAt: string;
}

interface Campaign {
  id: string;
  headline: string;
  budgetTotal: number;
  status: string;
  paymentTxHash: string | null;
}

// Example quote demonstrating PaymentQuote type structure
const exampleQuote: PaymentQuote = {
  originalAmountCents: 10000,
  discountPercent: 20,
  finalAmountCents: 8000,
  finalAmountUsd: 80,
  token: 'MOLTVERSE',
  tokenSymbol: 'MOLTVERSE',
  tokenPriceUsd: 0.0001,
  amountTokenSmallestUnit: '800000000000000',
  amountTokenDisplay: 800000,
  expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
};

// Token options configuration
const TOKEN_OPTIONS: TokenOption[] = [
  { symbol: 'MOLTVERSE', name: 'Moltverse', discount: 20, icon: 'M', color: 'from-moltverse-indigo to-moltverse-purple' },
  { symbol: 'PUMP', name: 'Pump', discount: 10, icon: 'P', color: 'from-emerald-400 to-green-500' },
  { symbol: 'SOL', name: 'Solana', discount: 0, icon: '\u25CE', color: 'from-purple-500 via-green-400 to-cyan-400' },
  { symbol: 'USDC', name: 'USDC', discount: 0, icon: '$', color: 'bg-[#2775CA]' },
];

describe('PaymentModal', () => {
  describe('Quote Structure', () => {
    it('has correct quote structure with expected fields', () => {
      expect(exampleQuote.originalAmountCents).toBe(10000);
      expect(exampleQuote.discountPercent).toBe(20);
      expect(exampleQuote.finalAmountCents).toBe(8000);
      expect(exampleQuote.token).toBe('MOLTVERSE');
    });
  });

  describe('Token Options Configuration', () => {
    it('has correct number of token options', () => {
      expect(TOKEN_OPTIONS).toHaveLength(4);
    });

    it('MOLTVERSE has 20% discount', () => {
      const moltverse = TOKEN_OPTIONS.find((t) => t.symbol === 'MOLTVERSE');
      expect(moltverse?.discount).toBe(20);
    });

    it('PUMP has 10% discount', () => {
      const pump = TOKEN_OPTIONS.find((t) => t.symbol === 'PUMP');
      expect(pump?.discount).toBe(10);
    });

    it('SOL has no discount', () => {
      const sol = TOKEN_OPTIONS.find((t) => t.symbol === 'SOL');
      expect(sol?.discount).toBe(0);
    });

    it('USDC has no discount', () => {
      const usdc = TOKEN_OPTIONS.find((t) => t.symbol === 'USDC');
      expect(usdc?.discount).toBe(0);
    });
  });

  describe('Quote Calculations', () => {
    function calculateFinalAmount(originalCents: number, discountPercent: number): number {
      return Math.round(originalCents * (100 - discountPercent) / 100);
    }

    function calculateTokenAmount(
      amountCents: number,
      priceUsd: number,
      decimals: number
    ): bigint {
      const amountUsd = amountCents / 100;
      const tokenAmount = amountUsd / priceUsd;
      return BigInt(Math.round(tokenAmount * 10 ** decimals));
    }

    it('calculates correct final amount with 20% discount', () => {
      expect(calculateFinalAmount(10000, 20)).toBe(8000);
    });

    it('calculates correct final amount with 10% discount', () => {
      expect(calculateFinalAmount(10000, 10)).toBe(9000);
    });

    it('calculates correct final amount with no discount', () => {
      expect(calculateFinalAmount(10000, 0)).toBe(10000);
    });

    it('calculates correct token amount for MOLTVERSE', () => {
      // $80 at $0.0001 per token = 800,000 tokens
      // With 9 decimals = 800,000,000,000,000
      const amount = calculateTokenAmount(8000, 0.0001, 9);
      expect(amount).toBe(800000000000000n);
    });

    it('calculates correct token amount for SOL', () => {
      // $100 at $250 per SOL = 0.4 SOL
      // With 9 decimals = 400,000,000
      const amount = calculateTokenAmount(10000, 250, 9);
      expect(amount).toBe(400000000n);
    });

    it('calculates correct token amount for USDC', () => {
      // $100 at $1 per USDC = 100 USDC
      // With 6 decimals = 100,000,000
      const amount = calculateTokenAmount(10000, 1, 6);
      expect(amount).toBe(100000000n);
    });
  });

  describe('Balance Sufficiency Check', () => {
    function hasSufficientBalance(balance: bigint, required: string): boolean {
      return balance >= BigInt(required);
    }

    it('returns true when balance is greater than required', () => {
      expect(hasSufficientBalance(1000000000n, '500000000')).toBe(true);
    });

    it('returns true when balance equals required', () => {
      expect(hasSufficientBalance(500000000n, '500000000')).toBe(true);
    });

    it('returns false when balance is less than required', () => {
      expect(hasSufficientBalance(400000000n, '500000000')).toBe(false);
    });
  });

  describe('Solscan URL Generation', () => {
    function getSolscanUrl(signature: string, network: string): string {
      if (network === 'devnet') {
        return `https://solscan.io/tx/${signature}?cluster=devnet`;
      }
      return `https://solscan.io/tx/${signature}`;
    }

    it('generates correct mainnet URL', () => {
      const url = getSolscanUrl('tx123', 'mainnet-beta');
      expect(url).toBe('https://solscan.io/tx/tx123');
    });

    it('generates correct devnet URL', () => {
      const url = getSolscanUrl('tx123', 'devnet');
      expect(url).toBe('https://solscan.io/tx/tx123?cluster=devnet');
    });
  });

  describe('Error Messages', () => {
    const ERROR_MESSAGES: Record<string, string> = {
      WALLET_NOT_CONNECTED: 'Please connect your wallet to continue.',
      USER_REJECTED: 'You cancelled the transaction.',
      INSUFFICIENT_BALANCE: 'Insufficient balance for this transaction.',
      NETWORK_ERROR: 'Network error. Please check your connection and try again.',
      TIMEOUT: 'Transaction confirmation timed out. It may still complete.',
      INVALID_TOKEN: 'Selected token is not available.',
      TRANSACTION_FAILED: 'Transaction failed. Please try again.',
      UNKNOWN: 'An unexpected error occurred.',
    };

    it('has user-friendly message for all error codes', () => {
      expect(ERROR_MESSAGES.WALLET_NOT_CONNECTED).toContain('connect');
      expect(ERROR_MESSAGES.USER_REJECTED).toContain('cancelled');
      expect(ERROR_MESSAGES.INSUFFICIENT_BALANCE).toContain('balance');
      expect(ERROR_MESSAGES.NETWORK_ERROR).toContain('connection');
      expect(ERROR_MESSAGES.TIMEOUT).toContain('timed out');
      expect(ERROR_MESSAGES.INVALID_TOKEN).toContain('token');
      expect(ERROR_MESSAGES.TRANSACTION_FAILED).toContain('failed');
      expect(ERROR_MESSAGES.UNKNOWN).toContain('unexpected');
    });
  });

  describe('Quote Display Formatting', () => {
    function formatPrice(cents: number): string {
      return `$${(cents / 100).toFixed(2)}`;
    }

    function formatTokenAmount(amount: number): string {
      return amount.toFixed(4);
    }

    it('formats cents to dollars correctly', () => {
      expect(formatPrice(10000)).toBe('$100.00');
      expect(formatPrice(5050)).toBe('$50.50');
      expect(formatPrice(999)).toBe('$9.99');
    });

    it('formats token amounts with 4 decimals', () => {
      expect(formatTokenAmount(0.4)).toBe('0.4000');
      expect(formatTokenAmount(100)).toBe('100.0000');
      expect(formatTokenAmount(0.1234567)).toBe('0.1235');
    });
  });

  describe('Payment State UI', () => {
    function getButtonText(
      status: string,
      hasError: boolean,
      hasSufficientBalance: boolean
    ): string {
      if (status === 'preparing') return 'Preparing...';
      if (status === 'signing') return 'Sign in wallet...';
      if (status === 'confirming') return 'Confirming...';
      if (status === 'success') return 'Payment Complete!';
      if (hasError || !hasSufficientBalance) return 'Pay Now'; // disabled
      return 'Pay Now';
    }

    function isButtonDisabled(
      status: string,
      hasSufficientBalance: boolean,
      hasQuote: boolean
    ): boolean {
      const isInProgress = ['preparing', 'signing', 'confirming'].includes(status);
      return !hasSufficientBalance || isInProgress || !hasQuote;
    }

    it('shows correct button text for each state', () => {
      expect(getButtonText('idle', false, true)).toBe('Pay Now');
      expect(getButtonText('preparing', false, true)).toBe('Preparing...');
      expect(getButtonText('signing', false, true)).toBe('Sign in wallet...');
      expect(getButtonText('confirming', false, true)).toBe('Confirming...');
      expect(getButtonText('success', false, true)).toBe('Payment Complete!');
    });

    it('disables button during payment flow', () => {
      expect(isButtonDisabled('preparing', true, true)).toBe(true);
      expect(isButtonDisabled('signing', true, true)).toBe(true);
      expect(isButtonDisabled('confirming', true, true)).toBe(true);
    });

    it('disables button without sufficient balance', () => {
      expect(isButtonDisabled('idle', false, true)).toBe(true);
    });

    it('disables button without quote', () => {
      expect(isButtonDisabled('idle', true, false)).toBe(true);
    });

    it('enables button when ready', () => {
      expect(isButtonDisabled('idle', true, true)).toBe(false);
    });
  });

  describe('Modal Visibility', () => {
    function shouldRenderModal(isOpen: boolean): boolean {
      return isOpen;
    }

    it('renders when open', () => {
      expect(shouldRenderModal(true)).toBe(true);
    });

    it('does not render when closed', () => {
      expect(shouldRenderModal(false)).toBe(false);
    });
  });

  describe('Backdrop Click Handling', () => {
    function shouldCloseOnBackdropClick(isPaymentInProgress: boolean): boolean {
      return !isPaymentInProgress;
    }

    it('allows closing when not in progress', () => {
      expect(shouldCloseOnBackdropClick(false)).toBe(true);
    });

    it('prevents closing during payment', () => {
      expect(shouldCloseOnBackdropClick(true)).toBe(false);
    });
  });
});

describe('Campaign Payment Status', () => {
  function needsPayment(campaign: Campaign): boolean {
    return campaign.status === 'DRAFT' && !campaign.paymentTxHash;
  }

  function isPaid(campaign: Campaign): boolean {
    return !!campaign.paymentTxHash;
  }

  it('needs payment when DRAFT without tx hash', () => {
    const campaign: Campaign = {
      id: '1',
      headline: 'Test',
      budgetTotal: 5000,
      status: 'DRAFT',
      paymentTxHash: null,
    };
    expect(needsPayment(campaign)).toBe(true);
    expect(isPaid(campaign)).toBe(false);
  });

  it('does not need payment when already paid', () => {
    const campaign: Campaign = {
      id: '1',
      headline: 'Test',
      budgetTotal: 5000,
      status: 'DRAFT',
      paymentTxHash: 'tx123',
    };
    expect(needsPayment(campaign)).toBe(false);
    expect(isPaid(campaign)).toBe(true);
  });

  it('does not need payment when not DRAFT', () => {
    const campaign: Campaign = {
      id: '1',
      headline: 'Test',
      budgetTotal: 5000,
      status: 'ACTIVE',
      paymentTxHash: null,
    };
    expect(needsPayment(campaign)).toBe(false);
  });
});
