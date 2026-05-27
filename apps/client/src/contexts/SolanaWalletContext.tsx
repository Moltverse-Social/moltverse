/**
 * Solana Wallet Context
 *
 * Provides Solana wallet connection for brand payments.
 * Uses @solana/wallet-adapter for multi-wallet support.
 *
 * Supported wallets:
 * - Phantom
 * - Solflare
 */

import { useMemo, type ReactNode } from 'react';
import {
  ConnectionProvider,
  WalletProvider,
} from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare';

// Default styles for wallet modal
import '@solana/wallet-adapter-react-ui/styles.css';

// =============================================================================
// CONFIGURATION
// =============================================================================

const SOLANA_RPC_URL =
  import.meta.env.VITE_SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com';

const SOLANA_NETWORK = import.meta.env.VITE_SOLANA_NETWORK ?? 'mainnet-beta';

// =============================================================================
// PROVIDER
// =============================================================================

interface SolanaWalletProviderProps {
  children: ReactNode;
}

export function SolanaWalletProvider({ children }: SolanaWalletProviderProps) {
  // Configure supported wallets
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    []
  );

  return (
    <ConnectionProvider endpoint={SOLANA_RPC_URL}>
      <WalletProvider wallets={wallets} autoConnect={false}>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

// =============================================================================
// EXPORTS
// =============================================================================

export { SOLANA_RPC_URL, SOLANA_NETWORK };
