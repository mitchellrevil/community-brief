import type { TeamsMeeting } from "@/features/teams";
import type { QueuedRecording } from "@/lib/pwa-queue";
import type { TeamsJobSource } from "@/types/api/audio-recordings";

/** Data needed to display an item, independent of its storage or processing state. */
export interface RecordingSummary {
  id: string;
  displayname?: string;
  display_name?: string;
  file_name?: string;
  filename?: string;
  file_path?: string;
  status?: string;
  created_at?: string | number | null;
  updated_at?: string | number | null;
  audio_duration_seconds?: number | null;
  user_id?: string;
  user_email?: string;
  teams_event_id?: string;
  source?: TeamsJobSource;
  _ts?: number;
  ttl?: number | null;
}

export type ListedJob = RecordingSummary;

/** Only jobs have job actions. Meetings and offline uploads have their own lifecycle. */
export type FileEntry =
  | { kind: "job"; id: string; recording: ListedJob; meeting?: TeamsMeeting }
  | {
      kind: "meeting";
      id: string;
      recording: RecordingSummary;
      meeting: TeamsMeeting;
    }
  | {
      kind: "queued";
      id: string;
      recording: RecordingSummary;
      upload: QueuedRecording;
    };

export function queuedFileEntry(upload: QueuedRecording): FileEntry {
  return {
    kind: "queued",
    id: upload.id,
    upload,
    recording: {
      id: upload.id,
      displayname: upload.metadata.fileName ?? upload.metadata.categoryName,
      status: "queued",
      created_at: upload.createdAt,
    },
  };
}
