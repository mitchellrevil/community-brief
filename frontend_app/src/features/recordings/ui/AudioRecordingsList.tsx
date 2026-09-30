import { memo } from "react";
import { FileAudio, Loader2, Video } from "lucide-react";
import { AudioRecordingCard } from "./AudioRecordingCard";
import type {TeamsMeeting} from "@/features/teams";
import {  getTeamsAccessRequestUrl } from "@/features/teams";
import { Button } from "@/components/ui/button";
import { MotionList, MotionListItem } from "@/components/ui/motion-list";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/date-utils";
import { isAudioFile } from "@/lib/file-utils";


interface AudioRecordingsListProps {
  recordings: Array<any>;
  isLoading: boolean;
  viewMode: "card" | "table";
  onViewModeChange: (mode: "card" | "table") => void;
  onViewDetails: (recording: any) => void;
  onPlay: (recording: any) => void;
  onDownload: (recording: any) => void;
  onRetryProcessing: (recording: any) => void;
  onShare: (recording: any) => void;
  onDelete: (recording: any) => void;
  "data-tutorial"?: string;
  onProcessTeamsMeeting?: (meeting: TeamsMeeting) => void;
  processingTeamsMeetingId?: string | null;
  isProcessingTeamsMeeting?: boolean;
  deniedTeamsMeetingIds?: Array<string>;
}

function AudioRecordingsListComponent({
  recordings,
  isLoading,
  viewMode,
  onViewModeChange,
  onViewDetails,
  onPlay,
  onDownload,
  onRetryProcessing,
  onShare,
  onDelete,
  "data-tutorial": dataTutorial,
  onProcessTeamsMeeting,
  processingTeamsMeetingId,
  isProcessingTeamsMeeting,
  deniedTeamsMeetingIds = [],
}: AudioRecordingsListProps) {
  if (isLoading) {
    return <LoadingSkeleton viewMode={viewMode} />;
  }

  if (recordings.length === 0) {
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

  const useCardLayout = viewMode === "card" || window.innerWidth < 640;

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
        {recordings.map((recording) =>
          recording.source === "teams" ? (
            <MotionListItem key={recording.id} as="div">
              <AudioRecordingCard
                recording={recording}
                layout={useCardLayout ? "card" : "list"}
                isEditable={false}
                ownerLabel={recording.teamsMeeting.organizer}
                statusLabel={
                  recording.teamsMeeting.transcriptAccessDenied ||
                  deniedTeamsMeetingIds.includes(recording.teamsMeeting.id)
                    ? "Transcript access needed"
                    : recording.teamsMeeting.transcriptIds?.length
                      ? "Transcript available"
                      : "Recording available"
                }
                durationDescription="Scheduled meeting length"
                metadataItems={[
                  {
                    label: "Meeting",
                    value: formatDateTime(recording.teamsMeeting.startDateTime),
                  },
                ]}
                primaryAction={
                  <TeamsMeetingActions
                    meeting={recording.teamsMeeting}
                    displayName={recording.displayname}
                    accessDenied={
                      recording.teamsMeeting.transcriptAccessDenied ||
                      deniedTeamsMeetingIds.includes(recording.teamsMeeting.id)
                    }
                    useCardLayout={useCardLayout}
                    onProcess={onProcessTeamsMeeting}
                    onView={() => onViewDetails(recording)}
                    isProcessing={isProcessingTeamsMeeting}
                    processingMeetingId={processingTeamsMeetingId}
                  />
                }
              />
            </MotionListItem>
          ) : (
            <MotionListItem key={recording.id} as="div">
              <AudioRecordingCard
                recording={recording}
                layout={useCardLayout ? "card" : "list"}
                onViewDetails={() => onViewDetails(recording)}
                onPlay={
                  isAudioFile(recording.file_path)
                    ? () => onPlay(recording)
                    : undefined
                }
                onDownload={() => onDownload(recording)}
                onRetryProcessing={() => onRetryProcessing(recording)}
                onShare={() => onShare(recording)}
                onDelete={() => onDelete(recording)}
              />
            </MotionListItem>
          ),
        )}
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
  onView,
  isProcessing,
  processingMeetingId,
}: {
  meeting: TeamsMeeting;
  displayName: string;
  accessDenied: boolean;
  useCardLayout: boolean;
  onProcess?: (meeting: TeamsMeeting) => void;
  onView: () => void;
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
        <Button variant="outline" size="sm" className="h-8" onClick={onView}>
          View transcription
        </Button>
      )}
      {canProcess && (
        <Button
          variant="outline"
          size="sm"
          className={useCardLayout ? "h-8 min-w-0 flex-1 gap-2" : "h-8 gap-2"}
          onClick={() => onProcess?.(meeting)}
          disabled={isProcessing}
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
