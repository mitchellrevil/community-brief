import { matchesRecordingFilters } from "./recording-filters";
import { getTeamsEventId } from "./recording-source";
import type { TeamsMeeting } from "@/features/teams";
import type { TeamsImportJob } from "./api";
import { mediaFilename } from "@/features/teams";
import { parseDate } from "@/lib/date-utils";


interface TeamsRecordingFilters {
  search: string;
  status: string;
  createdAtStart?: string;
  createdAtEnd?: string;
}

export function getTeamsRecordings(
  meetings: Array<TeamsMeeting>,
  { search, status, createdAtStart, createdAtEnd }: TeamsRecordingFilters,
  jobs: Array<TeamsImportJob> = [],
  candidates: Array<TeamsMeeting> = meetings,
  matchHistoricImports = true,
) {
  const meetingById = new Map(
    [...candidates, ...meetings].map((meeting) => [meeting.id, meeting]),
  );
  const filenameMeetings = new Map<string, Array<TeamsMeeting>>();
  const filenameJobCounts = new Map<string, number>();
  for (const job of jobs) {
    if (job.file_name)
      filenameJobCounts.set(
        job.file_name,
        (filenameJobCounts.get(job.file_name) ?? 0) + 1,
      );
  }
  for (const meeting of meetingById.values()) {
    const filenames = [
      mediaFilename(meeting, "vtt"),
      mediaFilename(meeting, "mp4"),
      mediaFilename(meeting, "mp4").replace(/\.mp4$/, ".wav"),
    ];
    for (const filename of filenames) {
      filenameMeetings.set(filename, [
        ...(filenameMeetings.get(filename) ?? []),
        meeting,
      ]);
    }
  }
  const linkedJobs = jobs.flatMap((job) => {
    const eventId = getTeamsEventId(job);
    if (eventId) return [{ job, meeting: meetingById.get(eventId) }];
    if (!matchHistoricImports) return [];
    const matches = filenameMeetings.get(job.file_name ?? "") ?? [];
    // Historic imports have no event ID. Only infer an unambiguous exact dated filename.
    if (
      matches.length !== 1 ||
      filenameJobCounts.get(job.file_name ?? "") !== 1 ||
      Date.parse(job.created_at) < Date.parse(matches[0].startDateTime)
    )
      return [];
    return [{ job, meeting: matches[0] }];
  });
  const importedMeetingIds = new Set(
    linkedJobs.map(({ job, meeting }) => meeting?.id ?? getTeamsEventId(job)),
  );
  const entries: Array<{ meeting?: TeamsMeeting; job?: TeamsImportJob }> = [
    ...linkedJobs,
    ...meetings
      .filter((meeting) => !importedMeetingIds.has(meeting.id))
      .map((meeting) => ({ meeting })),
  ];
  return entries.flatMap(({ meeting, job }) => {
    if (!job && status !== "all") return [];
    const createdAt =
      job?.created_at ?? meeting!.createdDateTime ?? meeting!.startDateTime;
    const extraSearch = `${meeting?.subject ?? ""} ${meeting?.organizer ?? ""} ${meeting?.organizerEmail ?? ""}`;
    if (
      !matchesRecordingFilters(
        { ...job, id: job?.id ?? meeting!.id, created_at: createdAt },
        {
          search,
          status: job ? status : "all",
          created_at_start: createdAtStart,
          created_at_end: createdAtEnd,
        },
        extraSearch,
      )
    )
      return [];
    const duration =
      (Date.parse(meeting?.endDateTime ?? "") -
        Date.parse(meeting?.startDateTime ?? "")) /
      1000;
    return [
      {
        id: job?.id ?? `teams:${meeting!.id}`,
        source: {
          kind: "teams" as const,
          event_id: meeting?.id ?? getTeamsEventId(job!)!,
        },
        displayname:
          meeting?.subject ??
          job?.displayname ??
          job?.file_name ??
          "Teams meeting",
        file_name: job?.file_name,
        status: job?.status ?? "pending",
        created_at: createdAt,
        updated_at: job?.updated_at ?? meeting?.lastModifiedDateTime,
        audio_duration_seconds: duration > 0 ? duration : undefined,
        teamsMeeting: meeting,
        importedJob: job,
      },
    ];
  });
}

export function sortRecordingsByCreated<
  T extends { created_at?: string | number | null },
>(recordings: Array<T>): Array<T> {
  return [...recordings].sort(
    (left, right) =>
      (parseDate(right.created_at)?.getTime() ?? 0) -
      (parseDate(left.created_at)?.getTime() ?? 0),
  );
}
