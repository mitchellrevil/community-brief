export const recordingsKeys = {
  // Canonical base for recordings queries.
  base: () => ["community-brief", "audio-recordings"] as const,

  // List / paginated views
  list: (page = 1, perPage = 12, filters: any = {}) => ["community-brief", "audio-recordings", page, perPage, filters] as const,
  infinite: (pageSize = 12, filters: any = {}) => ["community-brief", "audio-recordings", "infinite", pageSize, filters] as const,

  // Single recording
  single: (id: string) => ["community-brief", "audio-recordings", "single", id] as const,
  transcription: (id: string) => ["community-brief", "audio-recordings", "transcription", id] as const,

  // Shared jobs.
  sharedJobs: () => ["community-brief", "shared-jobs"] as const,

  // Analysis refinement
  analysisBase: () => ["community-brief", "analysis-refinement"] as const,
  analysisHistory: (jobId: string) =>
    ["community-brief", "analysis-refinement", "history", jobId] as const,
  analysisSuggestions: (jobId: string) =>
    ["community-brief", "analysis-refinement", "suggestions", jobId] as const,

  // Deleted / admin views
  deletedJobs: (page = 1, perPage = 20, user = "all") => ["community-brief", "deleted-jobs", page, perPage, user] as const,
  adminAllJobs: (page = 1, perPage = 20, user = "all") => ["community-brief", "adminAllJobs", page, perPage, user] as const,

  // Job sharing info (preserve existing shape used across the app/tests)
  jobSharingInfo: (jobId: string) => ["jobSharingInfo", jobId] as const,
};

export type RecordingsKeyFactory = typeof recordingsKeys;
