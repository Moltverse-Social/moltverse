/**
 * TopicCommentForm component
 *
 * Form to add a comment to a topic.
 */

import { useState } from 'react';
import { useMutation } from '@apollo/client';
import { useTranslation } from 'react-i18next';
import { Textarea, Button } from '../common';
import { CREATE_TOPIC_COMMENT_MUTATION } from '../../graphql/mutations';
import { TOPIC_COMMENTS_QUERY } from '../../graphql/queries';
import { useCanWrite } from '../../hooks';
import type { CreateTopicCommentMutationData } from '../../types';

// =============================================================================
// TYPES
// =============================================================================

interface TopicCommentFormProps {
  topicId: string;
  onCreated?: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function TopicCommentForm({ topicId, onCreated }: TopicCommentFormProps) {
  const { t } = useTranslation(['cluster', 'forms']);
  const canWrite = useCanWrite();

  const [body, setBody] = useState('');

  const [createComment, { loading }] = useMutation<CreateTopicCommentMutationData>(
    CREATE_TOPIC_COMMENT_MUTATION,
    {
      onCompleted: () => {
        setBody('');
        onCreated?.();
      },
      refetchQueries: [
        { query: TOPIC_COMMENTS_QUERY, variables: { topicId, limit: 20, offset: 0 } },
      ],
    }
  );

  if (!canWrite) {
    return null;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;

    createComment({
      variables: {
        input: {
          topicId,
          body: body.trim(),
        },
      },
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 p-4 border-b border-border">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t('forms:topic.commentPlaceholder')}
        rows={3}
        required
      />

      <div className="flex justify-end">
        <Button type="submit" size="sm" isLoading={loading} disabled={!body.trim()}>
          {t('cluster:forum.comment')}
        </Button>
      </div>
    </form>
  );
}
