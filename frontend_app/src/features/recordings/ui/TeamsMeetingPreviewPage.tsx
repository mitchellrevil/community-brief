import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { ContentTabs } from "./RecordingDetails/ContentTabs";
import { RecordingActionsCard } from "./RecordingDetails/RecordingActionsCard";
import { RecordingDetailsCard } from "./RecordingDetails/RecordingDetailsCard";
import { RecordingHeader } from "./RecordingDetails/RecordingHeader";
import { TeamsTranscriptDialog } from "./TeamsTranscriptDialog";
import type { ExtendedAudioRecording } from "./RecordingDetails/hooks/useRecordingData";
import { Button } from "@/components/ui/button";
import { MotionDiv } from "@/components/ui/motion";
import { useTeamsRecordings } from "@/features/teams/hooks/useTeamsRecordings";
import { getTeamsAccessRequestUrl } from "@/features/teams";
import { isTeamsRecordingsEnabled } from "@/config/runtime-config";
import { useIsMobile } from "@/hooks/useMobile";
import { fadeInUp, slideInFromRight, staggerContainer } from "@/lib/motion";

export function TeamsMeetingPreviewPage({ meetingId }: { meetingId: string }) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const isTinyScreen = typeof window !== "undefined" && window.innerWidth < 480;
  const enabled = isTeamsRecordingsEnabled();
  const teams = useTeamsRecordings(enabled, meetingId);
  const meeting = teams.meetings.at(0);
  const selectedTranscript = teams.selectedTranscript?.meeting.id === meetingId
    ? teams.selectedTranscript
    : null;
  const requestedId = useRef<string | null>(null);
  const [transcriptionText, setTranscriptionText] = useState("");
  const [showProcessForm, setShowProcessForm] = useState(false);
  const [processRecordingOnDownload, setProcessRecordingOnDownload] = useState(false);
  const accessDenied = Boolean(meeting?.transcriptAccessDenied || teams.deniedMeetingIds.includes(meetingId));

  useEffect(() => {
    if (!meeting || requestedId.current === meeting.id || accessDenied || !meeting.transcriptIds?.length) return;
    requestedId.current = meeting.id;
    teams.process(meeting);
  }, [meeting, teams.process, accessDenied]);

  useEffect(() => {
    if (processRecordingOnDownload && selectedTranscript?.bundle.source === "recording") {
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
    return () => { cancelled = true; };
  }, [selectedTranscript]);

  const accessUrl = accessDenied && meeting ? getTeamsAccessRequestUrl(meeting) : null;
  const recording: ExtendedAudioRecording | null = meeting ? {
    id: `teams:${meeting.id}`,
    user_id: "",
    file_path: "",
    transcription_file_path: null,
    analysis_file_path: null,
    prompt_category_id: "",
    prompt_subcategory_id: "",
    status: meeting.transcriptIds?.length && !accessDenied && selectedTranscript?.bundle.source !== "recording" ? "transcribed" : "uploaded",
    transcription_id: null,
    created_at: Date.parse(meeting.startDateTime),
    updated_at: Date.parse(meeting.endDateTime),
    type: "teams",
    _rid: "",
    _self: "",
    _etag: "",
    _attachments: "",
    _ts: 0,
    displayname: meeting.subject,
    audio_duration_seconds: Math.max(0, (Date.parse(meeting.endDateTime) - Date.parse(meeting.startDateTime)) / 1000),
  } : null;

  return (
    <>
      <MotionDiv
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="xs:px-3 xs:py-4 xs:space-y-4 mx-auto w-full max-w-7xl space-y-3 px-2 py-3 sm:px-4 lg:px-6"
      >
        {recording && <RecordingHeader recording={recording} isTinyScreen={isTinyScreen} readOnlyName />}
        {teams.isLoading || teams.isProcessing ? (
          <div className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Loading Teams transcription...</div>
        ) : !enabled ? (
          <p className="text-muted-foreground text-sm">Teams meetings are not enabled for this site.</p>
        ) : (!accessDenied && teams.error) || !meeting || !recording ? (
          <div className="space-y-3 rounded-lg border p-4 text-sm">
            <p role="alert">{teams.error ?? "This meeting is no longer available in your Teams list."}</p>
            <Button variant="outline" onClick={() => {
              if (meeting) teams.process(meeting);
              else teams.refresh();
            }}>Try again</Button>
          </div>
        ) : (
          <MotionDiv variants={fadeInUp} className="xs:gap-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
            <MotionDiv variants={fadeInUp} className="xs:space-y-4 space-y-3 lg:col-span-2">
              {accessDenied ? (
                <div className="rounded-lg border p-4 text-sm">Transcript access is needed from the meeting organiser.</div>
              ) : !meeting.transcriptIds?.length || selectedTranscript?.bundle.source === "recording" ? (
                <div className="rounded-lg border p-4 text-sm">Teams has no usable transcript for this meeting. Process the recording to create one.</div>
              ) : (
                <ContentTabs
                  transcriptionText={transcriptionText}
                  analysisText={undefined}
                  analysisFilePath={undefined}
                  jobId=""
                  createdAt={meeting.startDateTime}
                  transcriptionFilePath={undefined}
                  isTranscriptionProcessing={false}
                  shouldShowTranscriptionError={false}
                  transcriptionError={null}
                  onRefetchTranscription={() => teams.process(meeting)}
                  canEdit={false}
                  onSegmentClick={() => {}}
                  onDownload={() => {}}
                  compact={isMobile}
                  isMobile={isMobile}
                  isTinyScreen={isTinyScreen}
                />
              )}
            </MotionDiv>
            <MotionDiv variants={slideInFromRight} className="xs:space-y-4 space-y-3">
              <RecordingDetailsCard
                recording={recording}
                categoryDisplay="Teams meeting"
                subcategoryDisplay={meeting.organizer}
                durationSeconds={recording.audio_duration_seconds}
                isTinyScreen={isTinyScreen}
              />
              <RecordingActionsCard
                isOwner={false}
                isShared={false}
                jobId={recording.id}
                onShare={() => {}}
                onDelete={() => {}}
                onCopyLink={() => void navigator.clipboard.writeText(window.location.href)}
                onProcessTeams={selectedTranscript
                  ? () => setShowProcessForm(true)
                  : meeting.recordingIds?.length
                    ? () => {
                        setProcessRecordingOnDownload(true);
                        teams.process(meeting);
                      }
                    : undefined}
                processTeamsLabel={selectedTranscript ? `Process ${selectedTranscript.bundle.source}` : "Process recording"}
                onRequestTeamsAccess={accessUrl ? () => { window.location.href = accessUrl; } : undefined}
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
          setShowProcessForm(false);
          localStorage.setItem("current_recording_id", jobId);
          void navigate({ to: "/audio-recordings/$id", params: { id: jobId }, search: { from: "files" } });
        }}
      />
    </>
  );
}
