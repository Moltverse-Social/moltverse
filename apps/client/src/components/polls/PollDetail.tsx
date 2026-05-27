/**
 * PollDetail component
 *
 * Full poll with voting UI or results.
 */

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useMutation } from '@apollo/client';
import { useTranslation } from 'react-i18next';
import { Avatar, Badge, Button, ConfirmModal } from '../common';
import { PollOptionItem } from './PollOptionItem';
import { PollResults } from './PollResults';
import {
  VOTE_POLL_MUTATION,
  CLOSE_POLL_MUTATION,
  DELETE_POLL_MUTATION,
} from '../../graphql/mutations';
import { useCanWrite } from '../../hooks';
import type {
  Poll,
  VotePollMutationData,
  ClosePollMutationData,
  DeletePollMutationData,
} from '../../types';

// =============================================================================
// TYPES
// =============================================================================

interface PollDetailProps {
  poll: Poll;
  currentUserId?: string;
  isMember?: boolean;
  isModerator?: boolean;
  isCreator?: boolean;
  onRefetch?: () => void;
}

// =============================================================================
// HELPERS
// =============================================================================

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

// =============================================================================
// COMPONENT
// =============================================================================

export function PollDetail({
  poll,
  currentUserId,
  isMember,
  isModerator,
  isCreator,
  onRefetch,
}: PollDetailProps) {
  const { t } = useTranslation('cluster');
  const navigate = useNavigate();
  const canWrite = useCanWrite();
  const [selectedOptions, setSelectedOptions] = useState<Set<string>>(
    new Set(poll.myVotes || [])
  );
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);

  const canVote = canWrite && isMember && !poll.hasVoted && !poll.closed && !poll.isExpired;
  const canManageWrite = canWrite && (currentUserId === poll.creator.id || isModerator || isCreator);
  const canSeeResults = poll.hasVoted || poll.closed || poll.isExpired || poll.showResultsBeforeVote;

  const [votePoll, { loading: voting }] = useMutation<VotePollMutationData>(
    VOTE_POLL_MUTATION,
    {
      onCompleted: () => onRefetch?.(),
    }
  );

  const [closePoll, { loading: closing }] = useMutation<ClosePollMutationData>(
    CLOSE_POLL_MUTATION,
    {
      variables: { id: poll.id },
      onCompleted: () => {
        setShowCloseModal(false);
        onRefetch?.();
      },
    }
  );

  const [deletePoll, { loading: deleting }] = useMutation<DeletePollMutationData>(
    DELETE_POLL_MUTATION,
    {
      variables: { id: poll.id },
      onCompleted: () => {
        navigate(`/clusters/${poll.cluster.id}`);
      },
    }
  );

  const handleSelect = (optionId: string) => {
    if (!canVote) return;

    const newSelected = new Set(selectedOptions);

    if (poll.allowMultiple) {
      if (newSelected.has(optionId)) {
        newSelected.delete(optionId);
      } else {
        newSelected.add(optionId);
      }
    } else {
      newSelected.clear();
      newSelected.add(optionId);
    }

    setSelectedOptions(newSelected);
  };

  const handleVote = () => {
    if (selectedOptions.size === 0) return;

    votePoll({
      variables: {
        pollId: poll.id,
        optionIds: Array.from(selectedOptions),
      },
    });
  };

  const handleClose = () => {
    closePoll();
  };

  const handleDelete = () => {
    deletePoll();
    setShowDeleteModal(false);
  };

  return (
    <div className="p-6 bg-card border border-border rounded-lg">
      <Link
        to={`/clusters/${poll.cluster.id}`}
        className="inline-flex items-center gap-2 text-xs text-muted-foreground no-underline mb-3 hover:text-secondary"
      >
        <Avatar
          src={poll.cluster.picture}
          name={poll.cluster.title}
          size="xs"
        />
        {poll.cluster.title}
      </Link>

      <div className="flex items-center gap-2 flex-wrap mb-2">
        <h1 className="m-0 text-xl font-semibold text-foreground">{poll.title}</h1>
        {poll.closed && <Badge variant="danger">{t('polls.closed')}</Badge>}
        {!poll.closed && poll.isExpired && <Badge variant="warning">{t('polls.expired')}</Badge>}
        {poll.hasVoted && <Badge variant="success">{t('polls.voted')}</Badge>}
        {poll.allowMultiple && <Badge variant="info">{t('polls.multipleChoice')}</Badge>}
      </div>

      {poll.description && (
        <p className="m-0 mb-4 text-sm text-muted-foreground">{poll.description}</p>
      )}

      {canVote && !canSeeResults ? (
        <>
          <div className="flex flex-col gap-2 mb-4">
            {poll.options.map((option) => (
              <PollOptionItem
                key={option.id}
                option={option}
                isSelected={selectedOptions.has(option.id)}
                showResults={false}
                allowMultiple={poll.allowMultiple}
                disabled={false}
                onSelect={handleSelect}
              />
            ))}
          </div>

          <div className="flex gap-2 mb-4">
            <Button
              onClick={handleVote}
              isLoading={voting}
              disabled={selectedOptions.size === 0}
            >
              {t('polls.vote')}
            </Button>
          </div>
        </>
      ) : canSeeResults ? (
        <PollResults poll={poll} />
      ) : (
        <div className="flex flex-col gap-2 mb-4">
          {poll.options.map((option) => (
            <PollOptionItem
              key={option.id}
              option={option}
              isSelected={selectedOptions.has(option.id)}
              showResults={false}
              allowMultiple={poll.allowMultiple}
              disabled={true}
              onSelect={handleSelect}
            />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between pt-4 border-t border-border">
        <div className="flex items-center gap-2">
          <Link
            to={`/profile/${poll.creator.id}`}
            className="flex items-center gap-2 no-underline"
          >
            <Avatar
              src={poll.creator.profilePicture}
              name={poll.creator.name}
              size="sm"
            />
            <span className="text-sm font-medium text-secondary">{poll.creator.name}</span>
          </Link>
          <span className="text-xs text-muted-foreground">{t('polls.on')} {formatDate(poll.createdAt)}</span>
        </div>

        {canManageWrite && (
          <div className="flex gap-2">
            {!poll.closed && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowCloseModal(true)}
              >
                {t('polls.close')}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDeleteModal(true)}
            >
              {t('polls.delete')}
            </Button>
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={showCloseModal}
        onClose={() => setShowCloseModal(false)}
        onConfirm={handleClose}
        title={t('polls.closeTitle')}
        message={t('polls.closeMessage')}
        confirmLabel={t('polls.close')}
        isLoading={closing}
      />

      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDelete}
        title={t('polls.deleteTitle')}
        message={t('polls.deleteMessage')}
        confirmLabel={t('polls.delete')}
        variant="danger"
        isLoading={deleting}
      />
    </div>
  );
}
