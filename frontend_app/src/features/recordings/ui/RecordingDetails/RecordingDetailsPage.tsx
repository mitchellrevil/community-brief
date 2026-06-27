import type { SharedUserInfo } from "@/types/api";
import React from "react";
import { MotionDiv } from "@/components/ui/motion";
import { Skeleton } from "@/components/ui/skeleton";
import { downloadAnalysisDocument } from "@/features/recordings/data/api";
import { JobDeleteDialog } from "@/features/recordings/ui/JobDeleteDialog";
import { JobShareDialog } from "@/features/recordings/ui/JobShareDialog";
import { ReprocessAnalysisDialog } from "@/features/recordings/ui/ReprocessAnalysisDialog";
import { useJobStatusStream } from "@/hooks/useJobStatusStream";
import { useIsMobile } from "@/hooks/useMobile";
import { useUserPermissions } from "@/hooks/usePermissions";
import { getDisplayName } from "@/lib/display-name-utils";
import {
  AnimatePresence,
  fadeIn,
  fadeInUp,
  slideInFromRight,
  staggerContainer,
} from "@/lib/motion";
import { getStorageItem, setStorageItem } from "@/lib/storage";
import { fileToasts } from "@/lib/toast-utils";
import { useNavigate, useParams } from "@tanstack/react-router";
import { AlertCircle } from "lucide-react";

import { AudioPlayerCard } from "./AudioPlayerCard";
import { ChatInterface } from "./ChatInterface";
import { ContentTabs } from "./ContentTabs";
import { useRecordingActions } from "./hooks/useRecordingActions";
import { useRecordingData } from "./hooks/useRecordingData";
import { RecordingActionsCard } from "./RecordingActionsCard";
import { RecordingDetailsCard } from "./RecordingDetailsCard";
import { RecordingHeader } from "./RecordingHeader";

/**
 * Generate user-scoped storage key for transcription popover dismissal.
 * Returns null if userId is not available.
 */
function getTranscriptionPopoverStorageKey(
  userId: string | undefined,
  recordingId?: string | undefined,
): string | null {
  if (!userId || !recordingId) return null;
  return `community-brief:${userId}:transcription-popover-dismissed:${recordingId}`;
}

function stripUrlQuery(value?: string | null): string {
  return (value || "").split("?", 1)[0].split("#", 1)[0];
}

function getPathExtension(value?: string | null): string {
  const path = stripUrlQuery(value);
  const filename = path.split("/").pop()?.split("\\").pop() || "";
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.substring(dot).toLowerCase();
}

function getAnalysisDownloadName(
  fileName: string,
  sourcePath?: string | null,
): string {
  const extension = getPathExtension(sourcePath);
  if (extension !== ".md" && extension !== ".txt") {
    return fileName;
  }
  return /\.[^.]+$/.test(fileName)
    ? fileName.replace(/\.[^.]+$/, ".docx")
    : `${fileName}.docx`;
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
interface RecordingDetailsPageProps {
  backTo?: "/audio-recordings" | "/audio-recordings/shared" | "/admin/all-jobs";
}

export function RecordingDetailsPage({
  backTo = "/audio-recordings",
}: RecordingDetailsPageProps) {
  const { id: jobId } = useParams({ strict: false });
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { data: currentUser } = useUserPermissions();
  const isTinyScreen = typeof window !== "undefined" && window.innerWidth < 480;
  const isAudioURL = (url?: string | null): boolean => {
    if (!url) return false;
    try {
      const parsed = new URL(url, window.location.origin);
      const ext = (parsed.pathname.split(".").pop() || "").toLowerCase();
      const audioExts = [
        "mp3",
        "wav",
        "m4a",
        "webm",
        "ogg",
        "aac",
        "flac",
        "mp4",
        "mkv",
      ];
      return audioExts.includes(ext);
    } catch {
      // If URL parsing fails, fall back to extension check
      const ext = (
        url.split("?")[0].split("#")[0].split(".").pop() || ""
      ).toLowerCase();
      const audioExts = [
        "mp3",
        "wav",
        "m4a",
        "webm",
        "ogg",
        "aac",
        "flac",
        "mp4",
        "mkv",
      ];
      return audioExts.includes(ext);
    }
  };

  // Audio seeking state
  const [seekToAudio, setSeekToAudio] = React.useState<
    ((time: number, shouldPlay?: boolean) => void) | null
  >(null);
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
  } = useRecordingData(jobId || "");

  // Use local state for recording to enable SSE updates
  const recording = recordingState || initialRecording;

  // Update local state when initial recording changes
  React.useEffect(() => {
    if (initialRecording) {
      setRecordingState(initialRecording);
    }
  }, [initialRecording]);

  // Transcription popover state
  const [showTranscriptionPopover, setShowTranscriptionPopover] =
    React.useState(false);
  const popoverDismissedRef = React.useRef(false);

  // Allowed statuses that should trigger the popover
  const allowedStatuses = React.useMemo(
    () => new Set(["uploaded", "transcribing", "transcribed", "analysing"]),
    [],
  );

  // Check localStorage when user or recording changes and show popover based on recording status
  React.useEffect(() => {
    const storageKey = getTranscriptionPopoverStorageKey(
      currentUser?.user_id,
      recording?.id,
    );
    if (storageKey) {
      const isDismissed = getStorageItem(storageKey, "false") === "true";
      popoverDismissedRef.current = isDismissed;
    } else {
      popoverDismissedRef.current = false;
    }

    if (
      !popoverDismissedRef.current &&
      recording?.status &&
      allowedStatuses.has(recording.status)
    ) {
      setShowTranscriptionPopover(true);
    }
  }, [currentUser?.user_id, recording?.id, recording?.status, allowedStatuses]);

  /**
   * Handler to dismiss the transcription popover and persist to localStorage.
   */
  const handleDismissTranscriptionPopover = React.useCallback(() => {
    setShowTranscriptionPopover(false);
    popoverDismissedRef.current = true;
    const storageKey = getTranscriptionPopoverStorageKey(
      currentUser?.user_id,
      recording?.id,
    );
    if (storageKey) {
      setStorageItem(storageKey, "true");
    }
  }, [currentUser?.user_id, recording?.id]);

  // Clear any pending seek when switching recordings
  React.useEffect(() => {
    setPendingSeek(null);
  }, [recording?.id]);

  // Stable callbacks for seek and time-update to avoid rendering loops
  const handleSeekToProvided = React.useCallback(
    (fn: ((time: number, autoPlay?: boolean) => void) | null) => {
      if (!fn) {
        setSeekToAudio(null);
        return;
      }

      const wrapper = (time: number, autoPlay?: boolean) => {
        try {
          return fn(time, autoPlay);
        } catch (err) {
          console.error("RecordingDetailsPage: wrapper seekTo error", err);
        }
      };

      setSeekToAudio(() => wrapper);
    },
    [],
  );

  // Stream real-time status updates via SSE
  // Connect to stream for any non-completed status to track progress
  useJobStatusStream(
    recording?.id,
    ["uploaded", "transcribing", "transcribed", "analysing"],
    {
      onStatusChange: (job) => {
        setRecordingState(job);
        // Show transcription popover when job status enters any allowed state
        if (
          job?.status &&
          allowedStatuses.has(job.status) &&
          !popoverDismissedRef.current
        ) {
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
        console.error("SSE error:", err);
      },
    },
    recording?.status,
  );

  // Actions layer
  const {
    deleteDialogOpen,
    setDeleteDialogOpen,
    shareDialogOpen,
    setShareDialogOpen,
    handleDownload,
    handleBlobDownload,
    copyToClipboard,
  } = useRecordingActions();

  const [chatOpen, setChatOpen] = React.useState(false);
  const [analysisUpdateKey, setAnalysisUpdateKey] = React.useState(0);

  const [reprocessDialogOpen, setReprocessDialogOpen] = React.useState(false);

  const isAnalysisPath = React.useCallback(
    (path: string) => {
      const target = stripUrlQuery(path);
      if (!target) return false;
      if (stripUrlQuery(recording?.analysis_file_path) === target) return true;
      return Boolean(
        recording?.analysis_attempts?.some(
          (attempt: any) =>
            stripUrlQuery(attempt?.analysis_file_path) === target,
        ),
      );
    },
    [recording?.analysis_file_path, recording?.analysis_attempts],
  );

  const handleDownloadAnalysis = React.useCallback(
    async (path: string, fileName: string) => {
      if (!jobId) return;
      const downloadName = getAnalysisDownloadName(fileName, path);
      try {
        const blob = await downloadAnalysisDocument(jobId, path);
        handleBlobDownload(blob, downloadName);
      } catch {
        fileToasts.downloadFailed(downloadName);
      }
    },
    [handleBlobDownload, jobId],
  );

  const handleContentDownload = React.useCallback(
    (path: string, fileName: string) => {
      if (isAnalysisPath(path)) {
        void handleDownloadAnalysis(path, fileName);
        return;
      }
      handleDownload(path, fileName);
    },
    [handleDownload, handleDownloadAnalysis, isAnalysisPath],
  );

  const handleAnalysisUpdated = React.useCallback(
    (analysisText: string) => {
      setRecordingState((current: any) => ({
        ...(current || recording),
        analysis_text: analysisText,
      }));
      setAnalysisUpdateKey((key) => key + 1);
    },
    [recording],
  );

  // Loading state
  if (isLoading || !recording) {
    return (
      <MotionDiv
        key="loading"
        variants={fadeIn}
        initial="hidden"
        animate="visible"
        exit="exit"
        className="xs:px-3 xs:py-4 xs:space-y-4 mx-auto w-full max-w-7xl space-y-3 px-2 py-3 sm:px-4 lg:px-6"
      >
        <Skeleton className="h-16 w-full" />
        <div className="xs:gap-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
          <div className="xs:space-y-4 space-y-3 lg:col-span-2">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-96 w-full" />
          </div>
          <div className="xs:space-y-4 space-y-3">
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
        className="xs:px-3 xs:py-4 mx-auto w-full max-w-7xl px-2 py-3 sm:px-4 lg:px-6"
      >
        <div className="flex flex-col items-center justify-center space-y-4 py-12">
          <div className="bg-destructive/10 rounded-full p-3">
            <AlertCircle className="text-destructive h-8 w-8" />
          </div>
          <div className="space-y-2 text-center">
            <h2 className="text-xl font-semibold">Recording not found</h2>
            <p className="text-muted-foreground max-w-md text-sm">
              {error instanceof Error
                ? error.message
                : "The recording you are looking for does not exist or you do not have permission to view it"}
            </p>
          </div>
        </div>
      </MotionDiv>
    );
  }

  // Compute derived values (recording is guaranteed to be defined here)
  const categoryDisplay = recording.prompt_category_id
    ? getCategoryName(recording.prompt_category_id)
    : "N/A";
  const subcategoryDisplay = recording.prompt_subcategory_id
    ? getSubcategoryName(recording.prompt_subcategory_id)
    : undefined;
  const recordingDisplayName = getDisplayName(recording);
  const currentUserId = currentUser?.user_id;
  const isOwner = Boolean(currentUserId && recording.user_id === currentUserId);
  const isShared = Boolean(
    currentUserId && recording.user_id && recording.user_id !== currentUserId,
  );
  const currentShare = Array.isArray(recording.shared_with)
    ? (recording.shared_with as Array<SharedUserInfo>).find(
        (share) =>
          share.user_id === currentUserId ||
          share.user_email === currentUser?.email,
      )
    : undefined;
  const canManageSharing =
    isOwner || currentShare?.permission_level === "admin";

  const handleDeleteSuccess = () => {
    navigate({ to: backTo });
  };

  return (
    <>
      <MotionDiv
        key={`content-${recording.id}`}
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="xs:px-3 xs:py-4 xs:space-y-4 mx-auto w-full max-w-7xl space-y-3 px-2 py-3 sm:px-4 lg:px-6"
      >
        {/* Header */}
        <RecordingHeader
          recording={recording}
          isTinyScreen={isTinyScreen}
          showTranscriptionPopover={showTranscriptionPopover}
          onDismissTranscriptionPopover={handleDismissTranscriptionPopover}
          backTo={backTo}
        />

        {/* Main content grid */}
        <MotionDiv
          variants={fadeInUp}
          className="xs:gap-4 grid grid-cols-1 gap-3 lg:grid-cols-3"
        >
          {/* Left column: Player + Tabs */}
          <MotionDiv
            variants={fadeInUp}
            className="xs:space-y-4 space-y-3 lg:col-span-2"
          >
            {/* Audio Player */}
            {isAudioURL(recording.file_path) && (
              <AudioPlayerCard
                audioUrl={recording.file_path}
                displayName={recordingDisplayName}
                durationSeconds={recording.audio_duration_seconds ?? undefined}
                onDownload={() => handleDownload(recording.file_path, "Audio")}
                onSeekToProvided={handleSeekToProvided}
                pendingSeek={pendingSeek}
                isMobile={isMobile}
              />
            )}

            {/* Content Tabs */}
            <ContentTabs
              transcriptionText={transcriptionText}
              analysisText={recording.analysis_text}
              analysisUpdateKey={analysisUpdateKey}
              analysisFilePath={recording.analysis_file_path}
              analysisAttempts={recording.analysis_attempts}
              analysisInProgress={recording.analysis_in_progress}
              jobId={jobId || ""}
              createdAt={String(recording.created_at)}
              transcriptionFilePath={
                recording.transcription_file_path || undefined
              }
              isTranscriptionProcessing={isTranscriptionProcessing}
              shouldShowTranscriptionError={shouldShowTranscriptionError}
              transcriptionError={transcriptionError}
              onRefetchTranscription={refetchTranscription}
              onReprocess={() => setReprocessDialogOpen(true)}
              onAnalysisUpdated={handleAnalysisUpdated}
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
              onDownload={handleContentDownload}
              compact={isMobile}
              isMobile={isMobile}
              isTinyScreen={isTinyScreen}
            />
          </MotionDiv>

          {/* Right column: Details + Actions */}
          <MotionDiv
            variants={slideInFromRight}
            className="xs:space-y-4 space-y-3"
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
              canManageSharing={canManageSharing}
              jobId={jobId || ""}
              onShare={() => setShareDialogOpen(true)}
              onDelete={() => setDeleteDialogOpen(true)}
              onReprocess={() => setReprocessDialogOpen(true)}
              onDownloadAudio={
                isAudioURL(recording.file_path)
                  ? () => handleDownload(recording.file_path, "Audio")
                  : undefined
              }
              onDownloadTranscription={
                recording.transcription_file_path
                  ? () =>
                      handleDownload(
                        recording.transcription_file_path,
                        "Transcription",
                      )
                  : undefined
              }
              onDownloadAnalysis={
                recording.analysis_file_path ||
                (recording.analysis_attempts &&
                  recording.analysis_attempts.length > 0)
                  ? handleDownloadAnalysis
                  : undefined
              }
              analysisFilePath={recording.analysis_file_path}
              analysisAttempts={recording.analysis_attempts}
              onChatWithAnalysis={() => setChatOpen(true)}
              onCopyLink={() =>
                copyToClipboard(
                  `${window.location.origin}/audio-recordings/${jobId}`,
                  "Recording link",
                )
              }
              hasTranscription={!!recording.transcription_file_path}
              hasAnalysis={
                !!recording.analysis_file_path ||
                (recording.analysis_attempts &&
                  recording.analysis_attempts.length > 0)
              }
              isTinyScreen={isTinyScreen}
            />
          </MotionDiv>
        </MotionDiv>
      </MotionDiv>

      {/* Chat Interface (desktop floating, mobile full-screen) */}
      <ChatInterface
        jobId={jobId || ""}
        isMobile={isMobile}
        isTinyScreen={isTinyScreen}
        isOpen={chatOpen}
        onOpenChange={setChatOpen}
        onAnalysisUpdated={handleAnalysisUpdated}
      />

      {/* Dialogs */}
      {deleteDialogOpen && (
        <JobDeleteDialog
          isOpen={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          jobId={jobId || ""}
          jobTitle={recordingDisplayName}
          onDeleteSuccess={handleDeleteSuccess}
        />
      )}
      {shareDialogOpen && (
        <JobShareDialog
          isOpen={shareDialogOpen}
          onOpenChange={setShareDialogOpen}
          jobId={jobId || ""}
          jobTitle={recordingDisplayName}
        />
      )}
      {reprocessDialogOpen && (
        <ReprocessAnalysisDialog
          isOpen={reprocessDialogOpen}
          onOpenChange={setReprocessDialogOpen}
          jobId={jobId || ""}
          jobTitle={recordingDisplayName}
        />
      )}
    </>
  );
}
