/**
 * RecordingDetailsPage Popover State Management Tests
 *
 * Tests for the popover state management triggered by SSE status changes
 * and localStorage persistence of dismissal.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RecordingDetailsPage } from '@/features/recordings/ui/RecordingDetails/RecordingDetailsPage';

// Storage key constant (matching implementation - user-scoped and recording-scoped)
const getStorageKey = (userId: string, recordingId: string) => `community-brief:${userId}:transcription-popover-dismissed:${recordingId}`;

// Mock the hooks and dependencies
const mockRecordingData: { recording: Record<string, any>; [key: string]: any } = {
  recording: {
    id: 'job-123',
    user_id: 'user-456',
    file_path: 'https://example.com/audio.mp3',
    transcription_file_path: null,
    analysis_file_path: null,
    status: 'transcribed',
    prompt_category_id: 'cat-1',
    prompt_subcategory_id: 'sub-1',
    created_at: Date.now(),
    updated_at: Date.now(),
  },
  transcriptionText: 'Test transcription',
  isLoading: false,
  isError: false,
  error: null,
  isTranscriptionProcessing: false,
  shouldShowTranscriptionError: false,
  transcriptionError: null,
  refetchTranscription: vi.fn(),
  getCategoryName: vi.fn(() => 'Test Category'),
  getSubcategoryName: vi.fn(() => 'Test Subcategory'),
};
const defaultRecording = { ...mockRecordingData.recording };
let mockCurrentUser = {
  user_id: 'user-456',
  email: 'test@example.com',
  permission: 'User',
};

vi.mock('@/features/recordings/ui/RecordingDetails/hooks/useRecordingData', () => ({
  useRecordingData: () => mockRecordingData,
}));

vi.mock('@/features/recordings/ui/RecordingDetails/hooks/useRecordingActions', () => ({
  useRecordingActions: () => ({
    deleteDialogOpen: false,
    setDeleteDialogOpen: vi.fn(),
    shareDialogOpen: false,
    setShareDialogOpen: vi.fn(),
    handleDownload: vi.fn(),
    copyToClipboard: vi.fn(),
  }),
}));

// Mock job status stream with callback capture
let capturedOnStatusChange: ((job: any) => void) | undefined;
vi.mock('@/hooks/useJobStatusStream', () => ({
  useJobStatusStream: (
    _jobId: string | null | undefined,
    _enabledStatuses: Array<string>,
    options: { onStatusChange?: (job: any) => void },
  ) => {
    capturedOnStatusChange = options.onStatusChange;
    return { isConnected: true, isLoading: false };
  },
}));

vi.mock('@/hooks/usePermissions', () => ({
  useUserPermissions: () => ({
    data: mockCurrentUser,
  }),
}));

vi.mock('@/hooks/useMobile', () => ({
  useIsMobile: () => false,
}));

vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ id: 'job-123' }),
  useNavigate: () => vi.fn(),
  Link: ({ children, ...props }: any) => <a {...props}>{children}</a>,
}));

// Mock child components to simplify testing
vi.mock('@/features/recordings/ui/RecordingDetails/RecordingHeader', () => ({
  RecordingHeader: ({ showTranscriptionPopover, onDismissTranscriptionPopover }: any) => (
    <div data-testid="recording-header">
      <span data-testid="popover-visible">{String(showTranscriptionPopover)}</span>
      {showTranscriptionPopover && (
        <button
          data-testid="dismiss-popover"
          onClick={onDismissTranscriptionPopover}
        >
          Dismiss
        </button>
      )}
    </div>
  ),
}));

vi.mock('@/features/recordings/ui/RecordingDetails/AudioPlayerCard', () => ({
  AudioPlayerCard: () => <div data-testid="audio-player" />,
}));

vi.mock('@/features/recordings/ui/RecordingDetails/ContentTabs', () => ({
  ContentTabs: ({ canEdit, onReprocess }: any) => (
    <div data-testid="content-tabs" data-can-edit={String(canEdit)}>
      {canEdit && <button type="button">Edit Analysis</button>}
      {onReprocess && <button type="button">Reprocess from tabs</button>}
    </div>
  ),
}));

vi.mock('@/features/recordings/ui/RecordingDetails/RecordingDetailsCard', () => ({
  RecordingDetailsCard: () => <div data-testid="details-card" />,
}));

vi.mock('@/features/recordings/ui/RecordingDetails/RecordingActionsCard', () => ({
  RecordingActionsCard: ({ canDelete, canManageSharing, onReprocess }: any) => (
    <div
      data-testid="actions-card"
      data-can-delete={String(canDelete)}
      data-can-manage-sharing={String(canManageSharing)}
    >
      {onReprocess && <button type="button">Reprocess Analysis</button>}
      {canDelete && <button type="button">Delete Recording</button>}
    </div>
  ),
}));

vi.mock('@/features/recordings/ui/RecordingDetails/ChatInterface', () => ({
  ChatInterface: () => null,
}));

vi.mock('@/features/recordings/ui/JobDeleteDialog', () => ({
  JobDeleteDialog: () => null,
}));

vi.mock('@/features/recordings/ui/JobShareDialog', () => ({
  JobShareDialog: () => null,
}));

vi.mock('@/features/recordings/ui/ReprocessAnalysisDialog', () => ({
  ReprocessAnalysisDialog: () => null,
}));

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

function renderWithProviders(ui: React.ReactElement, queryClient = createQueryClient()) {
  return {
    ...render(
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    ),
    queryClient,
  };
}

describe('RecordingDetailsPage Popover State', () => {
  let localStorageMock: Record<string, string>;

  beforeEach(() => {
    // Reset localStorage mock
    localStorageMock = {};
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(
      (key: string) => localStorageMock[key] ?? null
    );
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(
      (key: string, value: string) => {
        localStorageMock[key] = value;
      }
    );

    // Reset recording data to default (transcribed status)
    mockRecordingData.recording = { ...defaultRecording };
    mockCurrentUser = {
      user_id: 'user-456',
      email: 'test@example.com',
      permission: 'User',
    };
    capturedOnStatusChange = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  describe('popover state management', () => {
    it('should pass showTranscriptionPopover prop to RecordingHeader', async () => {
      renderWithProviders(<RecordingDetailsPage />);

      await waitFor(() => {
        expect(screen.getByTestId('recording-header')).toBeInTheDocument();
      });

      // Check that the prop is passed (initially false until status change triggers it)
      expect(screen.getByTestId('popover-visible')).toBeInTheDocument();
    });

    it('should show popover when status changes to transcribed', async () => {
      // Start with 'transcribing' status
      mockRecordingData.recording.status = 'transcribing';

      renderWithProviders(<RecordingDetailsPage />);

      await waitFor(() => {
        expect(screen.getByTestId('recording-header')).toBeInTheDocument();
      });

      // Simulate SSE status change to 'transcribed'
      act(() => {
        if (capturedOnStatusChange) {
          capturedOnStatusChange({
            ...mockRecordingData.recording,
            status: 'transcribed',
          });
        }
      });

      await waitFor(() => {
        expect(screen.getByTestId('popover-visible').textContent).toBe('true');
      });
    });

    it('should not show popover if already dismissed in localStorage', async () => {
      // Pre-dismiss the popover for this user+recording
      const storageKey = getStorageKey('user-456', 'job-123');
      localStorageMock[storageKey] = 'true';

      // Start with 'transcribing' status
      mockRecordingData.recording.status = 'transcribing';

      renderWithProviders(<RecordingDetailsPage />);

      await waitFor(() => {
        expect(screen.getByTestId('recording-header')).toBeInTheDocument();
      });

      // Simulate SSE status change to 'transcribed'
      act(() => {
        if (capturedOnStatusChange) {
          capturedOnStatusChange({
            ...mockRecordingData.recording,
            status: 'transcribed',
          });
        }
      });

      // Popover should remain false
      await waitFor(() => {
        expect(screen.getByTestId('popover-visible').textContent).toBe('false');
      });
    });

    it('should persist dismissal to localStorage when popover is dismissed', async () => {
      // Start with 'transcribing' status
      mockRecordingData.recording.status = 'transcribing';

      renderWithProviders(<RecordingDetailsPage />);

      await waitFor(() => {
        expect(screen.getByTestId('recording-header')).toBeInTheDocument();
      });

      // Simulate SSE status change to 'transcribed' to open popover
      act(() => {
        if (capturedOnStatusChange) {
          capturedOnStatusChange({
            ...mockRecordingData.recording,
            status: 'transcribed',
          });
        }
      });

      await waitFor(() => {
        expect(screen.getByTestId('dismiss-popover')).toBeInTheDocument();
      });

      // Click dismiss
      act(() => {
        screen.getByTestId('dismiss-popover').click();
      });

      // Verify localStorage was updated (user+recording key)
      const storageKey = getStorageKey('user-456', 'job-123');
      expect(localStorageMock[storageKey]).toBe('true');

      // Verify popover is now hidden
      await waitFor(() => {
        expect(screen.getByTestId('popover-visible').textContent).toBe('false');
      });
    });
  });

  describe('recording share permissions', () => {
    it('hides every mutation control for a view-only shared user', async () => {
      mockRecordingData.recording = {
        ...defaultRecording,
        user_id: 'owner-123',
        shared_with: [{ user_id: 'user-456', user_email: 'test@example.com', permission_level: 'view' }],
      };

      renderWithProviders(<RecordingDetailsPage />);

      await waitFor(() => {
        expect(screen.getByTestId('content-tabs')).toHaveAttribute('data-can-edit', 'false');
      });
      expect(screen.getByTestId('actions-card')).toHaveAttribute('data-can-delete', 'false');
      expect(screen.queryByRole('button', { name: 'Edit Analysis' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Reprocess from tabs' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Reprocess Analysis' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Delete Recording' })).not.toBeInTheDocument();
    });

    it('keeps edit controls for an edit share but not deletion', async () => {
      mockRecordingData.recording = {
        ...defaultRecording,
        user_id: 'owner-123',
        shared_with: [{ user_id: 'user-456', user_email: 'test@example.com', permission_level: 'edit' }],
      };

      renderWithProviders(<RecordingDetailsPage />);

      await waitFor(() => {
        expect(screen.getByTestId('content-tabs')).toHaveAttribute('data-can-edit', 'true');
      });
      expect(screen.getByRole('button', { name: 'Edit Analysis' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Reprocess from tabs' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Reprocess Analysis' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Delete Recording' })).not.toBeInTheDocument();
    });

    it('keeps owner deletion and management controls', async () => {
      renderWithProviders(<RecordingDetailsPage />);

      await waitFor(() => {
        expect(screen.getByTestId('content-tabs')).toHaveAttribute('data-can-edit', 'true');
      });
      expect(screen.getByTestId('actions-card')).toHaveAttribute('data-can-delete', 'true');
      expect(screen.getByTestId('actions-card')).toHaveAttribute('data-can-manage-sharing', 'true');
      expect(screen.getByRole('button', { name: 'Delete Recording' })).toBeInTheDocument();
    });

    it('keeps global-admin mutation controls for a shared recording', async () => {
      mockCurrentUser = { ...mockCurrentUser, permission: 'Admin' };
      mockRecordingData.recording = {
        ...defaultRecording,
        user_id: 'owner-123',
        shared_with: [{ user_id: 'user-456', user_email: 'test@example.com', permission_level: 'view' }],
      };

      renderWithProviders(<RecordingDetailsPage />);

      await waitFor(() => {
        expect(screen.getByTestId('content-tabs')).toHaveAttribute('data-can-edit', 'true');
      });
      expect(screen.getByTestId('actions-card')).toHaveAttribute('data-can-delete', 'true');
      expect(screen.getByRole('button', { name: 'Delete Recording' })).toBeInTheDocument();
    });
  });

  describe('edge cases', () => {
    it('should handle missing userId gracefully', async () => {
      // Override user permissions to return no user_id
      vi.doMock('@/hooks/usePermissions', () => ({
        useUserPermissions: () => ({
          data: { email: 'test@example.com', permission: 'USER' },
        }),
      }));

      // Component should still render without errors
      renderWithProviders(<RecordingDetailsPage />);

      await waitFor(() => {
        expect(screen.getByTestId('recording-header')).toBeInTheDocument();
      });
    });

    it('should not show popover on non-transcribed statuses', async () => {
      // Use a non-trigger status (completed) to confirm popover does not show
      mockRecordingData.recording.status = 'completed';

      renderWithProviders(<RecordingDetailsPage />);

      await waitFor(() => {
        expect(screen.getByTestId('recording-header')).toBeInTheDocument();
      });

      // Simulate SSE status change to 'completed' (non-trigger status)
      act(() => {
        if (capturedOnStatusChange) {
          capturedOnStatusChange({
            ...mockRecordingData.recording,
            status: 'completed',
          });
        }
      });

      // Popover should remain false
      await waitFor(() => {
        expect(screen.getByTestId('popover-visible').textContent).toBe('false');
      });
    });
  });
});
