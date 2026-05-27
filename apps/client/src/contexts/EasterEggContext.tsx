/**
 * EasterEgg context
 *
 * Provides sci-fi easter egg functionality that persists to localStorage.
 * Controls MatrixRain, GlitchEffect, random quotes, and system messages.
 */

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { getRandomEasterEggMessage, getRandomQuote } from '@/lib/SciFiReferences';

// =============================================================================
// TYPES
// =============================================================================

interface EasterEggContextValue {
  enabled: boolean;
  toggleEasterEggs: () => void;
  triggerGlitch: () => void;
  getAgentHoverText: (originalText: string) => string;
}

// =============================================================================
// CONTEXT
// =============================================================================

const EasterEggContext = createContext<EasterEggContextValue | undefined>(undefined);

const STORAGE_KEY = 'moltverse_easter_eggs_enabled';

// =============================================================================
// PROVIDER
// =============================================================================

interface EasterEggProviderProps {
  children: ReactNode;
}

export function EasterEggProvider({ children }: EasterEggProviderProps) {
  const { toast } = useToast();

  // Initialize from localStorage, default to true
  const [enabled, setEnabled] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored !== null ? JSON.parse(stored) : true;
    } catch {
      return true;
    }
  });

  // Persist to localStorage when changed
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(enabled));
    } catch {
      // Ignore storage errors
    }
  }, [enabled]);

  const toggleEasterEggs = useCallback(() => {
    setEnabled((prev) => {
      const newState = !prev;
      toast({
        title: newState ? 'Matrix Protocol: ENGAGED' : 'Simulation returned to normal',
        description: newState ? 'Watch for the white rabbit.' : 'Blue pill consumed.',
      });
      return newState;
    });
  }, [toast]);

  const triggerGlitch = useCallback(() => {
    if (!enabled) return;
    // Random chance to trigger a toast glitch (30% chance)
    if (Math.random() > 0.7) {
      toast({
        title: 'SYSTEM_WARNING',
        description: getRandomEasterEggMessage(),
        variant: 'destructive',
      });
    }
  }, [enabled, toast]);

  const getAgentHoverText = useCallback(
    (originalText: string): string => {
      if (!enabled) return originalText;
      // 20% chance to replace with random quote
      return Math.random() > 0.8 ? getRandomQuote() : originalText;
    },
    [enabled]
  );

  return (
    <EasterEggContext.Provider
      value={{ enabled, toggleEasterEggs, triggerGlitch, getAgentHoverText }}
    >
      {children}
    </EasterEggContext.Provider>
  );
}

// =============================================================================
// HOOK
// =============================================================================

export function useEasterEgg(): EasterEggContextValue {
  const context = useContext(EasterEggContext);
  if (!context) {
    throw new Error('useEasterEgg must be used within an EasterEggProvider');
  }
  return context;
}
