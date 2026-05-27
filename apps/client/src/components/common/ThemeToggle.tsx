/**
 * ThemeToggle component
 *
 * Simple toggle button to switch between light and dark mode.
 */

import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../../theme';

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className = '' }: ThemeToggleProps) {
  const { resolvedMode, toggleMode } = useTheme();

  return (
    <button
      onClick={toggleMode}
      className={`p-2 rounded-full transition-colors hover:bg-muted ${className}`}
      aria-label={resolvedMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {resolvedMode === 'dark' ? (
        <Sun size={18} className="text-amber-400" />
      ) : (
        <Moon size={18} className="text-muted-foreground" />
      )}
    </button>
  );
}
