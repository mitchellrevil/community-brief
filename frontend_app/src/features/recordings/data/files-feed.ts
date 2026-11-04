import { matchesRecordingFilters } from "./recording-filters";
import {
  getTeamsRecordings,
  sortRecordingsByCreated,
} from "./teams-recordings";
import type { TeamsMeeting } from "@/features/teams";

import type { TeamsImportJob } from "./api";
import type { FileEntry, ListedJob } from "./file-entry";
import type { RecordingFilters } from "./recording-filters";

interface FilesFeedInput {
  jobs: Array<ListedJob>;
  jobCount: number;
  queuedEntries: Array<FileEntry>;
  meetings: Array<TeamsMeeting>;
  importedJobs: Array<TeamsImportJob>;
  candidates: Array<TeamsMeeting>;
  calendarComplete: boolean;
  filters: RecordingFilters;
  includeFiles: boolean;
  mergePages: boolean;
  page: number;
  pageSize: number;
}

/** Merge source metadata into real jobs, then sort and page one collection. */
export function buildFilesFeed(input: FilesFeedInput): {
  entries: Array<FileEntry>;
  totalCount: number;
} {
  const teamsCards = getTeamsRecordings(
    input.meetings,
    {
      search: input.filters.search ?? "",
      status: input.filters.status ?? "all",
      createdAtStart: input.filters.created_at_start,
      createdAtEnd: input.filters.created_at_end,
    },
    input.importedJobs,
    input.candidates,
    input.calendarComplete,
  );
  const loadedJobs = new Map(input.jobs.map((job) => [job.id, job]));
  const linkedIds = new Set<string>();
  let importsAlreadyCounted = 0;
  const teamsEntries: Array<FileEntry> = [];
  for (const card of teamsCards) {
    if (card.importedJob) {
      const savedJob = loadedJobs.get(card.id) ?? card.importedJob;
      const displayname =
        savedJob.displayname && savedJob.displayname !== savedJob.file_name
          ? savedJob.displayname
          : card.displayname;
      linkedIds.add(card.id);
      if (
        input.includeFiles &&
        matchesRecordingFilters(card.importedJob, input.filters)
      )
        importsAlreadyCounted += 1;
      teamsEntries.push({
        kind: "job",
        id: card.id,
        recording: { ...savedJob, displayname, source: card.source },
        meeting: card.teamsMeeting,
      });
    } else if (card.teamsMeeting) {
      teamsEntries.push({
        kind: "meeting",
        id: card.id,
        recording: card,
        meeting: card.teamsMeeting,
      });
    }
  }
  const queued = input.includeFiles
    ? input.queuedEntries.filter((entry) =>
        matchesRecordingFilters(entry.recording, input.filters),
      )
    : [];
  const entries: Array<FileEntry> = [
    ...queued,
    ...input.jobs
      .filter((job) => !linkedIds.has(job.id))
      .map((job): FileEntry => ({ kind: "job", id: job.id, recording: job })),
    ...teamsEntries,
  ];
  const sorted = sortRecordingsByCreated(
    entries.map((entry) => ({
      ...entry,
      created_at: entry.recording.created_at,
    })),
  );
  const offset = (input.page - 1) * input.pageSize;
  return {
    entries: input.mergePages
      ? sorted.slice(offset, offset + input.pageSize)
      : sorted,
    totalCount:
      input.jobCount +
      teamsEntries.length +
      queued.length -
      importsAlreadyCounted,
  };
}
