type RecordingStatus =
  | "completed"
  | "processing"
  | "uploaded"
  | "pending"
  | "transcribing"
  | "transcribed"
  | "analysing"
  | "failed"
  | "error"
  | "queued"
  | "default";

export function normalizeRecordingStatus(
  status: string | undefined,
): RecordingStatus {
  const knownStatuses: Array<RecordingStatus> = [
    "completed",
    "processing",
    "uploaded",
    "pending",
    "transcribing",
    "transcribed",
    "analysing",
    "failed",
    "error",
    "queued",
    "default",
  ];

  const normalizedStatus = status?.toLowerCase() as RecordingStatus | undefined;
  return normalizedStatus && knownStatuses.includes(normalizedStatus)
    ? normalizedStatus
    : "default";
}
