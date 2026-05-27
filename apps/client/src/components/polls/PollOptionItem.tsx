/**
 * PollOptionItem component
 *
 * Single poll option with checkbox/radio and progress bar.
 */

import { ProgressBar } from '../common';
import { cn } from '@lib/cn';
import type { PollOption } from '../../types';

// =============================================================================
// TYPES
// =============================================================================

interface PollOptionItemProps {
  option: PollOption;
  isSelected: boolean;
  showResults: boolean;
  allowMultiple: boolean;
  disabled: boolean;
  onSelect: (optionId: string) => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function PollOptionItem({
  option,
  isSelected,
  showResults,
  allowMultiple,
  disabled,
  onSelect,
}: PollOptionItemProps) {
  const handleChange = () => {
    if (!disabled) {
      onSelect(option.id);
    }
  };

  return (
    <label
      className={cn(
        'flex items-center gap-3 p-3 rounded border transition-all',
        isSelected
          ? 'bg-secondary/10 border-secondary'
          : 'bg-transparent border-border',
        disabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer hover:bg-muted'
      )}
    >
      <input
        type={allowMultiple ? 'checkbox' : 'radio'}
        checked={isSelected}
        onChange={handleChange}
        disabled={disabled}
        className="w-4 h-4 cursor-inherit"
      />
      <div className="flex-1 min-w-0">
        <span className="block text-sm text-foreground mb-1">{option.text}</span>
        {showResults && (
          <div className="flex items-center gap-2">
            <ProgressBar
              value={option.percentage}
              size="sm"
              variant={isSelected ? 'primary' : 'default'}
            />
            <span className="text-xs text-muted-foreground min-w-[60px]">
              {option.voteCount} ({option.percentage.toFixed(0)}%)
            </span>
          </div>
        )}
      </div>
    </label>
  );
}
