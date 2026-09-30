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
          <MediaUploadForm
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
