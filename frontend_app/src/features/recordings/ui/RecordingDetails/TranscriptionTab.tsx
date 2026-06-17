import { AlertCircle, Download, Loader2, RefreshCw } from 'lucide-react';
import type { TranscriptionSegment } from '@/lib/transcription-parser';
import { TranscriptionViewer } from '@/features/recordings/ui/TranscriptionViewer';
import { Button } from '@/components/ui/button';

interface TranscriptionTabProps {
  transcriptionText: string | undefined;
  isProcessing: boolean;
  shouldShowError: boolean;
  error: any;
  isRecent: boolean;
  transcriptionFilePath: string | undefined;
  onRefetch: () => void;
  onSegmentClick?: (segment: TranscriptionSegment) => void;
  onDownload: (url: string, fileName: string) => void;
  compact: boolean;
  isMobile: boolean;
  isTinyScreen: boolean;
}

/**
 * Transcription tab content with loading, error, and content states
 * Handles all transcription-related UI logic
 */
export function TranscriptionTab({
  transcriptionText,
  isProcessing,
  shouldShowError,
  error,
  isRecent,
  transcriptionFilePath,
  onRefetch,
  onSegmentClick,
  onDownload,
  compact,
  isMobile,
  isTinyScreen,
}: TranscriptionTabProps) {
  if (isProcessing) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4 animate-in fade-in duration-500">
        <div className="rounded-full bg-primary/10 p-3 animate-pulse">
          <Loader2 className="h-6 w-6 text-primary animate-spin" />
        </div>
        <div className="text-center space-y-2">
          <h3 className="font-medium">Processing transcription...</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            {isRecent
              ? 'Our AI is carefully converting speech to text. Please check back in a few minutes.'
              : 'This recording is being processed. Transcription may take longer for older recordings.'}
          </p>
        </div>
      </div>
    );
  }

  if (shouldShowError) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4 animate-in fade-in duration-500">
        <div className="rounded-full bg-destructive/10 p-3 animate-pulse">
          <AlertCircle className="h-6 w-6 text-destructive" />
        </div>
        <div className="text-center space-y-2">
          <h3 className="font-medium">Transcription processing failed</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            {error instanceof Error ? error.message : 'Unable to process the audio transcription at this time'}
          </p>
        </div>
        <Button onClick={onRefetch} variant="outline" disabled={isProcessing} className="transition-all duration-200 hover:scale-105">
          <RefreshCw className="mr-2 h-4 w-4" />
          Try Again
        </Button>
      </div>
    );
  }

  if (typeof transcriptionText === "string" && transcriptionText.length > 0) {
    return (
      <div className="animate-in slide-in-from-bottom duration-700 space-y-4">
        <TranscriptionViewer transcriptionText={transcriptionText} onSegmentClick={onSegmentClick} compact={compact} />
        {transcriptionFilePath && !isMobile && (
          <Button
            onClick={() => onDownload(transcriptionFilePath, 'Transcription')}
            variant="outline"
            className="w-full transition-all duration-200 hover:scale-105"
          >
            <Download className="h-4 w-4 mr-2" />
            <span className={isTinyScreen ? 'text-xs' : ''}>Download Transcription</span>
          </Button>
        )}
      </div>
    );
  }

  // Default loading state - transcription is being processed
  return (
    <div className="flex flex-col items-center justify-center py-12 space-y-4 animate-in fade-in duration-500">
      <div className="rounded-full bg-primary/10 p-3 animate-pulse">
        <Loader2 className="h-6 w-6 text-primary animate-spin" />
      </div>
      <div className="text-center space-y-2">
        <h3 className="font-medium">Processing transcription...</h3>
        <p className="text-sm text-muted-foreground max-w-md">
          {isRecent
            ? 'Our AI is carefully converting speech to text. Please check back in a few minutes.'
            : 'This recording is being processed. Transcription may take longer for older recordings.'}
        </p>
      </div>
    </div>
  );
}
