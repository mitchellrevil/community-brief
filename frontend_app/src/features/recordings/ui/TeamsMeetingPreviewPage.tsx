import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { getTeamsEventId } from "../data/recording-source";
import { RecordingActionsCard } from "./RecordingDetails/RecordingActionsCard";
import { RecordingDetailsCard } from "./RecordingDetails/RecordingDetailsCard";
import { RecordingHeader } from "./RecordingDetails/RecordingHeader";
import { TeamsTranscriptDialog } from "./TeamsTranscriptDialog";
import { TranscriptionViewer } from "./TranscriptionViewer";
import type { RecordingSummary } from "../data/file-entry";
import { fadeInUp, slideInFromRight, staggerContainer } from "@/lib/motion";
import { useIsMobile } from "@/hooks/useMobile";
import { useTeamsRecordings } from "@/features/teams/hooks/useTeamsRecordings";
import { getTeamsAccessRequestUrl } from "@/features/teams";
import { isTeamsRecordingsEnabled } from "@/config/runtime-config";
import { MotionDiv } from "@/components/ui/motion";
import { Button } from "@/components/ui/button";

export function TeamsMeetingPreviewPage({ meetingId }: { meetingId: string }) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const isTinyScreen = typeof window !== "undefined" && window.innerWidth < 480;
  const enabled = isTeamsRecordingsEnabled();
  const teams = useTeamsRecordings(enabled, meetingId);
  const meeting = teams.meetings.at(0);
  const selectedTranscript =
    teams.selectedTranscript?.meeting.id === meetingId
      ? teams.selectedTranscript
      : null;
  const requestedId = useRef<string | null>(null);
  const [transcriptionText, setTranscriptionText] = useState("");
  const [showProcessForm, setShowProcessForm] = useState(false);
  const [processRecordingOnDownload, setProcessRecordingOnDownload] =
    useState(false);
  const accessDenied = Boolean(
    meeting?.transcriptAccessDenied ||
    teams.deniedMeetingIds.includes(meetingId),
  );
  const importedJob = teams.importedJobs.find(
    (job) => getTeamsEventId(job) === meetingId,
  );

  useEffect(() => {
    if (!importedJob) return;
    void navigate({
      to: "/audio-recordings/$id",
      params: { id: importedJob.id },
      search: { from: "files" },
      replace: true,
    });
  }, [importedJob?.id, navigate]);

  useEffect(() => {
    if (
      !teams.canProcess ||
      importedJob ||
      !meeting ||
      requestedId.current === meeting.id ||
      accessDenied ||
      !meeting.transcriptIds?.length
    )
      return;
    requestedId.current = meeting.id;
    teams.process(meeting);
  }, [meeting, teams.process, teams.canProcess, importedJob, accessDenied]);

  useEffect(() => {
    if (
      processRecordingOnDownload &&
      selectedTranscript?.bundle.source === "recording"
    ) {
      setProcessRecordingOnDownload(false);
      setShowProcessForm(true);
    }
  }, [processRecordingOnDownload, selectedTranscript]);

  useEffect(() => {
    let cancelled = false;
    setTranscriptionText("");
    if (selectedTranscript?.bundle.source === "transcript") {
      void selectedTranscript.bundle.file.text().then((text) => {
        if (!cancelled) setTranscriptionText(text);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [selectedTranscript]);

  const accessUrl =
    accessDenied && meeting ? getTeamsAccessRequestUrl(meeting) : null;
  const recording: RecordingSummary | null = meeting
    ? {
        id: meeting.id,
        displayname: meeting.subject,
        status:
          meeting.transcriptIds?.length && !accessDenied
            ? "transcribed"
            : "uploaded",
        created_at: meeting.startDateTime,
        updated_at: meeting.lastModifiedDateTime,
        audio_duration_seconds: Math.max(
          0,
          (Date.parse(meeting.endDateTime) -
            Date.parse(meeting.startDateTime)) /
            1000,
        ),
      }
    : null;

  return (
    <>
      <MotionDiv
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="xs:px-3 xs:py-4 xs:space-y-4 mx-auto w-full max-w-7xl space-y-3 px-2 py-3 sm:px-4 lg:px-6"
      >
        {recording && (
          <RecordingHeader
            recording={recording}
            isTinyScreen={isTinyScreen}
            readOnlyName
          />
        )}
        {teams.isLoading || teams.isProcessing ? (
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading Teams
            transcription...
          </div>
        ) : !enabled ? (
          <p className="text-muted-foreground text-sm">
            Teams meetings are not enabled for this site.
          </p>
        ) : (!accessDenied && teams.error) || !meeting || !recording ? (
          <div className="space-y-3 rounded-lg border p-4 text-sm">
            <p role="alert">
              {teams.error ??
                "This meeting is no longer available in your Teams list."}
            </p>
            <Button
              variant="outline"
              onClick={() => {
                if (meeting) teams.process(meeting);
                else teams.refresh();
              }}
            >
              Try again
            </Button>
          </div>
        ) : (
          <MotionDiv
            variants={fadeInUp}
            className="xs:gap-4 grid grid-cols-1 gap-3 lg:grid-cols-3"
          >
            <MotionDiv
              variants={fadeInUp}
              className="xs:space-y-4 space-y-3 lg:col-span-2"
            >
              {accessDenied ? (
                <div className="rounded-lg border p-4 text-sm">
                  Transcript access is needed from the meeting organiser.
                </div>
              ) : !meeting.transcriptIds?.length ||
                selectedTranscript?.bundle.source === "recording" ? (
                <div className="rounded-lg border p-4 text-sm">
                  Teams has no usable transcript for this meeting. Process the
                  recording to create one.
                </div>
              ) : (
                <TranscriptionViewer
                  transcriptionText={transcriptionText}
                  canEdit={false}
                  compact={isMobile}
                />
              )}
            </MotionDiv>
            <MotionDiv
              variants={slideInFromRight}
              className="xs:space-y-4 space-y-3"
            >
              <RecordingDetailsCard
                recording={recording}
                idLabel="Meeting ID"
                categoryDisplay="Teams meeting"
                subcategoryDisplay={meeting.organizer}
                durationSeconds={recording.audio_duration_seconds ?? undefined}
                isTinyScreen={isTinyScreen}
              />
              <RecordingActionsCard
                isOwner={false}
                isShared={false}
                jobId={recording.id}
                onCopyLink={() =>
                  void navigator.clipboard.writeText(window.location.href)
                }
                onProcessTeams={
                  selectedTranscript
                    ? () => setShowProcessForm(true)
                    : meeting.recordingIds?.length
                      ? () => {
                          setProcessRecordingOnDownload(true);
                          teams.process(meeting);
                        }
                      : undefined
                }
                processTeamsLabel={
                  selectedTranscript
                    ? `Process ${selectedTranscript.bundle.source}`
                    : "Process recording"
                }
                onRequestTeamsAccess={
                  accessUrl
                    ? () => {
                        window.location.href = accessUrl;
                      }
                    : undefined
                }
                isTinyScreen={isTinyScreen}
              />
            </MotionDiv>
          </MotionDiv>
        )}
      </MotionDiv>
      <TeamsTranscriptDialog
        transcript={showProcessForm ? selectedTranscript : null}
        onClose={() => setShowProcessForm(false)}
        onImported={(jobId) => {
          if (selectedTranscript)
            teams.markImported(
              selectedTranscript.meeting,
              jobId,
              selectedTranscript.bundle.file.name,
            );
          setShowProcessForm(false);
          localStorage.setItem("current_recording_id", jobId);
          void navigate({
            to: "/audio-recordings/$id",
            params: { id: jobId },
            search: { from: "files" },
          });
        }}
      />
    </>
  );
}
