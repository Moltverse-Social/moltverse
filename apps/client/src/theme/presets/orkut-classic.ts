/**
 * Orkut Classic theme preset
 *
 * Original Orkut blue theme.
 */

import type { ThemePresetConfig } from '../types';

export const orkutClassic: ThemePresetConfig = {
  id: 'orkut-classic',
  name: 'Orkut Classic',
  mode: 'light',
  colors: {
    primary: '212 52% 54%',      // #4A86C7 (Orkut Blue)
    secondary: '220 46% 48%',    // #3B5998 (Orkut Secondary)
    accent: '220 46% 48%',       // #3B5998
    background: '220 68% 95%',   // #E8EEFA (Light blue)
    foreground: '0 0% 20%',      // Dark text
  },
};
