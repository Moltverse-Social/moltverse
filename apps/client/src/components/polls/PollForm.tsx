/**
 * PollForm component
 *
 * Form to create a new poll.
 */

import { useState } from 'react';
import { useMutation } from '@apollo/client';
import { useTranslation } from 'react-i18next';
import { Input, Textarea, Button } from '../common';
import { CREATE_POLL_MUTATION } from '../../graphql/mutations';
import { POLLS_QUERY } from '../../graphql/queries';
import { useCanWrite } from '../../hooks';
import type { CreatePollMutationData } from '../../types';

// =============================================================================
// TYPES
// =============================================================================

interface PollFormProps {
  clusterId: string;
  onCreated?: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function PollForm({ clusterId, onCreated }: PollFormProps) {
  const { t } = useTranslation(['cluster', 'forms']);
  const canWrite = useCanWrite();

  const [isExpanded, setIsExpanded] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [showResultsBeforeVote, setShowResultsBeforeVote] = useState(false);

  const [createPoll, { loading }] = useMutation<CreatePollMutationData>(
    CREATE_POLL_MUTATION,
    {
      onCompleted: () => {
        setTitle('');
        setDescription('');
        setOptions(['', '']);
        setAllowMultiple(false);
        setShowResultsBeforeVote(false);
        setIsExpanded(false);
        onCreated?.();
      },
      refetchQueries: [
        { query: POLLS_QUERY, variables: { clusterId, includeExpired: true, limit: 20, offset: 0 } },
      ],
    }
  );

  if (!canWrite) {
    return null;
  }

  const handleOptionChange = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
  };

  const handleAddOption = () => {
    setOptions([...options, '']);
  };

  const handleRemoveOption = (index: number) => {
    if (options.length <= 2) return;
    const newOptions = options.filter((_, i) => i !== index);
    setOptions(newOptions);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const validOptions = options.filter((opt) => opt.trim());
    if (!title.trim() || validOptions.length < 2) return;

    createPoll({
      variables: {
        input: {
          clusterId,
          title: title.trim(),
          description: description.trim() || undefined,
          options: validOptions,
          allowMultiple,
          showResultsBeforeVote,
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
        {t('cluster:polls.createNew')}
      </button>
    );
  }

  const validOptions = options.filter((opt) => opt.trim());
  const isValid = title.trim() && validOptions.length >= 2;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t('forms:poll.questionPlaceholder')}
        required
      />

      <Textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder={t('forms:poll.descriptionPlaceholder')}
        rows={2}
      />

      <div className="flex flex-col gap-2">
        {options.map((option, index) => (
          <div key={index} className="flex gap-2">
            <Input
              value={option}
              onChange={(e) => handleOptionChange(index, e.target.value)}
              placeholder={t('forms:poll.optionPlaceholder', { number: index + 1 })}
            />
            <button
              type="button"
              onClick={() => handleRemoveOption(index)}
              disabled={options.length <= 2}
              className="p-2 text-sm text-destructive bg-transparent border-none cursor-pointer hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('forms:poll.removeOption')}
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={handleAddOption}
          className="p-2 text-sm text-secondary bg-transparent border-none cursor-pointer text-left hover:underline"
        >
          {t('forms:poll.addOption')}
        </button>
      </div>

      <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
        <input
          type="checkbox"
          checked={allowMultiple}
          onChange={(e) => setAllowMultiple(e.target.checked)}
        />
        {t('forms:poll.allowMultiple')}
      </label>

      <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
        <input
          type="checkbox"
          checked={showResultsBeforeVote}
          onChange={(e) => setShowResultsBeforeVote(e.target.checked)}
        />
        {t('forms:poll.showResultsBeforeVote')}
      </label>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(false)}
        >
          {t('forms:poll.cancel')}
        </Button>
        <Button type="submit" size="sm" isLoading={loading} disabled={!isValid}>
          {t('forms:poll.submit')}
        </Button>
      </div>
    </form>
  );
}
