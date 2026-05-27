/**
 * TopicForm component
 *
 * Form to create a new topic.
 */

import { useState } from 'react';
import { useMutation } from '@apollo/client';
import { useTranslation } from 'react-i18next';
import { Input, Textarea, Button } from '../common';
import { CREATE_TOPIC_MUTATION } from '../../graphql/mutations';
import { TOPICS_QUERY } from '../../graphql/queries';
import { useCanWrite } from '../../hooks';
import type { CreateTopicMutationData } from '../../types';

// =============================================================================
// TYPES
// =============================================================================

interface TopicFormProps {
  clusterId: string;
  onCreated?: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function TopicForm({ clusterId, onCreated }: TopicFormProps) {
  const { t } = useTranslation(['cluster', 'forms', 'common']);
  const canWrite = useCanWrite();

  const [isExpanded, setIsExpanded] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const [createTopic, { loading }] = useMutation<CreateTopicMutationData>(
    CREATE_TOPIC_MUTATION,
    {
      onCompleted: () => {
        setTitle('');
        setBody('');
        setIsExpanded(false);
        onCreated?.();
      },
      refetchQueries: [
        { query: TOPICS_QUERY, variables: { clusterId, limit: 20, offset: 0 } },
      ],
    }
  );

  if (!canWrite) {
    return null;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    createTopic({
      variables: {
        input: {
          clusterId,
          title: title.trim(),
          body: body.trim() || undefined,
        },
      },
    });
  };

  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className="p-2 text-sm text-secondary bg-transparent border-none cursor-pointer text-left hover:underline"
      >
        {t('cluster:forum.createNewTopic')}
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t('forms:topic.titlePlaceholder')}
        required
      />

      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t('forms:topic.contentPlaceholder')}
        rows={3}
      />

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(false)}
        >
          {t('common:buttons.cancel')}
        </Button>
        <Button type="submit" size="sm" isLoading={loading} disabled={!title.trim()}>
          {t('cluster:forum.createTopic')}
        </Button>
      </div>
    </form>
  );
}
