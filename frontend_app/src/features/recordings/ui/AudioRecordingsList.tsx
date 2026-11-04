import { memo } from "react";
import { Link } from "@tanstack/react-router";
import { FileAudio, Loader2, Video } from "lucide-react";
import { getTeamsEventId } from "../data/recording-source";
import { AudioRecordingCard } from "./AudioRecordingCard";
import type { TeamsMeeting } from "@/features/teams";
import type { FileEntry, ListedJob } from "../data/file-entry";
import { Button } from "@/components/ui/button";
import { MotionList, MotionListItem } from "@/components/ui/motion-list";
import { Skeleton } from "@/components/ui/skeleton";
import { getTeamsAccessRequestUrl } from "@/features/teams";
import { useIsMobile } from "@/hooks/useMobile";
import { formatDateTime } from "@/lib/date-utils";
import { isAudioFile } from "@/lib/file-utils";


interface AudioRecordingsListProps {
  entries: Array<FileEntry>;
  isLoading: boolean;
  viewMode: "card" | "table";
  onViewDetails: (recording: ListedJob) => void;
  onPlay: (recording: ListedJob) => void;
  onDownload: (recording: ListedJob) => void;
  onShare: (recording: ListedJob) => void;
  onDelete: (recording: ListedJob) => void;
  "data-tutorial"?: string;
  onProcessTeamsMeeting?: (meeting: TeamsMeeting) => void;
  processingTeamsMeetingId?: string | null;
  isProcessingTeamsMeeting?: boolean;
  deniedTeamsMeetingIds?: Array<string>;
}

function AudioRecordingsListComponent({
  entries,
  isLoading,
  viewMode,
  onViewDetails,
  onPlay,
  onDownload,
  onShare,
  onDelete,
  "data-tutorial": dataTutorial,
  onProcessTeamsMeeting,
  processingTeamsMeetingId,
  isProcessingTeamsMeeting,
  deniedTeamsMeetingIds = [],
}: AudioRecordingsListProps) {
  const isMobile = useIsMobile();
  if (isLoading) {
    return <LoadingSkeleton viewMode={viewMode} />;
  }

  if (entries.length === 0) {
    return (
      <div className="bg-muted/10 flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
        <div className="bg-muted mb-4 rounded-full p-4">
          <FileAudio className="text-muted-foreground h-8 w-8" />
        </div>
        <h3 className="text-lg font-semibold">No recordings found</h3>
        <p className="text-muted-foreground mt-2 max-w-sm text-sm">
          Try adjusting your filters or upload a new recording to get started.
        </p>
      </div>
    );
  }

  const useCardLayout = viewMode === "card" || isMobile;

  return (
    <div className="w-full space-y-4" data-tutorial={dataTutorial}>
      <MotionList
        as="div"
        className={
          useCardLayout
            ? "grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3"
            : "flex flex-col gap-2"
        }
      >
        {entries.map((entry) => (
          <MotionListItem key={entry.id} as="div">
            {entry.kind === "queued" ? (
              <AudioRecordingCard
                recording={entry.recording}
                layout={useCardLayout ? "card" : "list"}
                isEditable={false}
              />
            ) : entry.kind === "meeting" ? (
              <AudioRecordingCard
                recording={entry.recording}
                layout={useCardLayout ? "card" : "list"}
                isEditable={false}
                ownerLabel={entry.meeting.organizer}
                statusLabel={
                  entry.meeting.transcriptAccessDenied ||
                  deniedTeamsMeetingIds.includes(entry.meeting.id)
                    ? "Transcript access needed"
                    : entry.meeting.transcriptIds?.length
                      ? "Transcript available"
                      : "Recording available"
                }
                durationDescription="Scheduled meeting length"
                metadataItems={[
                  {
                    label: "Meeting",
                    value: formatDateTime(entry.meeting.startDateTime),
                  },
                ]}
                primaryAction={
                  <TeamsMeetingActions
                    meeting={entry.meeting}
                    displayName={entry.meeting.subject}
                    accessDenied={
                      entry.meeting.transcriptAccessDenied ||
                      deniedTeamsMeetingIds.includes(entry.meeting.id)
                    }
                    useCardLayout={useCardLayout}
                    onProcess={onProcessTeamsMeeting}
                    isProcessing={isProcessingTeamsMeeting}
                    processingMeetingId={processingTeamsMeetingId}
                  />
                }
              />
            ) : (
              <AudioRecordingCard
                recording={entry.recording}
                layout={useCardLayout ? "card" : "list"}
                ownerLabel={entry.meeting?.organizer}
                onViewDetails={() => onViewDetails(entry.recording)}
                onPlay={
                  entry.recording.file_path &&
                  isAudioFile(entry.recording.file_path)
                    ? () => onPlay(entry.recording)
                    : undefined
                }
                onDownload={
                  entry.recording.file_path
                    ? () => onDownload(entry.recording)
                    : undefined
                }
                onShare={() => onShare(entry.recording)}
                onDelete={() => onDelete(entry.recording)}
                primaryAction={
                  getTeamsEventId(entry.recording) ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8"
                      onClick={() => onViewDetails(entry.recording)}
                    >
                      View job
                    </Button>
                  ) : undefined
                }
              />
            )}
          </MotionListItem>
        ))}
      </MotionList>
    </div>
  );
}

export const AudioRecordingsList = memo(AudioRecordingsListComponent);

function TeamsMeetingActions({
  meeting,
  displayName,
  accessDenied,
  useCardLayout,
  onProcess,
  isProcessing,
  processingMeetingId,
}: {
  meeting: TeamsMeeting;
  displayName: string;
  accessDenied: boolean;
  useCardLayout: boolean;
  onProcess?: (meeting: TeamsMeeting) => void;
  isProcessing?: boolean;
  processingMeetingId?: string | null;
}) {
  const canProcess = !accessDenied || Boolean(meeting.recordingIds?.length);
  const processKind =
    meeting.transcriptIds?.length && !accessDenied ? "transcript" : "recording";
  const requestUrl = accessDenied ? getTeamsAccessRequestUrl(meeting) : null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {!accessDenied && Boolean(meeting.transcriptIds?.length) && (
        <Button asChild variant="outline" size="sm" className="h-8">
          <Link
            to="/audio-recordings/$id"
            params={{ id: `teams:${meeting.id}` }}
            search={{ from: "files" }}
          >
            View transcription
          </Link>
        </Button>
      )}
      {canProcess && (
        <Button
          variant="outline"
          size="sm"
          className={useCardLayout ? "h-8 min-w-0 flex-1 gap-2" : "h-8 gap-2"}
          onClick={() => onProcess?.(meeting)}
          disabled={isProcessing || !onProcess}
          aria-label={`Process ${processKind} for ${displayName}`}
        >
          {processingMeetingId === meeting.id ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Video className="h-4 w-4" aria-hidden="true" />
          )}
          <span>{useCardLayout ? `Process ${processKind}` : "Process"}</span>
        </Button>
      )}
      {accessDenied &&
        (requestUrl ? (
          <Button asChild variant="outline" size="sm" className="h-8">
            <a
              href={requestUrl}
              aria-label={`Request transcript access from ${meeting.organizer} for ${displayName}`}
            >
              Request access
            </a>
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            disabled
            title="Meeting organiser email is unavailable"
          >
            Request access
          </Button>
        ))}
    </div>
  );
}

function LoadingSkeleton({ viewMode }: { viewMode: "card" | "table" }) {
  if (viewMode === "card") {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-lg border p-4">
            <div className="flex justify-between">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-4" />
            </div>
            <Skeleton className="h-20 w-full" />
            <div className="flex justify-between pt-2">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-8" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="bg-card rounded-md border">
      <div className="space-y-4 p-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <Skeleton className="h-12 w-12 rounded" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-[200px]" />
              <Skeleton className="h-3 w-[150px]" />
            </div>
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-8 w-8" />
          </div>
        ))}
      </div>
    </div>
  );
}
