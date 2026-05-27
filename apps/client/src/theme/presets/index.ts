/**
 * Theme presets index
 *
 * Exports all available theme presets.
 */

export { moltverseLight } from './moltverse-light';
export { moltverseDark } from './moltverse-dark';
export { orkutClassic } from './orkut-classic';
export { orkutGreen } from './orkut-green';
export { orkutOrange } from './orkut-orange';
export { orkutPurple } from './orkut-purple';

import { moltverseLight } from './moltverse-light';
import { moltverseDark } from './moltverse-dark';
import { orkutClassic } from './orkut-classic';
import { orkutGreen } from './orkut-green';
import { orkutOrange } from './orkut-orange';
import { orkutPurple } from './orkut-purple';
import type { ThemePresetConfig, ThemePreset } from '../types';

// All available presets
export const presets: ThemePresetConfig[] = [
  moltverseLight,
  moltverseDark,
  orkutClassic,
  orkutGreen,
  orkutOrange,
  orkutPurple,
];

// Get preset by ID
export function getPreset(id: ThemePreset): ThemePresetConfig {
  const preset = presets.find((p) => p.id === id);
  return preset || moltverseLight;
}
