import { useState } from 'react';
import { fileToasts } from '@/lib/toast-utils';

/**
 * Centralized hook for managing recording actions (share, delete, download, etc.)
 */
export function useRecordingActions() {
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const handleDownload = (url: string, fileName: string) => {
    try {
      window.open(url, '_blank');
      fileToasts.downloaded(fileName);
    } catch (error) {
      fileToasts.downloadFailed(fileName);
    }
  };

  const copyToClipboard = async (text: string, label: string = 'Text') => {
    try {
      await navigator.clipboard.writeText(text);
      fileToasts.copied(label);
    } catch (err) {
      console.error('Failed to copy text: ', err);
      fileToasts.copyFailed(label);
    }
  };

  return {
    shareDialogOpen,
    setShareDialogOpen,
    deleteDialogOpen,
    setDeleteDialogOpen,
    handleDownload,
    copyToClipboard,
  };
}
