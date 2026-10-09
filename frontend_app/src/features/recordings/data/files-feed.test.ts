import { describe, expect, it } from "vitest";

import { buildFilesFeed } from "./files-feed";
import type { TeamsMeeting } from "@/features/teams";

const meeting: TeamsMeeting = {
  id: "event-1",
  subject: "Review",
  organizer: "Alex",
  organizerEmail: "alex@example.test",
  startDateTime: "2026-09-09T09:00:00Z",
  endDateTime: "2026-09-09T10:00:00Z",
  joinUrl: "https://teams.microsoft.com/meeting",
};
const imported = {
  id: "saved",
  source: { kind: "teams" as const, event_id: meeting.id },
  status: "completed",
  created_at: "2026-09-10T09:00:00Z",
};
const options = {
  jobs: [],
  jobCount: 0,
  queuedEntries: [],
  meetings: [meeting],
  importedJobs: [imported],
  candidates: [meeting],
  calendarComplete: true,
  filters: {},
  includeFiles: true,
  mergePages: true,
  page: 1,
  pageSize: 12,
};

describe("Files feed", () => {
  it("counts a linked job once even when it is outside the loaded file pages", () => {
    const feed = buildFilesFeed({
      ...options,
      jobCount: 30,
      jobs: [
        {
          id: "other",
          status: "completed",
          created_at: "2026-09-11T09:00:00Z",
        },
      ],
    });
    expect(feed.totalCount).toBe(30);
    expect(feed.entries.map((entry) => [entry.kind, entry.id])).toEqual([
      ["job", "other"],
      ["job", "saved"],
    ]);
  });

  it("uses real job data and retains a user-edited name when merging a meeting", () => {
    const feed = buildFilesFeed({
      ...options,
      jobCount: 1,
      jobs: [
        {
          ...imported,
          displayname: "My review notes",
          file_path: "https://storage/saved.vtt",
        },
      ],
    });
    expect(feed.entries).toHaveLength(1);
    expect(feed.entries[0]).toMatchObject({
      kind: "job",
      id: "saved",
      recording: {
        displayname: "My review notes",
        file_path: "https://storage/saved.vtt",
        source: imported.source,
      },
    });
    expect(feed.totalCount).toBe(1);
  });

  it("counts organizer search matches that are absent from the server's filename search", () => {
    const feed = buildFilesFeed({
      ...options,
      filters: { search: "alex@example.test" },
    });
    expect(feed.totalCount).toBe(1);
    expect(feed.entries[0].id).toBe("saved");
  });

  it("pages queued uploads together with jobs instead of repeating them on every page", () => {
    const queued = {
      kind: "queued" as const,
      id: "offline",
      recording: {
        id: "offline",
        status: "queued",
        created_at: "2026-09-12T09:00:00Z",
      },
      upload: {
        id: "offline",
        createdAt: Date.parse("2026-09-12T09:00:00Z"),
        blob: new Blob(),
        status: "pending" as const,
        retryCount: 0,
        metadata: {
          fileName: "offline.wav",
          categoryId: "cat-1",
          subcategoryId: "sub-1",
          timestamp: Date.parse("2026-09-12T09:00:00Z"),
        },
      },
    };
    const feed = buildFilesFeed({
      ...options,
      importedJobs: [],
      meetings: [],
      candidates: [],
      queuedEntries: [queued],
      jobCount: 1,
      jobs: [{ id: "saved", created_at: imported.created_at }],
      page: 2,
      pageSize: 1,
    });
    expect(feed.totalCount).toBe(2);
    expect(feed.entries.map((entry) => entry.id)).toEqual(["saved"]);
  });

  it("applies the same processing group to saved Teams jobs", () => {
    const feed = buildFilesFeed({
      ...options,
      includeFiles: false,
      importedJobs: [{ ...imported, status: "analysing" }],
      filters: { status: "processing" },
    });
    expect(feed.entries[0]).toMatchObject({
      kind: "job",
      recording: { status: "analysing" },
    });
    expect(feed.totalCount).toBe(1);
  });
});
