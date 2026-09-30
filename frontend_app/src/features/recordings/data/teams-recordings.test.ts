import { describe, expect, it } from "vitest";

import {
  getTeamsRecordings,
  sortRecordingsByCreated,
} from "./teams-recordings";
import type { TeamsMeeting } from "@/features/teams";

const meeting: TeamsMeeting = {
  id: "event-1",
  subject: "Review",
  organizer: "Alex Smith",
  organizerEmail: "alex@example.test",
  startDateTime: "2026-09-09T09:00:00Z",
  endDateTime: "2026-09-09T10:00:00Z",
  joinUrl: "https://teams.microsoft.com/meeting",
};
describe("Teams recording metadata", () => {
  it("uses Graph creation metadata and falls back to the meeting date when unavailable", () => {
    const [recording] = getTeamsRecordings(
      [{ ...meeting, createdDateTime: "2026-09-01T09:00:00Z" }],
      { search: "", status: "all" },
    );
    expect(recording).toMatchObject({
      id: "teams:event-1",
      file_name: "Microsoft Teams",
      created_at: "2026-09-01T09:00:00Z",
      audio_duration_seconds: 3600,
    });
    expect(
      getTeamsRecordings([meeting], { search: "", status: "all" })[0]
        .created_at,
    ).toBe(meeting.startDateTime);
  });
  it("applies inclusive creation dates and organiser metadata search", () => {
    expect(
      getTeamsRecordings([meeting], {
        search: "ALEX@EXAMPLE",
        status: "all",
        createdAtStart: "2026-09-09",
        createdAtEnd: "2026-09-09",
      }),
    ).toHaveLength(1);
    expect(
      getTeamsRecordings([meeting], {
        search: "",
        status: "all",
        createdAtStart: "2026-09-10",
      }),
    ).toHaveLength(0);
    expect(
      getTeamsRecordings([meeting], { search: "", status: "completed" }),
    ).toHaveLength(0);
  });
  it("sorts mixed timestamp representations without changing the source arrays", () => {
    const items = [
      { id: "old", created_at: "2026-09-01T09:00:00Z" },
      { id: "new", created_at: Date.parse("2026-09-10T09:00:00Z") },
      { id: "missing", created_at: null },
    ];
    expect(sortRecordingsByCreated(items).map((item) => item.id)).toEqual([
      "new",
      "old",
      "missing",
    ]);
    expect(items[0].id).toBe("old");
  });
});
