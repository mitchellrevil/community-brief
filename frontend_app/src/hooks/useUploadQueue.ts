/**
 * Upload Queue Manager Hook
 * 
 * React hook to manage PWA upload queue state and trigger sync operations.
 * Monitors queue status and provides UI feedback.
 * 
 * Features:
 * - Visibility-aware polling: pauses when tab is hidden, resumes when visible
 * - 30-second fallback polling interval (reduced from 10s for efficiency)
 * - Immediate refresh when tab becomes visible
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { getQueueStats, getQueuedCount } from '@/lib/pwa-queue';
import { isSyncNeeded, startSync } from '@/features/recordings/data/sync-service';
import { watchOnlineStatus } from '@/lib/online-status';
import { isSyncInProgress, triggerSyncDebounced } from '@/lib/sync-coordinator';

// Polling interval when tab is visible (reduced from 10s for efficiency)
const POLLING_INTERVAL_MS = 30000; // 30 seconds

interface UploadQueueState {
  queuedCount: number;
  isProcessing: boolean;
  isOnline: boolean;
  stats: {
    pending: number;
    failed: number;
    retryable: number;
    totalSize: number;
  } | null;
}

export function useUploadQueue() {
  const [state, setState] = useState<UploadQueueState>({
    queuedCount: 0,
    isProcessing: false,
    isOnline: navigator.onLine,
    stats: null,
  });
  
  // Track polling interval reference for cleanup
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll queue count periodically
  const refreshQueue = useCallback(async () => {
    try {
      const count = await getQueuedCount();
      const stats = await getQueueStats();
      
      setState(prev => ({
        ...prev,
        queuedCount: count,
        stats,
      }));
    } catch (error) {
      console.error('[use-upload-queue] Failed to refresh queue:', error);
    }
  }, []);

  // Attempt to sync queued uploads
  const syncQueue = useCallback(async () => {
    // Check coordinator state instead of local state
    if (isSyncInProgress() || state.isProcessing) {
      console.debug('[use-upload-queue] Sync already in progress');
      return;
    }

    const needsSync = await isSyncNeeded();
    if (!needsSync) {
      console.debug('[use-upload-queue] No sync needed');
      return;
    }

    setState(prev => ({ ...prev, isProcessing: true }));

    try {
      // Use debounced trigger from coordinator
      await triggerSyncDebounced('use-upload-queue', async () => {
        const result = await startSync();
        
        if (result.success > 0) {
          toast.success(`Successfully uploaded ${result.success} recording${result.success > 1 ? 's' : ''}`);
        }
        
        if (result.failed > 0) {
          toast.error(`Failed to upload ${result.failed} recording${result.failed > 1 ? 's' : ''}. Will retry later.`);
        }

        // Refresh queue state
        await refreshQueue();
        
        return result;
      });
    } catch (error) {
      console.error('[use-upload-queue] Sync failed:', error);
      toast.error('Failed to sync queued recordings');
    } finally {
      setState(prev => ({ ...prev, isProcessing: false }));
    }
  }, [state.isProcessing, refreshQueue]);

  // Watch online/offline status
  useEffect(() => {
    const cleanup = watchOnlineStatus((isOnline) => {
      console.debug('[use-upload-queue] Online status changed:', isOnline);
      
      setState(prev => ({ ...prev, isOnline }));

      // Automatically trigger sync when coming back online
      // Note: main.tsx already handles this via watchOnlineStatus,
      // but we keep this for redundancy and hook-specific behavior
      if (isOnline && state.queuedCount > 0) {
        // Use debounced trigger to coordinate with main.tsx sync
        triggerSyncDebounced('use-upload-queue-online', async () => {
          const result = await startSync();
          await refreshQueue();
          return result;
        }).catch(error => {
          console.error('[use-upload-queue] Online auto-sync failed:', error);
        });
      }
    });

    return cleanup;
  }, [state.queuedCount, syncQueue]);

  // Poll queue count every 30 seconds when tab is visible
  // Uses visibility-aware polling to reduce unnecessary API calls
  useEffect(() => {
    // Start polling if tab is visible
    const startPolling = () => {
      // Clear any existing interval
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      
      // Start new polling interval
      pollingIntervalRef.current = setInterval(() => {
        refreshQueue();
      }, POLLING_INTERVAL_MS);
    };
    
    // Stop polling when tab hidden
    const stopPolling = () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
    
    // Handle visibility changes
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Tab became visible - refresh immediately and resume polling
        refreshQueue();
        startPolling();
      } else {
        // Tab is hidden - stop polling
        stopPolling();
      }
    };

    // Initial load
    refreshQueue();
    
    // Start polling if tab is currently visible
    if (document.visibilityState === 'visible') {
      startPolling();
    }
    
    // Listen for visibility changes
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refreshQueue]);

  // Retry all failed recordings
  const retryAll = useCallback(async () => {
    await syncQueue();
  }, [syncQueue]);

  return {
    queuedCount: state.queuedCount,
    isProcessing: state.isProcessing,
    isOnline: state.isOnline,
    stats: state.stats,
    refreshQueue,
    syncQueue,
    retryAll,
  };
}
