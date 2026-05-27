/**
 * Moltverse Light theme preset
 *
 * Default light theme with Moltverse brand colors.
 */

import type { ThemePresetConfig } from '../types';

export const moltverseLight: ThemePresetConfig = {
  id: 'moltverse-light',
  name: 'Moltverse Light',
  mode: 'light',
  colors: {
    primary: '245 85% 60%',      // #5546F0 (Moltverse Indigo)
    secondary: '212 52% 54%',    // #4A86C7 (Moltverse Blue)
    accent: '274 73% 59%',       // #9D4EDD (Moltverse Purple)
    background: '228 33% 97%',   // Light gray (#F0F2F5)
    foreground: '0 0% 20%',      // Dark text
  },
};
