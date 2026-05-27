/**
 * useConfirmDialog hook
 *
 * Provides a promise-based confirmation dialog that replaces window.confirm().
 * Uses i18n for localized messages.
 */

import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

interface ConfirmOptions {
  titleKey?: string;
  messageKey?: string;
  title?: string;
  message?: string;
  confirmKey?: string;
  cancelKey?: string;
  interpolation?: Record<string, string | number>;
}

interface DialogState {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const initialState: DialogState = {
  isOpen: false,
  title: '',
  message: '',
  confirmLabel: '',
  cancelLabel: '',
  onConfirm: () => {},
  onCancel: () => {},
};

export function useConfirmDialog() {
  const { t } = useTranslation();
  const [dialogState, setDialogState] = useState<DialogState>(initialState);

  const confirm = useCallback(
    (options: ConfirmOptions = {}): Promise<boolean> => {
      return new Promise((resolve) => {
        const title = options.title || (options.titleKey ? t(options.titleKey, options.interpolation) : t('common:confirm.title'));
        const message = options.message || (options.messageKey ? t(options.messageKey, options.interpolation) : t('common:confirm.delete'));
        const confirmLabel = options.confirmKey ? t(options.confirmKey) : t('common:confirm.yes');
        const cancelLabel = options.cancelKey ? t(options.cancelKey) : t('common:confirm.no');

        setDialogState({
          isOpen: true,
          title,
          message,
          confirmLabel,
          cancelLabel,
          onConfirm: () => {
            setDialogState(initialState);
            resolve(true);
          },
          onCancel: () => {
            setDialogState(initialState);
            resolve(false);
          },
        });
      });
    },
    [t]
  );

  const close = useCallback(() => {
    dialogState.onCancel();
  }, [dialogState]);

  return {
    confirm,
    close,
    dialogProps: {
      isOpen: dialogState.isOpen,
      title: dialogState.title,
      message: dialogState.message,
      confirmLabel: dialogState.confirmLabel,
      cancelLabel: dialogState.cancelLabel,
      onConfirm: dialogState.onConfirm,
      onCancel: dialogState.onCancel,
    },
  };
}
