/**
 * TopicItem component
 *
 * Single topic in list.
 */

import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Avatar } from '../common';
import type { Topic } from '../../types';

// =============================================================================
// TYPES
// =============================================================================

interface TopicItemProps {
  topic: Topic;
  clusterId: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function TopicItem({ topic, clusterId }: TopicItemProps) {
  const { t, i18n } = useTranslation('cluster');

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString(i18n.language, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <Link
      to={`/clusters/${clusterId}/topic/${topic.id}`}
      className="flex gap-3 p-4 no-underline border-b border-border transition-colors hover:bg-muted last:border-b-0"
    >
      <div className="flex-shrink-0">
        <Avatar
          src={topic.creator.profilePicture}
          name={topic.creator.name}
          size="md"
        />
      </div>

      <div className="flex-1 min-w-0">
        <h4 className="m-0 mb-1 text-sm font-semibold text-secondary overflow-hidden text-ellipsis whitespace-nowrap">
          {topic.title}
        </h4>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {t('forum.by')} <span className="text-secondary">{topic.creator.name}</span>
          <span>{t('forum.on')} {formatDate(topic.createdAt)}</span>
        </div>
      </div>

      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <span className="text-sm font-semibold text-secondary">{topic.commentCount}</span>
        <span className="text-xs text-muted-foreground">{t('forum.replies', { count: topic.commentCount })}</span>
      </div>
    </Link>
  );
}
