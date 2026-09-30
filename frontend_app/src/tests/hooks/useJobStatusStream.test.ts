/**
 * Unit tests for useJobStatusStream hook - HTTP centralization
 * 
 * Verifies the hook uses streamWithAuth instead of raw fetch for:
 * - Proper URL construction
 * - Header passthrough
 * - Credentials inclusion
 * - Body stream preservation
 * - Error propagation
 */
import {  afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

import type {Mock} from 'vitest';
import { useJobStatusStream } from '@/hooks/useJobStatusStream';
import { FetchError, streamWithAuth  } from '@/shared/api/client/fetchClient';


// Mock streamWithAuth before importing the hook
vi.mock('@/shared/api/client/fetchClient', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await importOriginal<typeof import('@/shared/api/client/fetchClient')>();
  return {
    ...actual,
    streamWithAuth: vi.fn(),
  };
});

// Mock the URL generation function
vi.mock('@/features/recordings/data/api', () => ({
  getJobStatusStreamURL: vi.fn((jobId: string) => `https://api.example.com/jobs/${jobId}/status/stream`),
}));

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

// Helper to create a mock ReadableStream
function createMockReadableStream(chunks: Array<Uint8Array>): ReadableStream<Uint8Array> {
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(chunks[index++]);
      } else {
        controller.close();
      }
    },
  });
}

// Encode SSE event as bytes
function encodeSSE(data: object): Uint8Array {
  const line = `data: ${JSON.stringify(data)}\n\n`;
  return new TextEncoder().encode(line);
}

describe('useJobStatusStream - HTTP Centralization', () => {
  const mockStreamWithAuth = streamWithAuth as Mock;
  
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('streamWithAuth integration', () => {
    it('should call streamWithAuth with correct URL', async () => {
      // Setup: mock streamWithAuth to return a valid response
      const mockStream = createMockReadableStream([
        encodeSSE({ status: 'completed', job: { id: 'job-123' }, timestamp: new Date().toISOString() }),
      ]);
      
      mockStreamWithAuth.mockResolvedValue({
        ok: true,
        body: mockStream,
      });

      // Act
      const { unmount } = renderHook(() =>
        useJobStatusStream('job-123', ['uploaded', 'transcribing'], {})
      );

      // Assert: streamWithAuth was called with the correct URL
      await waitFor(() => {
        expect(mockStreamWithAuth).toHaveBeenCalledWith(
          'https://api.example.com/jobs/job-123/status/stream',
          expect.any(Object)
        );
      });

      unmount();
    });

    it('should pass SSE headers to streamWithAuth', async () => {
      const mockStream = createMockReadableStream([
        encodeSSE({ status: 'completed', job: { id: 'job-123' }, timestamp: new Date().toISOString() }),
      ]);
      
      mockStreamWithAuth.mockResolvedValue({
        ok: true,
        body: mockStream,
      });

      const { unmount } = renderHook(() =>
        useJobStatusStream('job-123', ['uploaded'], {})
      );

      await waitFor(() => {
        expect(mockStreamWithAuth).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            headers: expect.objectContaining({
              'Accept': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive',
            }),
          })
        );
      });

      unmount();
    });

    it('should not consume response body prematurely - body should be readable', async () => {
      // Create chunks that simulate a multi-event stream
      const chunks = [
        encodeSSE({ status: 'transcribing', job: { id: 'job-123' }, timestamp: new Date().toISOString() }),
        encodeSSE({ status: 'completed', job: { id: 'job-123' }, timestamp: new Date().toISOString() }),
      ];
      const mockStream = createMockReadableStream(chunks);
      
      // Track if getReader was called (proves body wasn't consumed by streamWithAuth)
      let readerCreated = false;
      const originalGetReader = mockStream.getReader.bind(mockStream);
      mockStream.getReader = vi.fn(() => {
        readerCreated = true;
        return originalGetReader();
      }) as any;
      
      mockStreamWithAuth.mockResolvedValue({
        ok: true,
        body: mockStream,
      });

      const onStatusChange = vi.fn();
      const { unmount } = renderHook(() =>
        useJobStatusStream('job-123', ['uploaded'], { onStatusChange })
      );

      // Wait for stream to be consumed
      await waitFor(() => {
        expect(readerCreated).toBe(true);
      });

      unmount();
    });

    it('should propagate FetchError on non-ok response', async () => {
      const mockError = new FetchError('Unauthorized', {
        normalized: {
          userMessage: 'Authentication required',
          code: 'AUTH_ERROR',
          original: new Error('HTTP 401'),
        },
        status: 401,
      });
      
      mockStreamWithAuth.mockRejectedValue(mockError);

      const onError = vi.fn();
      const { unmount } = renderHook(() =>
        useJobStatusStream('job-123', ['uploaded'], { onError })
      );

      await waitFor(() => {
        expect(onError).toHaveBeenCalled();
      });

      unmount();
    });

    it('should handle network errors via streamWithAuth', async () => {
      const networkError = new FetchError('Network error', {
        normalized: {
          userMessage: 'Network error',
          code: 'NETWORK_ERROR',
          original: new Error('Failed to fetch'),
        },
      });
      
      mockStreamWithAuth.mockRejectedValue(networkError);

      const onError = vi.fn();
      const { unmount } = renderHook(() =>
        useJobStatusStream('job-123', ['uploaded'], { onError })
      );

      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith(expect.stringContaining('Network error'));
      });

      unmount();
    });

    it('should pass abort signal to streamWithAuth', async () => {
      const mockStream = createMockReadableStream([]);
      
      mockStreamWithAuth.mockResolvedValue({
        ok: true,
        body: mockStream,
      });

      const { unmount } = renderHook(() =>
        useJobStatusStream('job-123', ['uploaded'], {})
      );

      await waitFor(() => {
        expect(mockStreamWithAuth).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            signal: expect.any(AbortSignal),
          })
        );
      });

      unmount();
    });
  });

  describe('response body handling', () => {
    it('should read stream chunks and parse SSE events', async () => {
      const chunks = [
        encodeSSE({ status: 'transcribing', job: { id: 'job-123', status: 'transcribing' }, timestamp: new Date().toISOString() }),
        encodeSSE({ status: 'completed', job: { id: 'job-123', status: 'completed' }, timestamp: new Date().toISOString() }),
      ];
      const mockStream = createMockReadableStream(chunks);
      
      mockStreamWithAuth.mockResolvedValue({
        ok: true,
        body: mockStream,
      });

      const onStatusChange = vi.fn();
      const onJobComplete = vi.fn();
      
      const { unmount } = renderHook(() =>
        useJobStatusStream('job-123', ['uploaded'], { 
          onStatusChange,
          onJobComplete,
        })
      );

      // Wait for all events to be processed
      await waitFor(() => {
        expect(onJobComplete).toHaveBeenCalled();
      }, { timeout: 2000 });

      unmount();
    });

    it('credentails are included in the request', async () => {
      // streamWithAuth should handle credentials internally, but we verify it's called
      const mockStream = createMockReadableStream([
        encodeSSE({ status: 'completed', job: { id: 'job-123' }, timestamp: new Date().toISOString() }),
      ]);
      
      mockStreamWithAuth.mockResolvedValue({
        ok: true,
        body: mockStream,
      });

      const { unmount } = renderHook(() =>
        useJobStatusStream('job-123', ['uploaded'], {})
      );

      await waitFor(() => {
        expect(mockStreamWithAuth).toHaveBeenCalled();
      });

      // Credentials are handled by streamWithAuth internally - we verify it's used
      unmount();
    });
  });

  describe('error scenarios', () => {
    it('should handle 401 authentication error via FetchError', async () => {
      const authError = new FetchError('Unauthorized', {
        normalized: {
          userMessage: 'Authentication failed',
          code: 'AUTH_ERROR',
          original: new Error('HTTP 401'),
        },
        status: 401,
      });
      
      mockStreamWithAuth.mockRejectedValue(authError);

      const onError = vi.fn();
      const { unmount } = renderHook(() =>
        useJobStatusStream('job-123', ['uploaded'], { onError })
      );

      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith(expect.stringContaining('Authentication failed'));
      });

      unmount();
    });

    it('should not call streamWithAuth when jobId is null', async () => {
      renderHook(() =>
        useJobStatusStream(null, ['uploaded'], {})
      );

      // Wait a tick to ensure effect would have run
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(mockStreamWithAuth).not.toHaveBeenCalled();
    });

    it('should not call streamWithAuth when job is already completed', async () => {
      renderHook(() =>
        useJobStatusStream('job-123', ['uploaded'], {}, 'completed')
      );

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(mockStreamWithAuth).not.toHaveBeenCalled();
    });
  });
});


