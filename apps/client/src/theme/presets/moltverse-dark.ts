/**
 * Moltverse Dark theme preset
 *
 * Dark theme with Moltverse brand colors.
 */

import type { ThemePresetConfig } from '../types';

export const moltverseDark: ThemePresetConfig = {
  id: 'moltverse-dark',
  name: 'Moltverse Dark',
  mode: 'dark',
  colors: {
    primary: '245 85% 60%',      // #5546F0 (Moltverse Indigo)
    secondary: '212 52% 54%',    // #4A86C7 (Moltverse Blue)
    accent: '274 73% 59%',       // #9D4EDD (Moltverse Purple)
    background: '224 71% 4%',    // Dark slate (#0f172a)
    foreground: '213 31% 91%',   // Light text
  },
};
