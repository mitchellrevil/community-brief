import type { TeamsJobSource } from "@/types/api/audio-recordings";

/** Recognize both persisted provenance and jobs imported by earlier app versions. */
export function getTeamsEventId(job: {
  source?: TeamsJobSource;
  teams_event_id?: string;
}): string | undefined {
  return job.source?.kind === "teams"
    ? job.source.event_id
    : job.teams_event_id;
}
