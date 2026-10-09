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

  it("replaces an imported meeting with its real job and filters by the job status", () => {
    const job = {
      id: "job-1",
      teams_event_id: meeting.id,
      status: "completed",
      created_at: "2026-09-10T09:00:00Z",
    };
    const cards = getTeamsRecordings(
      [meeting],
      { search: "", status: "completed" },
      [job],
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      id: "job-1",
      importedJob: job,
      status: "completed",
    });
    expect(
      getTeamsRecordings([meeting], { search: "", status: "uploaded" }, [job]),
    ).toEqual([]);
    expect(
      getTeamsRecordings([], { search: "", status: "all" }, [job])[0].id,
    ).toBe("job-1");
  });

  it("links exact historic filenames but leaves ambiguous meetings and unrelated files separate", () => {
    const job = {
      id: "historic-job",
      file_name: "review_2026-09-09.vtt",
      status: "completed",
      created_at: "2026-09-10T09:00:00Z",
    };
    const filters = { search: "", status: "all" };
    expect(getTeamsRecordings([meeting], filters, [job])[0].id).toBe(
      "historic-job",
    );
    expect(
      getTeamsRecordings([meeting, { ...meeting, id: "other" }], filters, [
        job,
      ]).map((card) => card.id),
    ).toEqual(["teams:event-1", "teams:other"]);
    expect(
      getTeamsRecordings([meeting], filters, [
        { ...job, file_name: "unrelated.vtt" },
      ])[0].id,
    ).toBe("teams:event-1");
  });
});
