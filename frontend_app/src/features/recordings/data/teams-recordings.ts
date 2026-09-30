import type { TeamsMeeting } from "@/features/teams";
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
) {
  if (status !== "all") return [];
  const searchText = search.trim().toLocaleLowerCase();
  const start = createdAtStart
    ? new Date(`${createdAtStart}T00:00:00`).getTime()
    : -Infinity;
  const end = createdAtEnd
    ? new Date(`${createdAtEnd}T23:59:59.999`).getTime()
    : Infinity;

  return meetings.flatMap((meeting) => {
    const createdAt = meeting.createdDateTime ?? meeting.startDateTime;
    const createdTime = Date.parse(createdAt);
    const text =
      `${meeting.subject} ${meeting.organizer} ${meeting.organizerEmail ?? ""}`.toLocaleLowerCase();
    if (createdTime < start || createdTime > end || !text.includes(searchText))
      return [];
    const duration =
      (Date.parse(meeting.endDateTime) - Date.parse(meeting.startDateTime)) /
      1000;
    return [
      {
        id: `teams:${meeting.id}`,
        source: "teams" as const,
        displayname: meeting.subject,
        file_name: "Microsoft Teams",
        status: "pending" as const,
        created_at: createdAt,
        updated_at: meeting.lastModifiedDateTime,
        audio_duration_seconds: duration > 0 ? duration : undefined,
        teamsMeeting: meeting,
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
