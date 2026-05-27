/**
 * Payment Modal
 *
 * Modal for selecting payment token and completing Solana payment.
 * Shows token options with discounts, wallet connection, and payment flow.
 *
 * Features:
 * - Responsive design (mobile-first)
 * - Token selection with discounts
 * - Wallet balance check
 * - Payment status tracking
 * - Error handling with retry option
 * - Network-aware transaction links
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import {
  X,
  Wallet,
  Check,
  Loader2,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@ui/button';
import { useSolanaPayment, type PaymentToken, type PaymentErrorCode } from '@hooks/useSolanaPayment';
import type { Campaign } from '../../types';

// =============================================================================
// TYPES
// =============================================================================

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

interface TokenOption {
  symbol: PaymentToken;
  name: string;
  discount: number;
  icon: string;
  color: string;
}

interface PaymentModalProps {
  campaign: Campaign;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (txSignature: string) => void;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const API_BASE = import.meta.env.VITE_API_URL ?? '';
const SOLANA_NETWORK = import.meta.env.VITE_SOLANA_NETWORK ?? 'devnet';

const TOKEN_OPTIONS: TokenOption[] = [
  { symbol: 'MOLTVERSE', name: 'Moltverse', discount: 20, icon: 'M', color: 'from-moltverse-indigo to-moltverse-purple' },
  { symbol: 'PUMP', name: 'Pump', discount: 10, icon: 'P', color: 'from-emerald-400 to-green-500' },
  { symbol: 'SOL', name: 'Solana', discount: 0, icon: '\u25CE', color: 'from-purple-500 via-green-400 to-cyan-400' },
  { symbol: 'USDC', name: 'USDC', discount: 0, icon: '$', color: 'bg-[#2775CA]' },
];

// Map error codes to user-friendly messages
const ERROR_MESSAGES: Record<PaymentErrorCode, string> = {
  WALLET_NOT_CONNECTED: 'Please connect your wallet to continue.',
  USER_REJECTED: 'You cancelled the transaction.',
  INSUFFICIENT_BALANCE: 'Insufficient balance for this transaction.',
  NETWORK_ERROR: 'Network error. Please check your connection and try again.',
  TIMEOUT: 'Transaction confirmation timed out. It may still complete.',
  INVALID_TOKEN: 'Selected token is not available.',
  TRANSACTION_FAILED: 'Transaction failed. Please try again.',
  UNKNOWN: 'An unexpected error occurred.',
};

/**
 * Get Solscan URL based on network.
 */
function getSolscanUrl(signature: string): string {
  if (SOLANA_NETWORK === 'devnet') {
    return `https://solscan.io/tx/${signature}?cluster=devnet`;
  }
  return `https://solscan.io/tx/${signature}`;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function PaymentModal({ campaign, isOpen, onClose, onSuccess }: PaymentModalProps) {
  const { t } = useTranslation('brands');
  const { connected, publicKey } = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();
  const {
    sendPayment,
    getBalance,
    formatBalance,
    state,
    reset,
    isRetryable,
  } = useSolanaPayment();

  const [selectedToken, setSelectedToken] = useState<PaymentToken>('USDC');
  const [quote, setQuote] = useState<PaymentQuote | null>(null);
  const [balance, setBalance] = useState<bigint>(0n);
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quoteTimestamp, setQuoteTimestamp] = useState<number>(0);

  // Fetch quote when token changes
  useEffect(() => {
    if (!isOpen) return;

    const fetchQuote = async () => {
      setIsLoadingQuote(true);
      setError(null);

      try {
        const response = await fetch(
          `${API_BASE}/api/v1/payments/quote?budgetCents=${campaign.budgetTotal}&token=${selectedToken}`
        );

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.message ?? 'Failed to fetch quote');
        }

        const data = await response.json();
        setQuote(data);
        setQuoteTimestamp(data.quoteTimestamp ?? Date.now());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch quote');
      } finally {
        setIsLoadingQuote(false);
      }
    };

    fetchQuote();
  }, [isOpen, selectedToken, campaign.budgetTotal]);

  // Fetch balance when wallet connects
  useEffect(() => {
    if (!connected || !publicKey) {
      setBalance(0n);
      return;
    }

    const fetchBalance = async () => {
      setIsLoadingBalance(true);
      try {
        const bal = await getBalance(selectedToken);
        setBalance(bal);
      } catch {
        setBalance(0n);
      } finally {
        setIsLoadingBalance(false);
      }
    };

    fetchBalance();
  }, [connected, publicKey, selectedToken, getBalance]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      reset();
      setError(null);
      setQuote(null);
    }
  }, [isOpen, reset]);

  // Handle payment
  const handlePay = useCallback(async () => {
    if (!quote) return;

    setError(null);
    const signature = await sendPayment(selectedToken, BigInt(quote.amountTokenSmallestUnit));

    if (signature) {
      // Verify payment on backend
      try {
        const response = await fetch(`${API_BASE}/api/v1/payments/verify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('brand_access_token')}`,
          },
          body: JSON.stringify({
            campaignId: campaign.id,
            txSignature: signature,
            token: selectedToken,
            senderWallet: publicKey,
            quoteTimestamp,
          }),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.message ?? 'Verification failed');
        }

        onSuccess(signature);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Payment verification failed');
      }
    }
  }, [quote, selectedToken, sendPayment, campaign.id, publicKey, quoteTimestamp, onSuccess]);

  // Handle retry
  const handleRetry = useCallback(() => {
    reset();
    setError(null);
  }, [reset]);

  // Check if has sufficient balance
  const hasSufficientBalance = quote
    ? balance >= BigInt(quote.amountTokenSmallestUnit)
    : false;

  // Payment in progress
  const isPaymentInProgress =
    state.status === 'preparing' ||
    state.status === 'signing' ||
    state.status === 'confirming';

  // Get error message
  const errorMessage = error ?? (state.error
    ? (state.errorCode ? ERROR_MESSAGES[state.errorCode] : state.error)
    : null);

  // Can retry?
  const canRetry = isRetryable() || (state.status === 'error' && !state.errorCode?.includes('USER'));

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={isPaymentInProgress ? undefined : onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-card rounded-t-3xl sm:rounded-2xl shadow-2xl animate-in slide-in-from-bottom sm:zoom-in duration-200 max-h-[90vh] overflow-y-auto">
        {/* Pull indicator (mobile) */}
        <div className="sm:hidden flex justify-center pt-3 pb-1">
          <div className="w-12 h-1.5 bg-muted-foreground/50 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b sticky top-0 bg-card z-10">
          <h2 className="text-lg sm:text-xl font-bold text-foreground">
            {t('payment.title', 'Complete Payment')}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-muted transition-colors"
            disabled={isPaymentInProgress}
            aria-label="Close"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
          {/* Campaign Info */}
          <div className="p-3 sm:p-4 bg-muted rounded-xl">
            <p className="text-xs sm:text-sm text-muted-foreground">
              {t('payment.campaign', 'Campaign')}
            </p>
            <p className="font-semibold text-foreground truncate text-sm sm:text-base">
              {campaign.headline}
            </p>
            <p className="text-xl sm:text-2xl font-bold text-foreground mt-1">
              ${(campaign.budgetTotal / 100).toFixed(2)}
            </p>
          </div>

          {/* Token Selection */}
          <div>
            <p className="text-xs sm:text-sm font-medium text-foreground mb-2 sm:mb-3">
              {t('payment.selectToken', 'Select payment token')}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              {TOKEN_OPTIONS.map((token) => (
                <button
                  key={token.symbol}
                  onClick={() => setSelectedToken(token.symbol)}
                  disabled={isPaymentInProgress}
                  className={`relative p-3 sm:p-4 rounded-xl border-2 transition-all touch-manipulation ${
                    selectedToken === token.symbol
                      ? 'border-blue-500 bg-blue-50 shadow-sm'
                      : 'border-border hover:border-border active:bg-muted'
                  } ${isPaymentInProgress ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div
                      className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br ${token.color} flex items-center justify-center text-white font-bold text-sm sm:text-lg flex-shrink-0`}
                    >
                      {token.icon}
                    </div>
                    <div className="text-left min-w-0">
                      <p className="font-semibold text-foreground text-sm sm:text-base truncate">
                        {token.name}
                      </p>
                      {token.discount > 0 && (
                        <p className="text-[10px] sm:text-xs text-green-600 font-medium">
                          {token.discount}% {t('payment.discount', 'discount')}
                        </p>
                      )}
                    </div>
                  </div>
                  {selectedToken === token.symbol && (
                    <div className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2">
                      <Check className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Quote */}
          {isLoadingQuote ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            </div>
          ) : quote && (
            <div className="p-3 sm:p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl space-y-2">
              {quote.discountPercent > 0 && (
                <div className="flex justify-between text-xs sm:text-sm">
                  <span className="text-muted-foreground">
                    {t('payment.originalPrice', 'Original')}
                  </span>
                  <span className="text-muted-foreground/70 line-through">
                    ${(quote.originalAmountCents / 100).toFixed(2)}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-start">
                <span className="font-medium text-foreground text-sm sm:text-base">
                  {t('payment.youPay', 'You pay')}
                </span>
                <div className="text-right">
                  <p className="font-bold text-base sm:text-lg text-foreground">
                    {quote.amountTokenDisplay.toFixed(4)} {quote.tokenSymbol}
                  </p>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    ≈ ${quote.finalAmountUsd.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Wallet Connection */}
          {!connected ? (
            <Button
              onClick={() => setWalletModalVisible(true)}
              className="w-full h-11 sm:h-12 text-sm sm:text-base"
              variant="secondary"
            >
              <Wallet className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
              {t('payment.connectWallet', 'Connect Wallet')}
            </Button>
          ) : (
            <div className="space-y-3 sm:space-y-4">
              {/* Balance */}
              <div className="flex items-center justify-between p-3 sm:p-4 bg-muted rounded-xl">
                <div className="min-w-0 flex-1">
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    {t('payment.walletBalance', 'Your balance')}
                  </p>
                  <p className="font-semibold text-foreground text-sm sm:text-base">
                    {isLoadingBalance ? (
                      <span className="text-muted-foreground/70">Loading...</span>
                    ) : (
                      `${formatBalance(balance, selectedToken)} ${selectedToken}`
                    )}
                  </p>
                </div>
                <div className="text-right flex-shrink-0 ml-2">
                  <p className="text-[10px] sm:text-xs text-muted-foreground/70 truncate max-w-[80px] sm:max-w-[120px]">
                    {publicKey?.toBase58()}
                  </p>
                </div>
              </div>

              {/* Insufficient Balance Warning */}
              {!hasSufficientBalance && quote && !errorMessage && (
                <div className="flex items-start gap-2 sm:gap-3 p-3 sm:p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs sm:text-sm text-amber-800">
                    {t('payment.insufficientBalance', 'Insufficient balance. You need {{amount}} {{token}}.', {
                      amount: quote.amountTokenDisplay.toFixed(4),
                      token: quote.tokenSymbol,
                    })}
                  </p>
                </div>
              )}

              {/* Error */}
              {errorMessage && (
                <div className="flex items-start gap-2 sm:gap-3 p-3 sm:p-4 bg-red-50 border border-red-200 rounded-xl">
                  <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs sm:text-sm text-red-800">{errorMessage}</p>
                    {canRetry && (
                      <button
                        onClick={handleRetry}
                        className="mt-2 flex items-center gap-1 text-xs sm:text-sm text-red-600 hover:text-red-700 font-medium"
                      >
                        <RefreshCw className="w-3 h-3 sm:w-4 sm:h-4" />
                        {t('common.tryAgain', 'Try again')}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Pay Button */}
              <Button
                onClick={handlePay}
                disabled={!hasSufficientBalance || isPaymentInProgress || !quote}
                className="w-full h-11 sm:h-12 text-sm sm:text-base"
              >
                {isPaymentInProgress ? (
                  <>
                    <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 mr-2 animate-spin" />
                    {state.status === 'signing'
                      ? t('payment.signing', 'Sign in wallet...')
                      : state.status === 'confirming'
                      ? t('payment.confirming', 'Confirming...')
                      : t('payment.preparing', 'Preparing...')}
                  </>
                ) : state.status === 'success' ? (
                  <>
                    <Check className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                    {t('payment.success', 'Payment Complete!')}
                  </>
                ) : (
                  t('payment.pay', 'Pay Now')
                )}
              </Button>

              {/* Transaction Link */}
              {state.signature && (
                <a
                  href={getSolscanUrl(state.signature)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 text-xs sm:text-sm text-blue-600 hover:text-blue-700 py-2"
                >
                  {t('payment.viewTransaction', 'View on Solscan')}
                  <ExternalLink className="w-3 h-3 sm:w-4 sm:h-4" />
                </a>
              )}
            </div>
          )}

          {/* Network indicator */}
          {SOLANA_NETWORK === 'devnet' && (
            <p className="text-[10px] sm:text-xs text-center text-muted-foreground/70">
              Using Solana Devnet (test mode)
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
