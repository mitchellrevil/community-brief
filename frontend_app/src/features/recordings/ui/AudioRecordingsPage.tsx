import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";
import { FileAudio, Plus } from "lucide-react";
import { AudioRecordingsFilters } from "./AudioRecordingsFilters";
import { AudioRecordingsList } from "./AudioRecordingsList";
import { TeamsTranscriptDialog } from "./TeamsTranscriptDialog";
import type { QueuedRecording } from "@/lib/pwa-queue";
import type { AudioListValues } from "@/shared/schema/audio-list.schema";
import {
  TUTORIAL_SAMPLE_JOB,
  useTutorialOptional,
} from "@/app/contexts/tutorial-context";
import { MiniAudioPlayer } from "@/components/audio-player/MiniAudioPlayer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormatWarningDialog } from "@/components/ui/format-warning-dialog";
import { PageHeading } from "@/components/ui/page-heading";
import { EnhancedPagination } from "@/components/ui/pagination";
import { SmartBreadcrumb } from "@/components/ui/smart-breadcrumb";
import { isTeamsRecordingsEnabled } from "@/config/runtime-config";
import { recordingsKeys } from "@/features/recordings/data/keys";
import { getAudioRecordingsQuery } from "@/features/recordings/data/queries";
import {
  getTeamsRecordings,
  sortRecordingsByCreated,
} from "@/features/recordings/data/teams-recordings";
import { JobDeleteDialog } from "@/features/recordings/ui/JobDeleteDialog";
import { JobShareDialog } from "@/features/recordings/ui/JobShareDialog";
import { useTeamsRecordings } from "@/features/teams/hooks/useTeamsRecordings";
import { getDisplayName } from "@/lib/display-name-utils";
import { isAudioFile, isWellSupportedAudioFormat } from "@/lib/file-utils";
import { getPendingRecordings } from "@/lib/pwa-queue";
import { getStorageItem, setStorageItem } from "@/lib/storage";


export function AudioRecordingsPage({
  initialFilters,
}: {
  initialFilters: AudioListValues & { page?: number; per_page?: number };
}) {
  const RECORDS_PER_PAGE = initialFilters.per_page || 12;
  const [currentPage, setCurrentPage] = useState(initialFilters.page || 1);
  const [viewMode, setViewMode] = useState<"card" | "table">(() =>
    localStorage.getItem("audio-recordings-view-mode") === "table"
      ? "table"
      : "card",
  );
  const teamsEnabled = isTeamsRecordingsEnabled();
  const [includeTeams, setIncludeTeams] = useState(
    () => getStorageItem("audio-recordings-include-teams", "false") === "true",
  );
  const [includeFiles, setIncludeFiles] = useState(
    () => getStorageItem("audio-recordings-include-files", "true") !== "false",
  );
  const showTeams = teamsEnabled && includeTeams;
  const showFiles = !teamsEnabled || includeFiles;
  const teams = useTeamsRecordings(showTeams);
  const queryClient = useQueryClient();

  // Tutorial mode handling
  const tutorialContext = useTutorialOptional();
  const isTutorialMode = tutorialContext?.isTutorialMode ?? false;

  // Filter states
  const [search, setSearch] = useState(initialFilters.search || "");
  const [status, setStatus] = useState<
    "all" | "uploaded" | "processing" | "completed" | "failed"
  >((initialFilters.status as any) || "all");

  // Dialog states
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareRecording, setShareRecording] = useState<any>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteRecording, setDeleteRecording] = useState<any>(null);
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);
  const [formatWarningOpen, setFormatWarningOpen] = useState(false);
  const [pendingAudioPlay, setPendingAudioPlay] = useState<string | null>(null);
  // new date range filter state
  const [createdAtStart, setCreatedAtStart] = useState<string | undefined>(
    (initialFilters as any).created_at_start || undefined,
  );
  const [createdAtEnd, setCreatedAtEnd] = useState<string | undefined>(
    (initialFilters as any).created_at_end || undefined,
  );

  // Data states
  const [queuedRecordings, setQueuedRecordings] = useState<
    Array<QueuedRecording>
  >([]);

  const router = useRouter();

  // Load queued recordings
  useEffect(() => {
    const loadQueued = async () => {
      try {
        const pending = await getPendingRecordings();
        setQueuedRecordings(pending);
      } catch (error) {
        console.error("Failed to load queued recordings:", error);
      }
    };

    loadQueued();
    const interval = setInterval(loadQueued, 5000);
    return () => clearInterval(interval);
  }, []);

  // Debounce search / filter update to URL and query
  useEffect(() => {
    const timer = setTimeout(() => {
      if (currentPage !== 1) setCurrentPage(1);

      router.navigate({
        to: "/audio-recordings",
        search: (prev) => ({
          ...prev,
          page: 1,
          per_page: RECORDS_PER_PAGE,
          search: search || undefined,
          status: status === "all" ? undefined : status,
          created_at_start: createdAtStart || undefined,
          created_at_end: createdAtEnd || undefined,
        }),
        replace: true,
      });
    }, 500);

    return () => clearTimeout(timer);
  }, [search, status, createdAtStart, createdAtEnd, showFiles, showTeams]);

  const queryFilters = useMemo(
    () => ({
      search: search || undefined,
      status: status === "all" ? undefined : status,
      created_at_start: createdAtStart || undefined,
      created_at_end: createdAtEnd || undefined,
      page: currentPage,
      per_page: RECORDS_PER_PAGE,
    }),
    [
      search,
      status,
      createdAtStart,
      createdAtEnd,
      currentPage,
      RECORDS_PER_PAGE,
    ],
  );

  // A mixed page needs the newest N files before sorting both sources together.
  // Reuse cached normal pages instead of repeating Teams on every file page.
  const fileQueries = useQueries({
    queries: showFiles
      ? Array.from({ length: showTeams ? currentPage : 1 }, (_, index) =>
          getAudioRecordingsQuery({
            ...queryFilters,
            page: showTeams ? index + 1 : currentPage,
          }),
        )
      : [],
  });
  // Show saved files while Graph checks the first Teams page in the background.
  const isLoading = showFiles
    ? fileQueries.some((query) => query.isLoading)
    : teams.isLoading;
  const isRefetching =
    fileQueries.some((query) => query.isRefetching) || teams.isRefreshing;
  const refetchJobs = useCallback(
    () =>
      queryClient.refetchQueries({
        queryKey: recordingsKeys.base(),
        type: "active",
      }),
    [queryClient],
  );

  // Refresh on mount and window focus
  useEffect(() => {
    refetchJobs();

    const handleFocus = () => {
      refetchJobs();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        refetchJobs();
      }
    });

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleFocus);
    };
  }, [refetchJobs]);

  // Auto-refresh logic: every minute until 10 minutes, then every 5 minutes
  useEffect(() => {
    const startTime = Date.now();
    let refreshInterval: ReturnType<typeof setTimeout>;

    const scheduleNextRefresh = () => {
      const elapsed = Date.now() - startTime;
      const TEN_MINUTES = 10 * 60 * 1000;

      if (elapsed < TEN_MINUTES) {
        // First 10 minutes: refresh every minute
        refreshInterval = setTimeout(() => {
          refetchJobs();
          scheduleNextRefresh();
        }, 60000); // 1 minute
      } else {
        // After 10 minutes: refresh every 5 minutes
        refreshInterval = setTimeout(() => {
          refetchJobs();
          scheduleNextRefresh();
        }, 300000); // 5 minutes
      }
    };

    scheduleNextRefresh();

    return () => {
      clearTimeout(refreshInterval);
    };
  }, [refetchJobs]);

  const audioRecordings = fileQueries.flatMap(
    (query) => query.data?.jobs ?? [],
  );
  const teamsRecordings = getTeamsRecordings(teams.meetings, {
    search,
    status,
    createdAtStart,
    createdAtEnd,
  });

  // Combine queued recordings
  const displayQueuedRecordings = queuedRecordings.map((qr) => ({
    id: qr.id,
    displayname: qr.metadata.categoryName,
    file_name: qr.metadata.categoryName,
    filename: qr.metadata.categoryName,
    file_path: "",
    status: "queued" as const,
    created_at: new Date(qr.createdAt).getTime(),
    user_id: "",
    _isQueued: true,
    _queuedRecording: qr,
  }));

  // During tutorial mode, show the sample job at the top of the list
  const tutorialSampleRecordings =
    isTutorialMode && showFiles ? [TUTORIAL_SAMPLE_JOB] : [];
  const sortedRecordings = sortRecordingsByCreated([
    ...(showFiles ? displayQueuedRecordings : []),
    ...audioRecordings,
    ...teamsRecordings,
  ]);
  const pageStart = showTeams ? (currentPage - 1) * RECORDS_PER_PAGE : 0;
  const allRecordings = [
    ...tutorialSampleRecordings,
    ...(showTeams
      ? sortedRecordings.slice(pageStart, pageStart + RECORDS_PER_PAGE)
      : sortedRecordings),
  ];
  const totalCount =
    (fileQueries[0]?.data?.count ?? 0) +
    teamsRecordings.length +
    (showFiles && showTeams ? displayQueuedRecordings.length : 0);
  const totalPages = Math.max(1, Math.ceil(totalCount / RECORDS_PER_PAGE));

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    router.navigate({
      to: "/audio-recordings",
      search: (prev) => ({ ...prev, page: newPage }),
      replace: true,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleViewModeChange = (mode: "card" | "table") => {
    localStorage.setItem("audio-recordings-view-mode", mode);
    setViewMode(mode);
  };

  const handleIncludeTeamsChange = (checked: boolean) => {
    setIncludeTeams(checked);
    setCurrentPage(1);
    setStorageItem("audio-recordings-include-teams", String(checked));
  };

  const handleIncludeFilesChange = (checked: boolean) => {
    setIncludeFiles(checked);
    setCurrentPage(1);
    setStorageItem("audio-recordings-include-files", String(checked));
  };

  const handleViewDetails = useCallback(
    (recording: any) => {
      localStorage.setItem("current_recording_id", recording.id);
      router.navigate({
        to: "/audio-recordings/$id",
        params: { id: recording.id },
        search: { from: "files" },
      });
    },
    [router],
  );

  const handlePlayAudio = useCallback((recording: any) => {
    if (isAudioFile(recording.file_path)) {
      if (isWellSupportedAudioFormat(recording.file_path)) {
        setPlayingAudio(recording.file_path);
      } else {
        setPendingAudioPlay(recording.file_path);
        setFormatWarningOpen(true);
      }
    } else {
      window.open(recording.file_path, "_blank");
    }
  }, []);

  const handleDownloadAudio = useCallback((recording: any) => {
    window.open(recording.file_path, "_blank");
  }, []);

  const handleRetryProcessing = useCallback((recording: any) => {
    console.log("Retry processing for:", recording.id);
    // Implement retry logic here if needed
  }, []);

  const handleShare = useCallback((recording: any) => {
    setShareRecording(recording);
    setShareDialogOpen(true);
  }, []);

  const handleDelete = useCallback((recording: any) => {
    setDeleteRecording(recording);
    setDeleteDialogOpen(true);
  }, []);

  const handleTeamsImported = useCallback(() => {
    void refetchJobs();
  }, [refetchJobs]);

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden">
      <PageHeading
        icon={<FileAudio className="h-5 w-5 sm:h-6 sm:w-6" />}
        title="My Files"
        breadcrumb={
          <SmartBreadcrumb items={[{ label: "Files", isCurrentPage: true }]} />
        }
        actions={
          <Link to="/audio-upload" className="hidden flex-shrink-0 sm:block">
            <Button className="h-10">
              <Plus className="mr-2 h-4 w-4" />
              New Recording
            </Button>
          </Link>
        }
      />

      <div className="mx-auto w-full max-w-7xl space-y-4 px-4 py-4 pb-24 sm:space-y-6 sm:px-6 sm:py-6 md:pb-6">
        <AudioRecordingsFilters
          createdAtStart={createdAtStart}
          createdAtEnd={createdAtEnd}
          onCreatedAtStartChange={(val) => setCreatedAtStart(val)}
          onCreatedAtEndChange={(val) => setCreatedAtEnd(val)}
          search={search}
          onSearchChange={setSearch}
          status={status}
          onStatusChange={(val) => setStatus(val as any)}
          onRefresh={() => {
            void refetchJobs();
            teams.refresh();
          }}
          isRefetching={isRefetching}
          totalCount={totalCount}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          sourceFilters={
            teamsEnabled
              ? {
                  includeFiles,
                  includeTeams,
                  onFilesChange: handleIncludeFilesChange,
                  onTeamsChange: handleIncludeTeamsChange,
                }
              : undefined
          }
        />

        {teams.error && (
          <Alert variant="destructive">
            <AlertTitle>Teams meetings</AlertTitle>
            <AlertDescription>{teams.error}</AlertDescription>
          </Alert>
        )}
        {teams.recordingWarning && (
          <Alert>
            <AlertTitle>Teams recordings</AlertTitle>
            <AlertDescription>{teams.recordingWarning}</AlertDescription>
          </Alert>
        )}

        <AudioRecordingsList
          recordings={allRecordings}
          isLoading={isLoading}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          onViewDetails={handleViewDetails}
          onPlay={handlePlayAudio}
          onDownload={handleDownloadAudio}
          onRetryProcessing={handleRetryProcessing}
          onShare={handleShare}
          onDelete={handleDelete}
          onProcessTeamsMeeting={teams.process}
          processingTeamsMeetingId={teams.processingMeetingId}
          isProcessingTeamsMeeting={teams.isProcessing}
          deniedTeamsMeetingIds={teams.deniedMeetingIds}
          data-tutorial="recordings-list"
        />

        {showTeams && teams.hasMoreMeetings && (
          <div className="flex justify-center">
            <Button
              variant="outline"
              onClick={teams.loadMoreMeetings}
              disabled={teams.isLoadingMoreMeetings}
            >
              {teams.isLoadingMoreMeetings ? "Loading older Teams meetings..." : "Load older Teams meetings"}
            </Button>
          </div>
        )}

        <EnhancedPagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalCount}
          itemsPerPage={RECORDS_PER_PAGE}
          onPageChange={handlePageChange}
        />
        <TeamsTranscriptDialog
          transcript={teams.selectedTranscript}
          onClose={teams.closeTranscript}
          onImported={handleTeamsImported}
        />

        {shareRecording && (
          <JobShareDialog
            isOpen={shareDialogOpen}
            onOpenChange={setShareDialogOpen}
            jobId={shareRecording.id}
            jobTitle={getDisplayName(shareRecording)}
          />
        )}

        {deleteRecording && (
          <JobDeleteDialog
            isOpen={deleteDialogOpen}
            onOpenChange={setDeleteDialogOpen}
            jobId={deleteRecording.id}
            jobTitle={getDisplayName(deleteRecording)}
            onDeleteSuccess={refetchJobs}
          />
        )}

        {pendingAudioPlay && (
          <FormatWarningDialog
            isOpen={formatWarningOpen}
            onOpenChange={setFormatWarningOpen}
            filePath={pendingAudioPlay}
            onContinue={() => setPlayingAudio(pendingAudioPlay)}
          />
        )}

        {playingAudio && (
          <MiniAudioPlayer
            src={playingAudio}
            onClose={() => setPlayingAudio(null)}
          />
        )}
      </div>
    </div>
  );
}
