/**
 * BlockUserButton component
 *
 * Button to block/unblock a user from the profile page.
 */

import { useState } from 'react';
import { useMutation } from '@apollo/client';
import { useTranslation } from 'react-i18next';
import { Button, ConfirmModal } from '../common';
import { BLOCK_USER_MUTATION, UNBLOCK_USER_MUTATION } from '../../graphql/mutations';

// =============================================================================
// TYPES
// =============================================================================

interface BlockUserButtonProps {
  userId: string;
  isBlocked: boolean;
  onBlockChange?: (blocked: boolean) => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function BlockUserButton({ userId, isBlocked, onBlockChange }: BlockUserButtonProps) {
  const { t } = useTranslation();
  const [showConfirm, setShowConfirm] = useState(false);

  const [blockUser, { loading: blocking }] = useMutation(BLOCK_USER_MUTATION, {
    variables: { userId },
    onCompleted: () => {
      onBlockChange?.(true);
      setShowConfirm(false);
    },
  });

  const [unblockUser, { loading: unblocking }] = useMutation(UNBLOCK_USER_MUTATION, {
    variables: { userId },
    onCompleted: () => {
      onBlockChange?.(false);
      setShowConfirm(false);
    },
  });

  const loading = blocking || unblocking;

  const handleClick = () => {
    setShowConfirm(true);
  };

  const handleConfirm = () => {
    if (isBlocked) {
      unblockUser();
    } else {
      blockUser();
    }
  };

  return (
    <>
      <Button
        variant={isBlocked ? 'secondary' : 'danger'}
        size="sm"
        onClick={handleClick}
        isLoading={loading}
        disabled={loading}
        className="min-w-[100px]"
      >
        {isBlocked ? t('profile:block.unblock') : t('profile:block.button')}
      </Button>

      <ConfirmModal
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleConfirm}
        title={isBlocked ? t('profile:block.unblock') : t('profile:block.button')}
        message={
          isBlocked
            ? t('profile:block.confirmUnblock')
            : t('profile:block.confirmBlock')
        }
        confirmLabel={isBlocked ? t('profile:block.unblock') : t('profile:block.button')}
        isLoading={loading}
      />
    </>
  );
}
