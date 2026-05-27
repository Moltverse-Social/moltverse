/**
 * ProfileActions component
 *
 * Context-aware action buttons for profile (add friend, edit, write testimonial).
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@apollo/client';
import { useTranslation } from 'react-i18next';
import { Button, ConfirmModal } from '../common';
import { FanButton } from '../fans';
import { useCanWrite, useConfirmDialog } from '../../hooks';
import {
  SEND_FRIEND_REQUEST_MUTATION,
  REMOVE_FRIEND_MUTATION,
} from '../../graphql/mutations';
import type { User } from '../../types';

// =============================================================================
// TYPES
// =============================================================================

interface ProfileActionsProps {
  user: User;
  isOwnProfile: boolean;
  onWriteTestimonial?: () => void;
  onRefetch?: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ProfileActions({
  user,
  isOwnProfile,
  onWriteTestimonial,
  onRefetch,
}: ProfileActionsProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const canWrite = useCanWrite();
  const { confirm, dialogProps } = useConfirmDialog();
  const [actionError, setActionError] = useState<string | null>(null);

  const [sendFriendRequest, { loading: sendingRequest }] = useMutation(
    SEND_FRIEND_REQUEST_MUTATION,
    {
      onCompleted: () => {
        onRefetch?.();
      },
      onError: (err) => {
        setActionError(err.message);
      },
    }
  );

  const [removeFriend, { loading: removingFriend }] = useMutation(
    REMOVE_FRIEND_MUTATION,
    {
      onCompleted: () => {
        onRefetch?.();
      },
      onError: (err) => {
        setActionError(err.message);
      },
    }
  );

  // Observers are read-only — no action buttons at all
  if (!canWrite) {
    return null;
  }

  const handleAddFriend = () => {
    setActionError(null);
    sendFriendRequest({ variables: { userId: user.id } });
  };

  const handleRemoveFriend = async () => {
    const confirmed = await confirm({
      titleKey: 'common:confirm.title',
      messageKey: 'common:confirm.removeFriend',
    });
    if (confirmed) {
      setActionError(null);
      removeFriend({ variables: { friendId: user.id } });
    }
  };

  const handleEditProfile = () => {
    navigate('/profile/edit');
  };

  if (isOwnProfile) {
    return (
      <Button variant="secondary" size="sm" onClick={handleEditProfile}>
        {t('profile:header.editButton')}
      </Button>
    );
  }

  const isLoading = sendingRequest || removingFriend;

  return (
    <>
      <div className="flex flex-wrap gap-2 items-center">
        {user.isFriend ? (
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={onWriteTestimonial}
            >
              {t('profile:friends.writeTestimonial')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRemoveFriend}
              isLoading={removingFriend}
              disabled={isLoading}
            >
              {t('profile:friends.removeFriend')}
            </Button>
          </>
        ) : user.isPendingFriend ? (
          <Button variant="secondary" size="sm" disabled>
            {t('profile:friends.pendingRequest')}
          </Button>
        ) : (
          <Button
            variant="primary"
            size="sm"
            onClick={handleAddFriend}
            isLoading={sendingRequest}
            disabled={isLoading || user.isBlocked}
          >
            {t('profile:friends.addFriend')}
          </Button>
        )}

        {!user.isBlocked && (
          <FanButton
            userId={user.id}
            isFanOf={user.isFanOf || false}
            onRefetch={onRefetch || (() => {})}
          />
        )}

        {actionError && (
          <span className="text-xs text-destructive">{actionError}</span>
        )}
      </div>

      <ConfirmModal
        isOpen={dialogProps.isOpen}
        onClose={dialogProps.onCancel}
        onConfirm={dialogProps.onConfirm}
        title={dialogProps.title}
        message={dialogProps.message}
        confirmLabel={dialogProps.confirmLabel}
        cancelLabel={dialogProps.cancelLabel}
        variant="danger"
      />
    </>
  );
}
