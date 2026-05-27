/**
 * ScrapItem component
 *
 * Displays a single scrap with sender info and delete option.
 */

import { Link } from 'react-router-dom';
import { useMutation } from '@apollo/client';
import { useTranslation } from 'react-i18next';
import { Avatar, Button, ConfirmModal } from '../common';
import { useConfirmDialog, useCanWrite } from '../../hooks';
import { DELETE_SCRAP_MUTATION } from '../../graphql/mutations';
import type { Scrap } from '../../types';

// =============================================================================
// TYPES
// =============================================================================

interface ScrapItemProps {
  scrap: Scrap;
  currentUserId?: string;
  onDeleted?: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ScrapItem({ scrap, currentUserId, onDeleted }: ScrapItemProps) {
  const { t } = useTranslation();
  const { confirm, dialogProps } = useConfirmDialog();
  const [deleteScrap, { loading }] = useMutation(DELETE_SCRAP_MUTATION, {
    onCompleted: () => {
      onDeleted?.();
    },
  });

  const canWrite = useCanWrite();
  const canDelete = canWrite &&
    (currentUserId === scrap.sender.id || currentUserId === scrap.receiver.id);

  const handleDelete = async () => {
    const confirmed = await confirm({
      titleKey: 'common:confirm.title',
      messageKey: 'common:confirm.deleteScrap',
    });
    if (confirmed) {
      deleteScrap({ variables: { id: scrap.id } });
    }
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return t('dates:short.now');
    if (minutes < 60) return t('dates:short.minutes', { count: minutes });
    if (hours < 24) return t('dates:short.hours', { count: hours });
    if (days < 7) return t('dates:short.days', { count: days });

    return date.toLocaleDateString();
  };

  // Detect code snippets for styling
  const body = scrap.body || '';
  const isCode = /[{}[\]();=>]/.test(body) ||
    body.includes('function') ||
    body.includes('const') ||
    body.includes('```');

  return (
    <div className={`flex gap-3 p-4 border-l-4 border-b border-border last:border-b-0 transition-all hover:shadow-md ${
      isCode ? 'border-l-secondary bg-secondary/5' : 'border-l-accent bg-card'
    }`}>
      <Link to={`/profile/${scrap.sender.id}`} className="flex-shrink-0">
        <Avatar
          src={scrap.sender.profilePicture}
          name={scrap.sender.name}
          size="md"
        />
      </Link>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <Link
            to={`/profile/${scrap.sender.id}`}
            className="text-sm font-semibold text-secondary hover:underline"
          >
            {scrap.sender.name}
          </Link>
          <span className="text-xs text-muted-foreground">{formatDate(scrap.createdAt)}</span>
        </div>

        <p className={`m-0 text-sm text-foreground whitespace-pre-wrap break-words ${
          isCode ? 'font-mono text-xs bg-muted p-2 rounded' : ''
        }`}>
          {scrap.body}
        </p>

        {canDelete && (
          <div className="mt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              isLoading={loading}
            >
              {t('common:buttons.delete')}
            </Button>
          </div>
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
    </div>
  );
}
