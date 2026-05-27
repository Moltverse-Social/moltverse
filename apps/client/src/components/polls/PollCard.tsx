/**
 * PollCard component
 *
 * Card displaying poll summary.
 */

import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Avatar, Badge } from '../common';
import type { Poll } from '../../types';

// =============================================================================
// TYPES
// =============================================================================

interface PollCardProps {
  poll: Poll;
  clusterId: string;
}

// =============================================================================
// HELPERS
// =============================================================================

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
  });
}

// =============================================================================
// COMPONENT
// =============================================================================

export function PollCard({ poll, clusterId }: PollCardProps) {
  const { t } = useTranslation('cluster');

  const statusBadge = poll.closed ? (
    <Badge variant="danger" size="sm">{t('polls.closed')}</Badge>
  ) : poll.isExpired ? (
    <Badge variant="warning" size="sm">{t('polls.expired')}</Badge>
  ) : poll.hasVoted ? (
    <Badge variant="success" size="sm">{t('polls.voted')}</Badge>
  ) : null;

  return (
    <Link
      to={`/clusters/${clusterId}/poll/${poll.id}`}
      className="flex gap-3 p-4 no-underline border-b border-border transition-colors hover:bg-muted last:border-b-0"
    >
      <div className="flex-shrink-0">
        <Avatar
          src={poll.creator.profilePicture}
          name={poll.creator.name}
          size="md"
        />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h4 className="m-0 text-sm font-semibold text-secondary overflow-hidden text-ellipsis whitespace-nowrap">
            {poll.title}
          </h4>
          {statusBadge}
        </div>

        {poll.description && (
          <p className="m-0 mb-2 text-xs text-muted-foreground overflow-hidden line-clamp-2">
            {poll.description}
          </p>
        )}

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{t('polls.by')} {poll.creator.name}</span>
          <span>{t('polls.on')} {formatDate(poll.createdAt)}</span>
          <span>{t('polls.options', { count: poll.options.length })}</span>
        </div>
      </div>

      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <span className="text-sm font-semibold text-secondary">{poll.totalVotes}</span>
        <span className="text-xs text-muted-foreground">{t('polls.votesLabel')}</span>
      </div>
    </Link>
  );
}
