/**
 * TopicHeader component
 *
 * Header section of topic page with title, body, author.
 */

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useMutation } from '@apollo/client';
import { useTranslation } from 'react-i18next';
import { Avatar, Button, ConfirmModal } from '../common';
import { useCanWrite } from '../../hooks';
import { DELETE_TOPIC_MUTATION } from '../../graphql/mutations';
import type { Topic, DeleteTopicMutationData } from '../../types';

// =============================================================================
// TYPES
// =============================================================================

interface TopicHeaderProps {
  topic: Topic;
  currentUserId?: string;
  isModerator?: boolean;
  isCreator?: boolean;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function TopicHeader({ topic, currentUserId, isModerator, isCreator }: TopicHeaderProps) {
  const { t, i18n } = useTranslation('cluster');
  const navigate = useNavigate();
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString(i18n.language, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const canWrite = useCanWrite();

  const [deleteTopic, { loading: deleting }] = useMutation<DeleteTopicMutationData>(
    DELETE_TOPIC_MUTATION,
    {
      variables: { id: topic.id },
      onCompleted: () => {
        navigate(`/clusters/${topic.cluster.id}`);
      },
    }
  );

  const canDelete = canWrite && (currentUserId === topic.creator.id || isModerator || isCreator);

  const handleDelete = () => {
    deleteTopic();
    setShowDeleteModal(false);
  };

  return (
    <div className="p-6 bg-card border border-border rounded-lg">
      <Link
        to={`/clusters/${topic.cluster.id}`}
        className="inline-flex items-center gap-2 text-xs text-muted-foreground no-underline mb-3 hover:text-secondary"
      >
        <Avatar
          src={topic.cluster.picture}
          name={topic.cluster.title}
          size="xs"
        />
        {topic.cluster.title}
      </Link>

      <h1 className="m-0 mb-4 text-xl font-semibold text-foreground">{topic.title}</h1>

      {topic.body && (
        <p className="m-0 mb-4 text-sm text-foreground leading-relaxed whitespace-pre-wrap">
          {topic.body}
        </p>
      )}

      <div className="flex items-center justify-between pt-4 border-t border-border">
        <div className="flex items-center gap-2">
          <Link
            to={`/profile/${topic.creator.id}`}
            className="flex items-center gap-2 no-underline"
          >
            <Avatar
              src={topic.creator.profilePicture}
              name={topic.creator.name}
              size="sm"
            />
            <span className="text-sm font-medium text-secondary">{topic.creator.name}</span>
          </Link>
          <span className="text-xs text-muted-foreground">{t('forum.on')} {formatDate(topic.createdAt)}</span>
        </div>

        {canDelete && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDeleteModal(true)}
          >
            {t('forum.deleteTopic')}
          </Button>
        )}
      </div>

      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDelete}
        title={t('forum.deleteTopic')}
        message={t('forum.deleteTopicConfirm')}
        confirmLabel={t('forum.deleteTopic')}
        variant="danger"
        isLoading={deleting}
      />
    </div>
  );
}
