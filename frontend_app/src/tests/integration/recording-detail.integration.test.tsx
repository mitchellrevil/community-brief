/**
 * Recording Detail Integration Tests
 * 
 * Tests loading and interacting with recording details using MSW for API mocking.
 * Verifies: load recording → display transcript/analysis → reprocess triggers pending state
 */

import * as React from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, delay, http } from 'msw';
import { apiPath } from '../apiPaths';
import { renderWithProviders } from '../test-utils';
import { mockUsers } from '../providers/TestAuth';
import { integrationHandlers, mockData, server } from './setup';

// Simple component to test recording data loading
function RecordingDetailTestComponent({ jobId }: { jobId: string }) {
  const [recording, setRecording] = React.useState<any>(null);
  const [transcription, setTranscription] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isReprocessing, setIsReprocessing] = React.useState(false);

  React.useEffect(() => {
    const loadRecording = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        // Fetch job details
        const jobResponse = await fetch(apiPath(`/jobs/${jobId}`));
        if (!jobResponse.ok) {
          throw new Error('Failed to load recording');
        }
        const jobData = await jobResponse.json();
        setRecording(jobData);

        // Fetch transcription
        const transcriptResponse = await fetch(apiPath(`/jobs/${jobId}/transcription`));
        if (transcriptResponse.ok) {
          const transcriptData = await transcriptResponse.json();
          setTranscription(transcriptData.transcription);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setIsLoading(false);
      }
    };

    loadRecording();
  }, [jobId]);

  const handleReprocess = async () => {
    setIsReprocessing(true);
    
    try {
      const response = await fetch(apiPath(`/jobs/${jobId}/reprocess`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      
      if (!response.ok) {
        throw new Error('Failed to reprocess');
      }
      
      const data = await response.json();
      
      // Update recording with new status
      setRecording((prev: any) => ({
        ...prev,
        status: data.status,
        analysis_in_progress: true,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reprocess failed');
    } finally {
      setIsReprocessing(false);
    }
  };

  if (isLoading) {
    return <div data-testid="loading">Loading recording...</div>;
  }

  if (error) {
    return <div data-testid="error">{error}</div>;
  }

  if (!recording) {
    return <div data-testid="not-found">Recording not found</div>;
  }

  return (
    <div data-testid="recording-detail">
      <h1 data-testid="recording-title">{recording.title}</h1>
      <div data-testid="recording-status">{recording.status}</div>
      
      {recording.analysis_in_progress && (
        <div data-testid="analysis-pending" className="text-orange-500">
          Analysis in progress...
        </div>
      )}
      
      {/* Transcription section */}
      <div data-testid="transcription-section">
        <h2>Transcription</h2>
        {transcription ? (
          <div data-testid="transcription-content">{transcription}</div>
        ) : (
          <div data-testid="transcription-empty">No transcription available</div>
        )}
      </div>
      
      {/* Analysis section */}
      <div data-testid="analysis-section">
        <h2>Analysis</h2>
        {recording.analysis_text ? (
          <div data-testid="analysis-content">{recording.analysis_text}</div>
        ) : (
          <div data-testid="analysis-empty">No analysis available</div>
        )}
      </div>
      
      {/* Actions */}
      <div data-testid="actions">
        <button
          onClick={handleReprocess}
          disabled={isReprocessing || recording.analysis_in_progress}
          data-testid="reprocess-button"
        >
          {isReprocessing ? 'Reprocessing...' : 'Reprocess Analysis'}
        </button>
      </div>
    </div>
  );
}

describe('Recording Detail Integration Tests', () => {
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

  describe('Load and display recording', () => {
    it('loads and displays recording with transcript and analysis', async () => {
      const jobId = 'test-recording-123';
      
      // Set up handlers for complete recording data
      server.use(...integrationHandlers.recordingDetail.complete(jobId));

      renderWithProviders(<RecordingDetailTestComponent jobId={jobId} />, {
        auth: mockUsers.user,
      });

      // Wait for content to load
      await waitFor(() => {
        expect(screen.getByTestId('recording-detail')).toBeInTheDocument();
      }, { timeout: 3000 });

      // Verify recording title and status
      expect(screen.getByTestId('recording-title')).toHaveTextContent('Complete Recording');
      expect(screen.getByTestId('recording-status')).toHaveTextContent('completed');

      // Verify transcription is displayed
      const transcriptionContent = screen.getByTestId('transcription-content');
      expect(transcriptionContent).toBeInTheDocument();
      expect(transcriptionContent).toHaveTextContent('This is the full transcription');

      // Verify analysis is displayed
      const analysisContent = screen.getByTestId('analysis-content');
      expect(analysisContent).toBeInTheDocument();
      expect(analysisContent).toHaveTextContent('AI-generated analysis');

      // Reprocess button should be available
      expect(screen.getByTestId('reprocess-button')).toBeEnabled();
    });
  });

  describe('Reprocess analysis', () => {
    it('reprocess triggers new analysis and shows pending state', async () => {
      const jobId = 'reprocess-job-456';
      
      // Set up initial recording data
      server.use(
        http.get(apiPath(`/jobs/${jobId}`), async () => {
          await delay(30);
          return HttpResponse.json(mockData.job({
            id: jobId,
            status: 'completed',
            title: 'Recording to Reprocess',
            analysis_text: 'Original analysis content',
            analysis_in_progress: false,
          }));
        }),
        
        http.get(apiPath(`/jobs/${jobId}/transcription`), async () => {
          await delay(30);
          return HttpResponse.json({
            transcription: 'Some transcription text',
            segments: [],
          });
        }),
        
        // Reprocess endpoint
        http.post(apiPath(`/jobs/${jobId}/reprocess`), async () => {
          await delay(50);
          return HttpResponse.json({
            message: 'Job reprocessing started',
            job_id: jobId,
            status: 'analysing',
          });
        })
      );

      renderWithProviders(<RecordingDetailTestComponent jobId={jobId} />, {
        auth: mockUsers.user,
      });

      // Wait for content to load
      await waitFor(() => {
        expect(screen.getByTestId('recording-detail')).toBeInTheDocument();
      }, { timeout: 3000 });

      // Verify initial state - no pending indicator
      expect(screen.queryByTestId('analysis-pending')).not.toBeInTheDocument();
      expect(screen.getByTestId('recording-status')).toHaveTextContent('completed');

      // Click reprocess button
      const reprocessButton = screen.getByTestId('reprocess-button');
      expect(reprocessButton).toBeEnabled();
      await user.click(reprocessButton);

      // Button should show reprocessing state temporarily
      await waitFor(() => {
        expect(screen.getByTestId('reprocess-button')).toHaveTextContent('Reprocessing...');
      });

      // After reprocess completes, should show pending state
      await waitFor(() => {
        expect(screen.getByTestId('analysis-pending')).toBeInTheDocument();
      }, { timeout: 3000 });

      // Status should update to analysing
      expect(screen.getByTestId('recording-status')).toHaveTextContent('analysing');

      // Button should be disabled while analysis is in progress
      expect(screen.getByTestId('reprocess-button')).toBeDisabled();
    });
  });
});
