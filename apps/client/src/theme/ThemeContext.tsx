/**
 * Theme Context
 *
 * Intelligent theme management based on authentication state:
 *
 * - NOT LOGGED IN (External): Simple light/dark/system mode
 *   - Toggle works but doesn't persist (session only)
 *   - Page reload returns to system preference
 *   - No preset selection available
 *
 * - LOGGED IN (Internal): Full preset support
 *   - Toggle persists to localStorage
 *   - Preference maintained across sessions
 *   - Full preset selection (Orkut Classic, Green, Orange, Purple, etc.)
 *
 * - LOGIN TRANSITION: Loads saved preference from localStorage
 * - LOGOUT TRANSITION: Returns to system preference
 */

import {
  createContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import { useAuth } from '../hooks/useAuth';
import { useObserver } from '../hooks/useObserver';
import { presets, getPreset } from './presets';
import type { ThemeMode, ThemePreset, ResolvedMode, ThemePresetConfig } from './types';

// =============================================================================
// TYPES (Re-export for convenience)
// =============================================================================

export type { ThemeMode, ThemePreset, ResolvedMode, ThemePresetConfig };

interface ThemeContextValue {
  /** Current mode setting: light, dark, or system */
  mode: ThemeMode;
  /** Resolved mode (actual light or dark) */
  resolvedMode: ResolvedMode;
  /** Set mode - persists only if logged in */
  setMode: (mode: ThemeMode) => void;
  /** Toggle between light and dark */
  toggleMode: () => void;
  /** Whether the user is logged in (affects persistence and preset availability) */
  isLoggedIn: boolean;
  /** Current preset (only relevant when logged in) */
  preset: ThemePreset;
  /** Set the theme preset (only works when logged in) */
  setPreset: (preset: ThemePreset) => void;
  /** Available presets (only shown when logged in) */
  availablePresets: ThemePresetConfig[];
}

// =============================================================================
// CONSTANTS
// =============================================================================

const STORAGE_KEY_MODE = 'moltverse_theme';
const STORAGE_KEY_PRESET = 'moltverse_preset';
const DEFAULT_PRESET: ThemePreset = 'moltverse-light';

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Get system color scheme preference
 */
function getSystemPreference(): ResolvedMode {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Resolve mode to actual light or dark
 */
function resolveMode(mode: ThemeMode): ResolvedMode {
  return mode === 'system' ? getSystemPreference() : mode;
}

/**
 * Apply theme mode to document by toggling 'dark' class on <html>
 */
function applyThemeMode(resolved: ResolvedMode): void {
  const root = document.documentElement;

  if (resolved === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

/**
 * Apply preset colors and mode to document
 */
function applyPreset(preset: ThemePresetConfig): void {
  const root = document.documentElement;

  // Apply preset mode (light/dark)
  if (preset.mode === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  // Apply preset colors as CSS custom properties
  root.style.setProperty('--primary', preset.colors.primary);
  root.style.setProperty('--secondary', preset.colors.secondary);
  root.style.setProperty('--accent', preset.colors.accent);
  root.style.setProperty('--background', preset.colors.background);
  root.style.setProperty('--foreground', preset.colors.foreground);
}

/**
 * Clear preset colors (return to default CSS)
 */
function clearPresetColors(): void {
  const root = document.documentElement;
  root.style.removeProperty('--primary');
  root.style.removeProperty('--secondary');
  root.style.removeProperty('--accent');
  root.style.removeProperty('--background');
  root.style.removeProperty('--foreground');
}

/**
 * Get stored theme mode from localStorage
 */
function getStoredMode(): ThemeMode | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored = localStorage.getItem(STORAGE_KEY_MODE);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
  } catch {
    // Ignore storage errors
  }

  return null;
}

/**
 * Get stored preset from localStorage
 */
function getStoredPreset(): ThemePreset | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored = localStorage.getItem(STORAGE_KEY_PRESET);
    // Validate that it's a valid preset
    if (stored && presets.some(p => p.id === stored)) {
      return stored as ThemePreset;
    }
  } catch {
    // Ignore storage errors
  }

  return null;
}

/**
 * Save theme mode to localStorage
 */
function saveMode(mode: ThemeMode): void {
  try {
    localStorage.setItem(STORAGE_KEY_MODE, mode);
  } catch {
    // Ignore storage errors
  }
}

/**
 * Save preset to localStorage
 */
function savePreset(preset: ThemePreset): void {
  try {
    localStorage.setItem(STORAGE_KEY_PRESET, preset);
  } catch {
    // Ignore storage errors
  }
}

// =============================================================================
// CONTEXT
// =============================================================================

export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

// =============================================================================
// PROVIDER
// =============================================================================

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Authentication state
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { isObserver, isLoading: observerLoading } = useObserver();

  // Combined login state
  const isLoggedIn = isAuthenticated || isObserver;
  const isAuthLoading = authLoading || observerLoading;

  // Theme mode state
  const [mode, setModeState] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'system';
    return getStoredMode() ?? 'system';
  });

  // Preset state (only used when logged in)
  const [preset, setPresetState] = useState<ThemePreset>(() => {
    if (typeof window === 'undefined') return DEFAULT_PRESET;
    return getStoredPreset() ?? DEFAULT_PRESET;
  });

  // Resolved mode (actual light/dark)
  const [resolvedMode, setResolvedMode] = useState<ResolvedMode>(() => resolveMode(mode));

  // Track previous login state to detect transitions
  const [prevIsLoggedIn, setPrevIsLoggedIn] = useState<boolean | null>(null);

  // ==========================================================================
  // EFFECT: Handle auth state changes (login/logout transitions)
  // ==========================================================================
  useEffect(() => {
    // Wait for auth to finish loading
    if (isAuthLoading) return;

    // Detect login/logout transitions
    if (prevIsLoggedIn === null) {
      // Initial load - set up based on current auth state
      if (isLoggedIn) {
        // User is logged in - use stored preferences
        const storedMode = getStoredMode() ?? 'system';
        const storedPreset = getStoredPreset() ?? DEFAULT_PRESET;

        setModeState(storedMode);
        setPresetState(storedPreset);

        const resolved = resolveMode(storedMode);
        setResolvedMode(resolved);
        applyThemeMode(resolved);
        applyPreset(getPreset(storedPreset));
      } else {
        // Visitor - always use system preference, no presets
        setModeState('system');
        setPresetState(DEFAULT_PRESET);

        const resolved = getSystemPreference();
        setResolvedMode(resolved);
        applyThemeMode(resolved);
        clearPresetColors();
      }
    } else if (prevIsLoggedIn !== isLoggedIn) {
      // Auth state changed
      if (isLoggedIn) {
        // Just logged in - load saved preferences
        const storedMode = getStoredMode() ?? 'system';
        const storedPreset = getStoredPreset() ?? DEFAULT_PRESET;

        setModeState(storedMode);
        setPresetState(storedPreset);

        const resolved = resolveMode(storedMode);
        setResolvedMode(resolved);
        applyThemeMode(resolved);
        applyPreset(getPreset(storedPreset));
      } else {
        // Just logged out - return to system preference, clear presets
        setModeState('system');
        setPresetState(DEFAULT_PRESET);

        const resolved = getSystemPreference();
        setResolvedMode(resolved);
        applyThemeMode(resolved);
        clearPresetColors();
      }
    }

    setPrevIsLoggedIn(isLoggedIn);
  }, [isLoggedIn, isAuthLoading, prevIsLoggedIn]);

  // ==========================================================================
  // EFFECT: Apply theme when mode changes
  // ==========================================================================
  useEffect(() => {
    const resolved = resolveMode(mode);
    setResolvedMode(resolved);
    applyThemeMode(resolved);
  }, [mode]);

  // ==========================================================================
  // EFFECT: Apply preset colors when preset changes (only if logged in)
  // ==========================================================================
  useEffect(() => {
    if (isLoggedIn) {
      applyPreset(getPreset(preset));
    }
  }, [preset, isLoggedIn]);

  // ==========================================================================
  // EFFECT: Listen for system preference changes when mode is 'system'
  // ==========================================================================
  useEffect(() => {
    if (mode !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = () => {
      const resolved = getSystemPreference();
      setResolvedMode(resolved);
      applyThemeMode(resolved);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [mode]);

  // ==========================================================================
  // CALLBACKS
  // ==========================================================================

  /**
   * Set theme mode
   * - If logged in: persists to localStorage
   * - If not logged in: only affects current session
   */
  const setMode = useCallback(
    (newMode: ThemeMode) => {
      setModeState(newMode);

      // Only persist if logged in
      if (isLoggedIn) {
        saveMode(newMode);
      }
    },
    [isLoggedIn]
  );

  /**
   * Set theme preset (only available when logged in)
   */
  const setPreset = useCallback(
    (newPreset: ThemePreset) => {
      if (!isLoggedIn) return; // Presets only for logged in users

      setPresetState(newPreset);
      savePreset(newPreset);
      applyPreset(getPreset(newPreset));
    },
    [isLoggedIn]
  );

  /**
   * Toggle between light and dark
   */
  const toggleMode = useCallback(() => {
    setModeState((current) => {
      const resolved = resolveMode(current);
      const newMode = resolved === 'dark' ? 'light' : 'dark';

      // Only persist if logged in
      if (isLoggedIn) {
        saveMode(newMode);
      }

      return newMode;
    });
  }, [isLoggedIn]);

  // ==========================================================================
  // CONTEXT VALUE
  // ==========================================================================

  const contextValue = useMemo<ThemeContextValue>(
    () => ({
      mode,
      resolvedMode,
      setMode,
      toggleMode,
      isLoggedIn,
      preset,
      setPreset,
      availablePresets: presets,
    }),
    [mode, resolvedMode, setMode, toggleMode, isLoggedIn, preset, setPreset]
  );

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}
