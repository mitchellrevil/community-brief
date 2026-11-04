import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { FileAudio, Plus } from "lucide-react";
import { useFilesFeed } from "../hooks/useFilesFeed";
import { AudioRecordingsFilters } from "./AudioRecordingsFilters";
import { AudioRecordingsList } from "./AudioRecordingsList";
import { TeamsTranscriptDialog } from "./TeamsTranscriptDialog";
import type { AudioListValues } from "@/shared/schema/audio-list.schema";
import type { FileEntry, ListedJob } from "../data/file-entry";
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
import { JobDeleteDialog } from "@/features/recordings/ui/JobDeleteDialog";
import { JobShareDialog } from "@/features/recordings/ui/JobShareDialog";
import { getDisplayName } from "@/lib/display-name-utils";
import { isAudioFile, isWellSupportedAudioFormat } from "@/lib/file-utils";
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

  // Tutorial mode handling
  const tutorialContext = useTutorialOptional();
  const isTutorialMode = tutorialContext?.isTutorialMode ?? false;

  // Filter states
  const [search, setSearch] = useState(initialFilters.search || "");
  const [status, setStatus] = useState<
    "all" | "uploaded" | "processing" | "completed" | "failed"
  >(initialFilters.status || "all");

  // Dialog states
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareRecording, setShareRecording] = useState<ListedJob | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteRecording, setDeleteRecording] = useState<ListedJob | null>(
    null,
  );
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);
  const [formatWarningOpen, setFormatWarningOpen] = useState(false);
  const [pendingAudioPlay, setPendingAudioPlay] = useState<string | null>(null);
  // new date range filter state
  const [createdAtStart, setCreatedAtStart] = useState<string | undefined>(
    initialFilters.created_at_start || undefined,
  );
  const [createdAtEnd, setCreatedAtEnd] = useState<string | undefined>(
    initialFilters.created_at_end || undefined,
  );

  const router = useRouter();

  const filters = useMemo<AudioListValues>(
    () => ({
      search: search || undefined,
      status: status === "all" ? undefined : status,
      created_at_start: createdAtStart || undefined,
      created_at_end: createdAtEnd || undefined,
    }),
    [search, status, createdAtStart, createdAtEnd],
  );
  const [queryFilters, setQueryFilters] = useState(filters);
  const previousFilterKey = useRef(JSON.stringify(filters));
  const filterKey = JSON.stringify(filters);

  useEffect(() => {
    if (previousFilterKey.current === filterKey) return;
    const timer = setTimeout(() => {
      previousFilterKey.current = filterKey;
      setQueryFilters(filters);
      setCurrentPage(1);
      void router.navigate({
        to: "/audio-recordings",
        search: (prev) => ({
          ...prev,
          ...filters,
          page: 1,
          per_page: RECORDS_PER_PAGE,
        }),
        replace: true,
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [filterKey, filters, router, RECORDS_PER_PAGE]);

  const { entries, totalCount, isLoading, isRefetching, refetchJobs, teams } =
    useFilesFeed({
      filters: queryFilters,
      page: currentPage,
      pageSize: RECORDS_PER_PAGE,
      includeFiles: showFiles,
      includeTeams: showTeams,
    });
  const allEntries: Array<FileEntry> =
    isTutorialMode && showFiles
      ? [
          {
            kind: "job",
            id: TUTORIAL_SAMPLE_JOB.id,
            recording: TUTORIAL_SAMPLE_JOB,
          },
          ...entries,
        ]
      : entries;
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
    (recording: ListedJob) => {
      localStorage.setItem("current_recording_id", recording.id);
      router.navigate({
        to: "/audio-recordings/$id",
        params: { id: recording.id },
        search: { from: "files" },
      });
    },
    [router],
  );

  const handlePlayAudio = useCallback((recording: ListedJob) => {
    if (!recording.file_path) return;
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

  const handleDownloadAudio = useCallback((recording: ListedJob) => {
    if (recording.file_path) window.open(recording.file_path, "_blank");
  }, []);

  const handleShare = useCallback((recording: ListedJob) => {
    setShareRecording(recording);
    setShareDialogOpen(true);
  }, []);

  const handleDelete = useCallback((recording: ListedJob) => {
    setDeleteRecording(recording);
    setDeleteDialogOpen(true);
  }, []);

  const handleTeamsImported = useCallback(
    (jobId: string) => {
      const selected = teams.selectedTranscript;
      if (selected)
        teams.markImported(selected.meeting, jobId, selected.bundle.file.name);
      void refetchJobs();
    },
    [refetchJobs, teams.selectedTranscript, teams.markImported],
  );

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
          onStatusChange={setStatus}
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
          entries={allEntries}
          isLoading={isLoading}
          viewMode={viewMode}
          onViewDetails={handleViewDetails}
          onPlay={handlePlayAudio}
          onDownload={handleDownloadAudio}
          onShare={handleShare}
          onDelete={handleDelete}
          onProcessTeamsMeeting={teams.canProcess ? teams.process : undefined}
          processingTeamsMeetingId={teams.processingMeetingId}
          isProcessingTeamsMeeting={teams.isProcessing}
          deniedTeamsMeetingIds={teams.deniedMeetingIds}
          data-tutorial="recordings-list"
        />

        {showTeams && teams.isRefreshing && (
          <p role="status" className="text-muted-foreground text-sm">
            Checking Teams meetings… Available jobs are ready to open.
          </p>
        )}

        {showTeams && teams.hasMoreMeetings && (
          <div className="flex justify-center">
            <Button
              variant="outline"
              onClick={teams.loadMoreMeetings}
              disabled={teams.isLoadingMoreMeetings}
            >
              {teams.isLoadingMoreMeetings
                ? "Loading older Teams meetings..."
                : "Load older Teams meetings"}
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
