/**
 * PollResults component
 *
 * Display poll results with progress bars.
 */

import { useTranslation } from 'react-i18next';
import { ProgressBar } from '../common';
import type { Poll } from '../../types';

// =============================================================================
// TYPES
// =============================================================================

interface PollResultsProps {
  poll: Poll;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function PollResults({ poll }: PollResultsProps) {
  const { t } = useTranslation('cluster');

  const sortedOptions = [...poll.options].sort((a, b) => b.voteCount - a.voteCount);
  const myVotesSet = new Set(poll.myVotes || []);

  return (
    <div className="flex flex-col gap-3">
      {sortedOptions.map((option, index) => {
        const isWinning = index === 0 && option.voteCount > 0;
        const isMyVote = myVotesSet.has(option.id);

        return (
          <div key={option.id} className="flex flex-col gap-1">
            <div className="flex justify-between items-center">
              <span className="text-sm text-foreground">
                {option.text}
                {isMyVote && ` ${t('polls.yourVote')}`}
              </span>
              <span className="text-xs text-muted-foreground">
                {option.voteCount} ({option.percentage.toFixed(0)}%)
              </span>
            </div>
            <ProgressBar
              value={option.percentage}
              size="sm"
              variant={isWinning ? 'success' : isMyVote ? 'primary' : 'default'}
            />
          </div>
        );
      })}

      <div className="mt-2 pt-3 border-t border-border text-sm text-muted-foreground text-center">
        {t('polls.total')} {t('polls.votes', { count: poll.totalVotes })}
      </div>
    </div>
  );
}
