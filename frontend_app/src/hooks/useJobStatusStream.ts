import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { getJobStatusStreamURL } from '@/features/recordings/data/api';
import { FetchError, streamWithAuth } from '@/shared/api/client/fetchClient';

export interface JobStreamEvent {
  status: string;
  job: any;
  timestamp: string;
  error?: string;
}

export interface UseJobStatusStreamOptions {
  onStatusChange?: (job: any) => void;
  onTranscriptionComplete?: () => void;
  onAnalysisComplete?: () => void;
  onJobComplete?: () => void;
  onError?: (error: string) => void;
  pollingInterval?: number; // seconds between polls (default 1)
}

export interface JobStreamResult {
  isConnected: boolean; // True when SSE connection is established
  isLoading: boolean; // True while job is processing (status in processing states)
}

/**
 * Parse Server-Sent Events format from response text
 * Handles multi-line SSE events like:
 * data: {"status": "transcribing"}
 * data: [next event]
 */
function parseSSEEvent(line: string): JobStreamEvent | null {
  if (!line.startsWith('data: ')) return null;
  try {
    const jsonStr = line.substring('data: '.length);
    return JSON.parse(jsonStr);
  } catch (e) {
    console.warn('Failed to parse SSE event:', e);
    return null;
  }
}

/**
 * Hook to stream real-time job status updates via SSE.
 * 
 * Uses fetch with manual SSE parsing for Azure Static Web Apps.
 * EventSource doesn't work reliably on SWA due to buffering and authentication issues.
 * 
 * Returns loading state that can be used to show UI feedback.
 * 
 * Usage:
 * ```tsx
 * const { isLoading, isConnected } = useJobStatusStream(jobId, ['uploaded', 'transcribing'], {
 *   onStatusChange: (job) => setRecording(job),
 *   onTranscriptionComplete: () => toast.success('Transcription done!'),
 * });
 * 
 * // Use in UI
 * {isLoading && <Skeleton />}
 * ```
 */
export function useJobStatusStream(
  jobId: string | null | undefined,
  enabledStatuses: Array<string> = ['uploaded', 'transcribing'],
  options: UseJobStatusStreamOptions = {},
  currentJobStatus?: string
): JobStreamResult {
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastStatusRef = useRef<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Don't connect if jobId is missing
    if (!jobId) {
      return;
    }

    // Skip SSE stream if job is already in a terminal state
    if (currentJobStatus === 'completed' || currentJobStatus === 'failed') {
      console.debug(`Skipping SSE stream for job ${jobId} - already ${currentJobStatus}`);
      return;
    }

    // If enabledStatuses is provided and currentJobStatus is not in that list, skip
    if (enabledStatuses.length > 0 && currentJobStatus && !enabledStatuses.includes(currentJobStatus)) {
      console.debug(`Skipping SSE stream for job ${jobId} - status ${currentJobStatus} not in enabled list`);
      return;
    }

    // Clean up previous connection
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Open SSE stream using fetch for Azure Static Web Apps.
    const openStream = async () => {
      try {
        console.debug(`Opening SSE stream for job ${jobId}`);
        const streamUrl = getJobStatusStreamURL(jobId);
        
        // Create abort controller for this stream
        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        // Use streamWithAuth for centralized fetch handling with proper credentials
        // This ensures consistent error handling and authentication across all API calls
        const response = await streamWithAuth(streamUrl, {
          headers: {
            'Accept': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',  // Help prevent buffering on proxies
          },
          signal: abortController.signal,
        });

        // streamWithAuth throws FetchError on non-ok status, no need to check response.ok

        setIsConnected(true);
        setIsLoading(true);
        console.debug(`✅ SSE stream opened for job ${jobId}`);

        // Read the response as a stream
        const reader = response.body?.getReader();
        if (!reader) {
          options.onError?.('Failed to read response stream');
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';

        // Process stream chunks
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          
          // Keep the last incomplete line in the buffer
          buffer = lines[lines.length - 1];

          // Process complete lines
          for (let i = 0; i < lines.length - 1; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const event = parseSSEEvent(line);
            if (!event) continue;

            // Handle errors from server
            if (event.error) {
              console.error('SSE error:', event.error);
              options.onError?.(event.error);
              return;
            }

            const newStatus = event.status;
            const job = event.job;

            // Track status transitions for specific callbacks
            if (newStatus !== lastStatusRef.current) {
              lastStatusRef.current = newStatus;

              // Call general status change callback
              if (job) {
                options.onStatusChange?.(job);
              }

              // Call specific status callbacks
              if (newStatus === 'transcribed') {
                options.onTranscriptionComplete?.();
                toast.success('Transcription complete! Starting analysis...');
                setIsLoading(false);
              } else if (newStatus === 'analysing') {
                toast.info('Analysing transcription...');
              } else if (newStatus === 'completed') {
                options.onAnalysisComplete?.();
                options.onJobComplete?.();
                toast.success('Analysis complete!');
                setIsLoading(false);
                return; // Close stream on completion
              } else if (newStatus === 'failed') {
                options.onError?.('Job processing failed');
                toast.error('Job processing failed');
                setIsLoading(false);
                return; // Close stream on failure
              } else if (newStatus === 'transcribing') {
                toast.info('Starting transcription...');
              }
            }
          }
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          console.debug(`SSE stream aborted for job ${jobId}`);
        } else if (error instanceof FetchError) {
          // Handle centralized fetch errors with normalized messages
          console.error('SSE connection failed:', error.normalized.userMessage);
          options.onError?.(error.normalized.userMessage);
        } else {
          console.error('Failed to establish SSE connection:', error);
          options.onError?.(error instanceof Error ? error.message : 'Connection failed');
        }
      } finally {
        setIsConnected(false);
        setIsLoading(false);
      }
    };

    openStream();

    // Cleanup: abort stream on unmount
    return () => {
      if (abortControllerRef.current) {
        console.debug(`Closing SSE stream for job ${jobId}`);
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
        setIsConnected(false);
        setIsLoading(false);
      }
    };
  }, [jobId, enabledStatuses.join(','), currentJobStatus]); // Depend on jobId, enabledStatuses, and current job status

  return { isConnected, isLoading };
}

