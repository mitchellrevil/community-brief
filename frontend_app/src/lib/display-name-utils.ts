import { getFileNameFromPath } from "@/lib/file-utils";

/**
 * Get the display name for a job/recording with fallback logic
 */
export function getDisplayName(job: {
  displayname?: string;
  file_name?: string;
  filename?: string;
  file_path?: string;
}): string {
  return (
    job.displayname ||
    job.file_name ||
    job.filename ||
    (job.file_path ? getFileNameFromPath(job.file_path) : null) ||
    "Untitled Recording"
  );
}
