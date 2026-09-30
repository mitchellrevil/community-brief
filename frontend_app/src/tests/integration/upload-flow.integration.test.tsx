/**
 * Upload Flow Integration Tests
 * 
 * Tests the complete upload lifecycle using MSW for API mocking.
 * Verifies: file selection → upload → completion → job display
 */

import * as React from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, delay, http } from 'msw';
import { apiPath } from '../apiPaths';
import { renderWithProviders } from '../test-utils';
import { mockUsers } from '../providers/TestAuth';
import { integrationHandlers, mockData, server } from './setup';

// Mock the FileDropzone's drag-drop functionality
const createMockFile = (name: string, type: string, size: number = 1024): File => {
  const blob = new Blob(['mock file content'], { type });
  return new File([blob], name, { type, lastModified: Date.now() });
};

// Simple test component to verify upload API flow works
function UploadTestComponent() {
  const [status, setStatus] = React.useState<'idle' | 'uploading' | 'completed' | 'error'>('idle');
  const [jobId, setJobId] = React.useState<string | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const handleUpload = async () => {
    setStatus('uploading');
    setErrorMessage(null);
    
    try {
      // Step 1: Request upload token
      const tokenResponse = await fetch(apiPath('/upload/request-token'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: 'test-audio.mp3', content_type: 'audio/mpeg' }),
      });
      
      if (!tokenResponse.ok) {
        const error = await tokenResponse.json();
        throw new Error(error.message || 'Failed to get upload token');
      }
      
      const tokenData = await tokenResponse.json();
      
      // Step 2: Complete upload
      const completeResponse = await fetch(apiPath('/upload/complete'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: tokenData.job_id }),
      });
      
      if (!completeResponse.ok) {
        throw new Error('Failed to complete upload');
      }
      
      const completeData = await completeResponse.json();
      setJobId(completeData.job_id);
      setStatus('completed');
    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Upload failed');
    }
  };

  const handleRetry = () => {
    setStatus('idle');
    setErrorMessage(null);
    setJobId(null);
  };

  return (
    <div data-testid="upload-test-component">
      <div data-testid="upload-status">{status}</div>
      {jobId && <div data-testid="job-id">{jobId}</div>}
      {errorMessage && <div data-testid="error-message">{errorMessage}</div>}
      
      {status === 'idle' && (
        <button onClick={handleUpload} data-testid="upload-button">
          Start Upload
        </button>
      )}
      
      {status === 'uploading' && (
        <div data-testid="upload-progress">Uploading...</div>
      )}
      
      {status === 'error' && (
        <button onClick={handleRetry} data-testid="retry-button">
          Retry Upload
        </button>
      )}
      
      {status === 'completed' && (
        <div data-testid="upload-success">Upload completed!</div>
      )}
    </div>
  );
}

// Cancel upload test component
function CancelableUploadComponent() {
  const [status, setStatus] = React.useState<'idle' | 'uploading' | 'cancelled' | 'completed'>('idle');
  const abortControllerRef = React.useRef<AbortController | null>(null);
  const isCancelledRef = React.useRef(false);

  const handleUpload = async () => {
    setStatus('uploading');
    isCancelledRef.current = false;
    abortControllerRef.current = new AbortController();
    
    // Listen for abort signal
    abortControllerRef.current.signal.addEventListener('abort', () => {
      isCancelledRef.current = true;
      setStatus('cancelled');
    });
    
    try {
      const response = await fetch(apiPath('/upload/request-token'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: 'test.mp3' }),
        signal: abortControllerRef.current.signal,
      });
      
      // Check if cancelled during fetch
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (isCancelledRef.current) {
        return;
      }
      
      if (response.ok) {
        setStatus('completed');
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setStatus('cancelled');
      }
    }
  };

  const handleCancel = () => {
    abortControllerRef.current?.abort();
  };

  return (
    <div data-testid="cancelable-upload">
      <div data-testid="upload-status">{status}</div>
      
      {status === 'idle' && (
        <button onClick={handleUpload} data-testid="start-button">
          Start Upload
        </button>
      )}
      
      {status === 'uploading' && (
        <>
          <div data-testid="upload-in-progress">Uploading...</div>
          <button onClick={handleCancel} data-testid="cancel-button">
            Cancel
          </button>
        </>
      )}
      
      {status === 'cancelled' && (
        <div data-testid="upload-cancelled">Upload was cancelled</div>
      )}
    </div>
  );
}

describe('Upload Flow Integration Tests', () => {
  const user = userEvent.setup();

  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'warn' });
  });

  afterEach(() => {
    server.resetHandlers();
  });

  afterAll(() => {
    server.close();
  });

  describe('Complete upload lifecycle', () => {
    it('successfully completes upload flow: request token → complete → show job', async () => {
      // Set up handlers for complete upload flow
      server.use(...integrationHandlers.uploadComplete.success('test-job-abc'));

      renderWithProviders(<UploadTestComponent />, {
        auth: mockUsers.user,
      });

      await waitFor(() => {
        expect(screen.getByTestId('upload-status')).toHaveTextContent('idle');
      });

      const uploadButton = await screen.findByTestId('upload-button');
      await user.click(uploadButton);

      // Should show uploading state
      await waitFor(() => {
        expect(screen.getByTestId('upload-status')).toHaveTextContent('uploading');
      });

      // Wait for completion
      await waitFor(() => {
        expect(screen.getByTestId('upload-status')).toHaveTextContent('completed');
      }, { timeout: 3000 });

      // Should display job ID
      expect(screen.getByTestId('job-id')).toHaveTextContent('test-job-abc');
      expect(screen.getByTestId('upload-success')).toBeInTheDocument();
    });
  });

  describe('Upload failure and retry', () => {
    it('shows error UI and allows retry when upload fails with 500 error', async () => {
      // Set up server error handler
      server.use(...integrationHandlers.uploadComplete.serverError());

      renderWithProviders(<UploadTestComponent />, {
        auth: mockUsers.user,
      });

      const initialUploadButton = await screen.findByTestId('upload-button');
      await user.click(initialUploadButton);

      // Wait for error state
      await waitFor(() => {
        expect(screen.getByTestId('upload-status')).toHaveTextContent('error');
      }, { timeout: 3000 });

      // Should show error message
      expect(screen.getByTestId('error-message')).toBeInTheDocument();

      // Retry button should be available
      const retryButton = screen.getByTestId('retry-button');
      expect(retryButton).toBeInTheDocument();

      // Now set up success handlers for retry
      server.use(...integrationHandlers.uploadComplete.success('retry-job-123'));

      // Click retry
      await user.click(retryButton);

      // Should reset to idle first
      expect(screen.getByTestId('upload-status')).toHaveTextContent('idle');

      // Start upload again
      await user.click(screen.getByTestId('upload-button'));

      // Wait for success
      await waitFor(() => {
        expect(screen.getByTestId('upload-status')).toHaveTextContent('completed');
      }, { timeout: 3000 });

      expect(screen.getByTestId('job-id')).toHaveTextContent('retry-job-123');
    });
  });

  describe('Cancel upload in progress', () => {
    it('allows cancelling an upload that is in progress', async () => {
      // Set up slow handler to give time to cancel
      server.use(
        http.post(apiPath('/upload/request-token'), async () => {
          await delay(5000); // Very slow response - will be aborted
          return HttpResponse.json(mockData.uploadToken());
        })
      );

      renderWithProviders(<CancelableUploadComponent />, {
        auth: mockUsers.user,
      });

      await waitFor(() => {
        expect(screen.getByTestId('upload-status')).toHaveTextContent('idle');
      });

      // Start upload
      await user.click(screen.getByTestId('start-button'));

      // Should show uploading state with cancel button
      await waitFor(() => {
        expect(screen.getByTestId('upload-status')).toHaveTextContent('uploading');
      });

      expect(screen.getByTestId('upload-in-progress')).toBeInTheDocument();
      const cancelButton = screen.getByTestId('cancel-button');
      expect(cancelButton).toBeInTheDocument();

      // Cancel the upload - this triggers the abort signal
      await user.click(cancelButton);

      // Should show cancelled state (immediately via event listener)
      await waitFor(() => {
        expect(screen.getByTestId('upload-status')).toHaveTextContent('cancelled');
      }, { timeout: 1000 });

      expect(screen.getByTestId('upload-cancelled')).toBeInTheDocument();
    });
  });
});
