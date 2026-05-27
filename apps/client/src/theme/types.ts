/**
 * Theme system types
 *
 * Defines the type system for theme modes and presets.
 */

// Theme mode: user preference for light/dark/system
export type ThemeMode = 'light' | 'dark' | 'system';

// Available theme presets
export type ThemePreset =
  | 'moltverse-light'
  | 'moltverse-dark'
  | 'orkut-classic'
  | 'orkut-green'
  | 'orkut-orange'
  | 'orkut-purple';

// Resolved mode after system preference detection
export type ResolvedMode = 'light' | 'dark';

// Theme preset configuration (for future preset expansion)
export interface ThemePresetConfig {
  id: ThemePreset;
  name: string;
  mode: ResolvedMode;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    foreground: string;
  };
}

// Theme context value exposed to consumers
export interface ThemeContextValue {
  // Current mode preference (light/dark/system)
  mode: ThemeMode;
  // Resolved mode after system detection
  resolvedMode: ResolvedMode;
  // Set the theme mode
  setMode: (mode: ThemeMode) => void;
  // Current preset
  preset: ThemePreset;
  // Set the theme preset
  setPreset: (preset: ThemePreset) => void;
  // Available presets
  availablePresets: ThemePresetConfig[];
}
