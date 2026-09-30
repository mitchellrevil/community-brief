import { useEffect, useState } from 'react';
import { RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { QueuedRecording } from '@/lib/pwa-queue';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getPendingRecordings, markRecordingFailed } from '@/lib/pwa-queue';
import { startSync } from '@/features/recordings/data/sync-service';
import { isSyncInProgress, triggerSyncImmediate } from '@/lib/sync-coordinator';

export function QueuedRecordingsList() {
  const [queuedRecordings, setQueuedRecordings] = useState<Array<QueuedRecording>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    loadQueuedRecordings();
    
    // Refresh queued recordings every 5 seconds
    const interval = setInterval(loadQueuedRecordings, 5000);
    return () => clearInterval(interval);
  }, []);

  async function loadQueuedRecordings() {
    try {
      const pending = await getPendingRecordings();
      setQueuedRecordings(pending);
    } catch (error) {
      console.error('Failed to load queued recordings:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRetry() {
    // Check if sync is already in progress
    if (isSyncInProgress()) {
      toast.info('Upload already in progress');
      return;
    }
    
    try {
      setIsSyncing(true);
      // Use triggerSyncImmediate for user-initiated manual sync
      const result = await triggerSyncImmediate('manual-retry', async () => {
        return await startSync();
      });
      
      if (result) {
        toast.success(`Sync complete`, {
          description: `${result.success} uploaded, ${result.failed} failed`,
        });
      }
      
      await loadQueuedRecordings();
    } catch (error) {
      console.error('Sync failed:', error);
      toast.error('Sync failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleRemove(recordingId: string) {
    try {
      await markRecordingFailed(recordingId, 'Manually removed by user');
      toast.success('Recording removed from queue');
      await loadQueuedRecordings();
    } catch (error) {
      console.error('Failed to remove recording:', error);
      toast.error('Failed to remove recording');
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-600"></div>
      </div>
    );
  }

  if (queuedRecordings.length === 0) {
    return (
      <Alert>
        <AlertDescription>No queued recordings at the moment</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold">Queued for Upload</h3>
          <p className="text-sm text-gray-600">
            {queuedRecordings.length} recording{queuedRecordings.length === 1 ? '' : 's'} waiting to upload
          </p>
        </div>
        <Button
          onClick={handleRetry}
          disabled={isSyncing}
          variant="outline"
          size="sm"
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          {isSyncing ? 'Syncing...' : 'Retry Now'}
        </Button>
      </div>

      <div className="grid gap-4">
        {queuedRecordings.map((recording) => (
          <Card key={recording.id}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-base">{recording.metadata.categoryName}</CardTitle>
                  <p className="text-sm text-gray-600">
                    {recording.metadata.subcategoryName}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={recording.status === 'pending' ? 'default' : 'destructive'}>
                    {recording.status}
                  </Badge>
                  {recording.retryCount > 0 && (
                    <Badge variant="outline">
                      {recording.retryCount} attempt{recording.retryCount === 1 ? '' : 's'}
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-600">File Size</p>
                  <p className="font-medium">{(recording.blob.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
                <div>
                  <p className="text-gray-600">Queued</p>
                  <p className="font-medium">
                    {new Date(recording.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>

              {recording.lastAttempt && (
                <div>
                  <p className="text-sm text-gray-600">Last Attempt</p>
                  <p className="text-sm font-medium">
                    {new Date(recording.lastAttempt).toLocaleString()}
                  </p>
                </div>
              )}

              {recording.error && (
                <Alert>
                  <AlertDescription className="text-sm">{recording.error}</AlertDescription>
                </Alert>
              )}

              <div className="flex gap-2">
                <Button
                  onClick={() => handleRemove(recording.id)}
                  variant="outline"
                  size="sm"
                  className="flex-1"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Remove
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
