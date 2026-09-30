/**
 * Offline Indicator Component
 * 
 * Shows a minimal, non-intrusive banner when the app is offline
 * and displays the count of queued recordings waiting to upload.
 */

import { useEffect, useState } from 'react';
import { Cloud, Loader2, WifiOff } from 'lucide-react';
import { useUploadQueue } from '@/hooks/useUploadQueue';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export function OfflineIndicator() {
  const { isOnline, queuedCount, isProcessing, syncQueue } = useUploadQueue();
  const [queueSize, setQueueSize] = useState<string>('');

  // Get queue size for display
  useEffect(() => {
    const getSize = async () => {
      try {
        const { getQueueStats } = await import('@/lib/pwa-queue');
        const stats = await getQueueStats();
        if (typeof stats.totalSize === 'number') {
          const sizeMB = (stats.totalSize / (1024 * 1024)).toFixed(1);
          setQueueSize(sizeMB);
        }
      } catch (error) {
        // Silently handle errors getting queue stats
        console.debug('Failed to get queue stats:', error);
      }
    };
    if (queuedCount > 0) {
      getSize();
    }
  }, [queuedCount]);

  // Don't show anything if online and no queued items
  if (isOnline && queuedCount === 0) {
    return null;
  }

  // Show syncing status
  if (isOnline && isProcessing) {
    return (
      <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800 mx-2 sm:mx-4 my-2 rounded-lg">
        <div className="flex items-start gap-3">
          <Loader2 className="h-4 w-4 mt-0.5 flex-shrink-0 animate-spin text-blue-600 dark:text-blue-400" />
          <AlertDescription className="text-blue-800 dark:text-blue-200 text-sm sm:text-base flex-1 break-words">
            Syncing {queuedCount} recording{queuedCount !== 1 ? 's' : ''}{queueSize && ` (${queueSize}MB)`}...
          </AlertDescription>
        </div>
      </Alert>
    );
  }

  // Show queued but online (not syncing)
  if (isOnline && queuedCount > 0 && !isProcessing) {
    return (
      <Alert className="border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800 mx-2 sm:mx-4 my-2 rounded-lg">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <Cloud className="h-4 w-4 mt-0.5 flex-shrink-0 text-green-600 dark:text-green-400" />
            <AlertDescription className="text-green-800 dark:text-green-200 text-sm sm:text-base flex-1 break-words">
              {queuedCount} recording{queuedCount !== 1 ? 's' : ''}{queueSize && ` (${queueSize}MB)`} waiting to upload
            </AlertDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={syncQueue}
            className="h-7 text-xs flex-shrink-0 whitespace-nowrap"
          >
            Upload Now
          </Button>
        </div>
      </Alert>
    );
  }

  // Show offline status
  if (!isOnline) {
    return (
      <Alert className="border-orange-200 bg-orange-50 dark:bg-orange-950 dark:border-orange-800 mx-2 sm:mx-4 my-2 rounded-lg">
        <div className="space-y-2">
          <div className="flex items-start gap-3">
            <WifiOff className="h-4 w-4 mt-0.5 flex-shrink-0 text-orange-600 dark:text-orange-400" />
            <div className="flex-1 min-w-0">
              <AlertDescription className="text-orange-800 dark:text-orange-200 text-sm sm:text-base font-medium break-words">
                You're offline
              </AlertDescription>
              {queuedCount > 0 && (
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary" className="text-xs">
                    {queuedCount} queued{queueSize && ` • ${queueSize}MB`}
                  </Badge>
                </div>
              )}
              <p className="text-xs sm:text-sm text-orange-700 dark:text-orange-300 mt-2 break-words">
                Recordings will upload automatically when connection is restored
              </p>
            </div>
          </div>
        </div>
      </Alert>
    );
  }

  return null;
}
