import type { RecordingSummary } from "./file-entry";
import { parseDate } from "@/lib/date-utils";


export interface RecordingFilters {
  search?: string;
  status?: string;
  created_at_start?: string;
  created_at_end?: string;
}

export function matchesRecordingStatus(
  status: string | undefined,
  filter?: string,
): boolean {
  if (!filter || filter === "all") return true;
  if (filter === "processing")
    return [
      "processing",
      "pending",
      "transcribing",
      "transcribed",
      "analysing",
    ].includes(status ?? "");
  if (filter === "failed") return status === "failed" || status === "error";
  return status === filter;
}

/** Date-only filters use the same UTC day boundaries as the jobs API. */
export function matchesRecordingFilters(
  recording: RecordingSummary,
  filters: RecordingFilters,
  extraSearch = "",
): boolean {
  if (!matchesRecordingStatus(recording.status, filters.status)) return false;
  const created = parseDate(recording.created_at)?.getTime();
  if (
    filters.created_at_start &&
    (created === undefined ||
      created < Date.parse(`${filters.created_at_start}T00:00:00Z`))
  )
    return false;
  if (
    filters.created_at_end &&
    (created === undefined ||
      created > Date.parse(`${filters.created_at_end}T23:59:59.999Z`))
  )
    return false;
  const search = filters.search?.trim().toLocaleLowerCase() ?? "";
  return (
    [
      recording.id,
      recording.displayname,
      recording.display_name,
      recording.file_name,
      recording.filename,
      extraSearch,
    ].some((value) => value?.toLocaleLowerCase().includes(search)) ||
    search === ""
  );
}
