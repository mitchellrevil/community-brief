import type { SelectedTeamsTranscript } from "@/features/teams/hooks/useTeamsRecordings";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MediaUploadForm } from "@/features/uploads";

export function TeamsTranscriptDialog({
  transcript,
  onClose,
  onImported,
}: {
  transcript: SelectedTeamsTranscript | null;
  onClose: () => void;
  onImported: (jobId: string) => void;
}) {
  return (
    <Dialog
      open={Boolean(transcript)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {transcript && (
        <DialogContent className="w-[calc(100vw-2rem)] sm:!max-w-6xl">
          <DialogHeader>
            <DialogTitle>Process {transcript.meeting.subject}</DialogTitle>
            <DialogDescription>
              Select the Community Brief template and complete any required meeting
              details.
            </DialogDescription>
          </DialogHeader>
          {transcript.bundle.source === "transcript" &&
            !transcript.bundle.hasSpeakerAttribution && (
              <p role="status" className="text-muted-foreground text-sm">
                Teams supplied these captions without speaker names. Processing
                this transcript preserves the text. Speaker labels require
                transcription of the meeting recording with speaker detection
                enabled.
              </p>
            )}
          <MediaUploadForm
            teamsEventId={transcript.meeting.id}
            key={transcript.bundle.file.name}
            mediaFile={transcript.bundle.file}
            filePickerVisible={false}
            submitLabel={`Process ${transcript.bundle.source}`}
            onSuccess={(jobId) => {
              onClose();
              onImported(jobId);
            }}
          />
        </DialogContent>
      )}
    </Dialog>
  );
}
