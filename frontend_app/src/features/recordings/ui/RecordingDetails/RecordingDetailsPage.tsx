import React from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { AlertCircle } from 'lucide-react';
import { useRecordingData } from './hooks/useRecordingData';
import { useRecordingActions } from './hooks/useRecordingActions';
import { RecordingHeader } from './RecordingHeader';
import { AudioPlayerCard } from './AudioPlayerCard';
import { ContentTabs } from './ContentTabs';
import { RecordingDetailsCard } from './RecordingDetailsCard';
import { RecordingActionsCard } from './RecordingActionsCard';
import { ChatInterface } from './ChatInterface';
import { useJobStatusStream } from '@/hooks/useJobStatusStream';
import { useIsMobile } from '@/hooks/useMobile';
import { Skeleton } from '@/components/ui/skeleton';
import { JobDeleteDialog } from '@/features/recordings/ui/JobDeleteDialog';
import { JobShareDialog } from '@/features/recordings/ui/JobShareDialog';
import { ReprocessAnalysisDialog } from '@/features/recordings/ui/ReprocessAnalysisDialog';
import { useUserPermissions } from '@/hooks/usePermissions';
import { getDisplayName } from '@/lib/display-name-utils';
import { getStorageItem, setStorageItem } from '@/lib/storage';
import { AnimatePresence, fadeIn, fadeInUp, slideInFromRight, staggerContainer } from '@/lib/motion';
import { MotionDiv } from '@/components/ui/motion';

/**
 * Generate user-scoped storage key for transcription popover dismissal.
 * Returns null if userId is not available.
 */
function getTranscriptionPopoverStorageKey(userId: string | undefined, recordingId?: string | undefined): string | null {
  if (!userId || !recordingId) return null;
  return `community-brief:${userId}:transcription-popover-dismissed:${recordingId}`;
}

/**
 * Recording Details Page - Main Orchestrator
 * 
 * Architecture:
 * - Data layer: useRecordingData hook centralizes all data fetching
 * - Actions layer: useRecordingActions hook manages all user interactions
 * - Presentation layer: Modular, single-responsibility components
 * - Layout: Responsive grid that adapts mobile → tablet → desktop
 * 
 * Component hierarchy:
 * RecordingDetailsPageV3
 * ├── RecordingHeader (breadcrumb, status, actions)
 * ├── AudioPlayerCard (playback controls)
 * ├── ContentTabs (transcription/analysis)
 * ├── RecordingDetailsCard (metadata sidebar)
 * ├── RecordingActionsCard (action buttons sidebar)
 * └── ChatInterface (floating desktop / fullscreen mobile)
 */
export function RecordingDetailsPage() {
  const { id: jobId } = useParams({ strict: false });
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { data: currentUser } = useUserPermissions();
  const isTinyScreen = typeof window !== 'undefined' && window.innerWidth < 480;
  const isAudioURL = (url?: string | null): boolean => {
    if (!url) return false;
    try {
      const parsed = new URL(url, window.location.origin);
      const ext = (parsed.pathname.split('.').pop() || '').toLowerCase();
      const audioExts = ['mp3', 'wav', 'm4a', 'webm', 'ogg', 'aac', 'flac', 'mp4', 'mkv'];
      return audioExts.includes(ext);
    } catch {
      // If URL parsing fails, fall back to extension check
      const ext = (url.split('?')[0].split('#')[0].split('.').pop() || '').toLowerCase();
      const audioExts = ['mp3', 'wav', 'm4a', 'webm', 'ogg', 'aac', 'flac', 'mp4', 'mkv'];
      return audioExts.includes(ext);
    }
  };

  // Audio seeking state
  const [seekToAudio, setSeekToAudio] = React.useState<((time: number, shouldPlay?: boolean) => void) | null>(null);
  const [pendingSeek, setPendingSeek] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (seekToAudio && pendingSeek !== null && Number.isFinite(pendingSeek)) {
      seekToAudio(pendingSeek, true);
      setPendingSeek(null);
    }
  }, [seekToAudio, pendingSeek]);

  const [recordingState, setRecordingState] = React.useState<any>(null);

  // Data layer
  const {
    recording: initialRecording,
    transcriptionText,
    isLoading,
    isError,
    error,
    isTranscriptionProcessing,
    shouldShowTranscriptionError,
    transcriptionError,
    refetchTranscription,
    getCategoryName,
    getSubcategoryName,
  } = useRecordingData(jobId || '');

  // Use local state for recording to enable SSE updates
  const recording = recordingState || initialRecording;

  // Update local state when initial recording changes
  React.useEffect(() => {
    if (initialRecording) {
      setRecordingState(initialRecording);
    }
  }, [initialRecording]);

  // Transcription popover state
  const [showTranscriptionPopover, setShowTranscriptionPopover] = React.useState(false);
  const popoverDismissedRef = React.useRef(false);

  // Allowed statuses that should trigger the popover
  const allowedStatuses = React.useMemo(() => new Set(['uploaded', 'transcribing', 'transcribed', 'analysing']), []);

  // Check localStorage when user or recording changes and show popover based on recording status
  React.useEffect(() => {
    const storageKey = getTranscriptionPopoverStorageKey(currentUser?.user_id, recording?.id);
    if (storageKey) {
      const isDismissed = getStorageItem(storageKey, 'false') === 'true';
      popoverDismissedRef.current = isDismissed;
    } else {
      popoverDismissedRef.current = false;
    }

    if (!popoverDismissedRef.current && recording?.status && allowedStatuses.has(recording.status)) {
      setShowTranscriptionPopover(true);
    }
  }, [currentUser?.user_id, recording?.id, recording?.status, allowedStatuses]);

  /**
   * Handler to dismiss the transcription popover and persist to localStorage.
   */
  const handleDismissTranscriptionPopover = React.useCallback(() => {
    setShowTranscriptionPopover(false);
    popoverDismissedRef.current = true;
    const storageKey = getTranscriptionPopoverStorageKey(currentUser?.user_id, recording?.id);
    if (storageKey) {
      setStorageItem(storageKey, 'true');
    }
  }, [currentUser?.user_id, recording?.id]);

  // Clear any pending seek when switching recordings
  React.useEffect(() => {
    setPendingSeek(null);
  }, [recording?.id]);

  // Stable callbacks for seek and time-update to avoid rendering loops
  const handleSeekToProvided = React.useCallback((fn: ((time: number, autoPlay?: boolean) => void) | null) => {
    if (!fn) {
      setSeekToAudio(null);
      return;
    }

    const wrapper = (time: number, autoPlay?: boolean) => {
      try {
        return fn(time, autoPlay);
      } catch (err) {
        console.error('RecordingDetailsPage: wrapper seekTo error', err);
      }
    };

    setSeekToAudio(() => wrapper);
  }, []);

  // Stream real-time status updates via SSE
  // Connect to stream for any non-completed status to track progress
  useJobStatusStream(
    recording?.id,
    ['uploaded', 'transcribing', 'transcribed', 'analysing'],
    {
      onStatusChange: (job) => {
        setRecordingState(job);
        // Show transcription popover when job status enters any allowed state
        if (job?.status && allowedStatuses.has(job.status) && !popoverDismissedRef.current) {
          setShowTranscriptionPopover(true);
        }
      },
      onTranscriptionComplete: () => {
        refetchTranscription();
      },
      onJobComplete: () => {
        refetchTranscription();
      },
      onError: (err) => {
        console.error('SSE error:', err);
      },
    },
    recording?.status
  );

  // Actions layer
  const {
    deleteDialogOpen,
    setDeleteDialogOpen,
    shareDialogOpen,
    setShareDialogOpen,
    handleDownload,
    copyToClipboard,
  } = useRecordingActions();

  const [chatOpen, setChatOpen] = React.useState(false);

  const [reprocessDialogOpen, setReprocessDialogOpen] = React.useState(false);

  // Loading state
  if (isLoading || !recording) {
    return (
      <MotionDiv
        key="loading"
        variants={fadeIn}
        initial="hidden"
        animate="visible"
        exit="exit"
        className="mx-auto w-full max-w-7xl px-2 xs:px-3 sm:px-4 lg:px-6 py-3 xs:py-4 space-y-3 xs:space-y-4"
      >
        <Skeleton className="h-16 w-full" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 xs:gap-4">
          <div className="lg:col-span-2 space-y-3 xs:space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-96 w-full" />
          </div>
          <div className="space-y-3 xs:space-y-4">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        </div>
      </MotionDiv>
    );
  }

  // Error state
  if (isError) {
    return (
      <MotionDiv
        key="error"
        variants={fadeInUp}
        initial="hidden"
        animate="visible"
        exit="exit"
        className="mx-auto w-full max-w-7xl px-2 xs:px-3 sm:px-4 lg:px-6 py-3 xs:py-4"
      >
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <div className="rounded-full bg-destructive/10 p-3">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <div className="text-center space-y-2">
            <h2 className="text-xl font-semibold">Recording not found</h2>
            <p className="text-sm text-muted-foreground max-w-md">
              {error instanceof Error ? error.message : 'The recording you are looking for does not exist or you do not have permission to view it'}
            </p>
          </div>
        </div>
      </MotionDiv>
    );
  }

  // Compute derived values (recording is guaranteed to be defined here)
  const categoryDisplay = recording.prompt_category_id ? getCategoryName(recording.prompt_category_id) : 'N/A';
  const subcategoryDisplay = recording.prompt_subcategory_id ? getSubcategoryName(recording.prompt_subcategory_id) : undefined;
  const recordingDisplayName = getDisplayName(recording);
  const currentUserId = currentUser?.user_id;
  const isOwner = Boolean(currentUserId && recording.user_id === currentUserId);
  const isShared = Boolean(currentUserId && recording.user_id && recording.user_id !== currentUserId);

  const handleDeleteSuccess = () => {
    navigate({ to: '/audio-recordings' });
  };

  return (
    <>
      <MotionDiv
        key={`content-${recording.id}`}
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="mx-auto w-full max-w-7xl px-2 xs:px-3 sm:px-4 lg:px-6 py-3 xs:py-4 space-y-3 xs:space-y-4"
      >
        {/* Header */}
        <RecordingHeader
          recording={recording}
          isTinyScreen={isTinyScreen}
          showTranscriptionPopover={showTranscriptionPopover}
          onDismissTranscriptionPopover={handleDismissTranscriptionPopover}
        />

        {/* Main content grid */}
        <MotionDiv
          variants={fadeInUp}
          className="grid grid-cols-1 lg:grid-cols-3 gap-3 xs:gap-4"
        >
          {/* Left column: Player + Tabs */}
          <MotionDiv
            variants={fadeInUp}
            className="lg:col-span-2 space-y-3 xs:space-y-4"
          >
            {/* Audio Player */}
            {isAudioURL(recording.file_path) && (
              <AudioPlayerCard
                audioUrl={recording.file_path}
                displayName={recordingDisplayName}
                onDownload={() => handleDownload(recording.file_path, 'Audio')}
                onSeekToProvided={handleSeekToProvided}

                pendingSeek={pendingSeek}
                isMobile={isMobile}
                isTinyScreen={isTinyScreen}
              />
            )}

            {/* Content Tabs */}
            <ContentTabs
              transcriptionText={transcriptionText}
              analysisText={recording.analysis_text}
              analysisFilePath={recording.analysis_file_path}
              analysisAttempts={recording.analysis_attempts}              analysisInProgress={recording.analysis_in_progress}              jobId={jobId || ''}
              createdAt={String(recording.created_at)}
              transcriptionFilePath={recording.transcription_file_path || undefined}
              isTranscriptionProcessing={isTranscriptionProcessing}
              shouldShowTranscriptionError={shouldShowTranscriptionError}
              transcriptionError={transcriptionError}
              onRefetchTranscription={refetchTranscription}
              onReprocess={() => setReprocessDialogOpen(true)}
              onSegmentClick={(segment) => {
                if (Number.isFinite(segment.startTime)) {
                  if (seekToAudio) {
                    seekToAudio(segment.startTime, true);
                  } else {
                    // Buffer the requested seek until player initializes
                    setPendingSeek(segment.startTime);
                  }
                }
              }}
              onDownload={handleDownload}
              compact={isMobile}
              isMobile={isMobile}
              isTinyScreen={isTinyScreen}
            />
          </MotionDiv>

          {/* Right column: Details + Actions */}
          <MotionDiv
            variants={slideInFromRight}
            className="space-y-3 xs:space-y-4"
          >
            <RecordingDetailsCard
              recording={recording}
              categoryDisplay={categoryDisplay}
              subcategoryDisplay={subcategoryDisplay}
              durationSeconds={recording.audio_duration_seconds ?? undefined}
              isTinyScreen={isTinyScreen}
            />
            <RecordingActionsCard
              isOwner={isOwner}
              isShared={isShared}
              jobId={jobId || ''}
              onShare={() => setShareDialogOpen(true)}
              onDelete={() => setDeleteDialogOpen(true)}
              onReprocess={() => setReprocessDialogOpen(true)}
              onDownloadAudio={isAudioURL(recording.file_path) ? () => handleDownload(recording.file_path, 'Audio') : undefined}
              onDownloadTranscription={recording.transcription_file_path ? () => handleDownload(recording.transcription_file_path, 'Transcription') : undefined}
              onDownloadAnalysis={recording.analysis_file_path || (recording.analysis_attempts && recording.analysis_attempts.length > 0)
                ? (path, name) => handleDownload(path, name)
                : undefined}
              analysisFilePath={recording.analysis_file_path}
              analysisAttempts={recording.analysis_attempts}
              onChatWithAnalysis={() => setChatOpen(true)}
              onCopyLink={() => copyToClipboard(`${window.location.origin}/audio-recordings/${jobId}`, 'Recording link')}
              hasTranscription={!!recording.transcription_file_path}
              hasAnalysis={!!recording.analysis_file_path || (recording.analysis_attempts && recording.analysis_attempts.length > 0)}
              isTinyScreen={isTinyScreen}
            />
          </MotionDiv>
        </MotionDiv>
      </MotionDiv>

      {/* Chat Interface (desktop floating, mobile full-screen) */}
      <ChatInterface
        jobId={jobId || ''}
        isMobile={isMobile}
        isTinyScreen={isTinyScreen}
        isOpen={chatOpen}
        onOpenChange={setChatOpen}
      />

      {/* Dialogs */}
      {deleteDialogOpen && (
        <JobDeleteDialog
          isOpen={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          jobId={jobId || ''}
          jobTitle={recordingDisplayName}
          onDeleteSuccess={handleDeleteSuccess}
        />
      )}
      {shareDialogOpen && (
        <JobShareDialog
          isOpen={shareDialogOpen}
          onOpenChange={setShareDialogOpen}
          jobId={jobId || ''}
          jobTitle={recordingDisplayName}
        />
      )}
      {reprocessDialogOpen && (
        <ReprocessAnalysisDialog
          isOpen={reprocessDialogOpen}
          onOpenChange={setReprocessDialogOpen}
          jobId={jobId || ''}
          jobTitle={recordingDisplayName}
        />
      )}
    </>
  );
}
