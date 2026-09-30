import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TeamsMeeting } from "@/features/teams/data/types";
import {
  TeamsGraphError,
  combineVttSegments,
  downloadTeamsTranscript,
  escapeODataString,
  getRecentTeamsMeetings,
  getTeamsAccessRequestUrl,
  getTeamsGraphErrorMessage,
  getTeamsMeetingsPage,
} from "@/features/teams/data/api";

const meeting: TeamsMeeting = {
  id: "event-1",
  subject: "Weekly review",
  organizer: "Alex Smith",
  startDateTime: "2026-07-20T09:00:00.000Z",
  endDateTime: "2026-07-20T10:00:00.000Z",
  joinUrl: "https://teams.microsoft.com/l/meetup-join/19:meeting_O'Brien",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsText(file);
  });
}

describe("Teams Graph API", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("paginates and keeps completed Teams meetings from the previous 90 days newest first", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          value: [
            {
              id: "older",
              subject: "Older meeting",
              isCancelled: false,
              isOnlineMeeting: true,
              onlineMeetingProvider: "teamsForBusiness",
              onlineMeeting: { joinUrl: "https://teams.microsoft.com/older" },
              organizer: { emailAddress: { name: "Older Organiser" } },
              start: { dateTime: "2026-07-18T09:00:00" },
              end: { dateTime: "2026-07-18T10:00:00" },
            },
            {
              id: "cancelled",
              isCancelled: true,
              isOnlineMeeting: true,
              onlineMeetingProvider: "teamsForBusiness",
              onlineMeeting: {
                joinUrl: "https://teams.microsoft.com/cancelled",
              },
              start: { dateTime: "2026-07-19T09:00:00" },
              end: { dateTime: "2026-07-19T10:00:00" },
            },
            {
              id: "too-old",
              isCancelled: false,
              isOnlineMeeting: true,
              onlineMeetingProvider: "teamsForBusiness",
              onlineMeeting: { joinUrl: "https://teams.microsoft.com/old" },
              start: { dateTime: "2026-04-22T09:00:00Z" },
              end: { dateTime: "2026-04-22T10:00:00Z" },
            },
          ],
          "@odata.nextLink": "https://graph.microsoft.com/v1.0/next-page",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          value: [
            {
              id: "newer",
              subject: "Newer meeting",
              createdDateTime: "2026-07-17T09:00:00Z",
              lastModifiedDateTime: "2026-07-20T09:00:00Z",
              isCancelled: false,
              isOnlineMeeting: true,
              onlineMeetingProvider: "teamsForBusiness",
              onlineMeeting: { joinUrl: "https://teams.microsoft.com/newer" },
              organizer: { emailAddress: { address: "owner@example.com" } },
              start: { dateTime: "2026-07-21T09:00:00Z" },
              end: { dateTime: "2026-07-21T10:00:00Z" },
            },
            {
              id: "future",
              isCancelled: false,
              isOnlineMeeting: true,
              onlineMeetingProvider: "teamsForBusiness",
              onlineMeeting: { joinUrl: "https://teams.microsoft.com/future" },
              start: { dateTime: "2026-07-23T09:00:00Z" },
              end: { dateTime: "2026-07-23T10:00:00Z" },
            },
            {
              id: "not-teams",
              isCancelled: false,
              isOnlineMeeting: false,
              start: { dateTime: "2026-07-20T09:00:00Z" },
              end: { dateTime: "2026-07-20T10:00:00Z" },
            },
          ],
        }),
      );

    fetchMock.mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/onlineMeetings")) {
        const joinWebUrl = url.searchParams
          .get("$filter")
          ?.match(/'(.*)'$/)?.[1];
        return jsonResponse({
          value: [
            {
              id: joinWebUrl?.includes("newer")
                ? "meeting-newer"
                : "meeting-older",
              joinWebUrl,
            },
          ],
        });
      }
      if (url.pathname.endsWith("/transcripts")) {
        return jsonResponse({
          value: url.pathname.includes("meeting-newer")
            ? [{ id: "transcript-newer" }]
            : [],
        });
      }
      if (url.pathname.endsWith("/recordings")) {
        return jsonResponse({
          value: url.pathname.includes("meeting-older")
            ? [{ id: "recording-older" }]
            : [],
        });
      }
      if (url.pathname.endsWith("/content")) {
        return new Response("WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHello");
      }
      throw new Error(`Unexpected Graph URL: ${url.pathname}`);
    });

    const result = await getRecentTeamsMeetings(
      "token",
      new Date("2026-07-22T12:00:00Z"),
    );

    expect(result.map((item) => item.id)).toEqual(["newer", "older"]);
    expect(result[0].organizer).toBe("owner@example.com");
    expect(result[0]).toMatchObject({
      createdDateTime: "2026-07-17T09:00:00.000Z",
      lastModifiedDateTime: "2026-07-20T09:00:00.000Z",
      organizerEmail: "owner@example.com",
    });
    expect(fetchMock).toHaveBeenCalledTimes(7);
    expect(result[0].transcriptIds).toEqual(["transcript-newer"]);
    expect(result[1].recordingIds).toEqual(["recording-older"]);
    const firstRequest = fetchMock.mock.calls[0];
    const firstUrl = new URL(String(firstRequest[0]));
    expect(firstUrl.searchParams.get("startDateTime")).toBe(
      "2026-04-23T12:00:00.000Z",
    );
    expect(new Headers(firstRequest[1]?.headers).get("Prefer")).toBe(
      'outlook.timezone="UTC"',
    );
  });

  it("escapes apostrophes used in the online meeting OData filter", () => {
    expect(escapeODataString(meeting.joinUrl)).toContain("O''Brien");
  });

  it("checks one bounded group of meetings without downloading transcript content for cards", async () => {
    fetchMock.mockImplementation((input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/onlineMeetings")) {
        return Promise.resolve(jsonResponse({ value: [{ id: "online-1" }] }));
      }
      if (url.pathname.endsWith("/transcripts")) {
        return Promise.resolve(jsonResponse({ value: [{ id: "transcript-1" }] }));
      }
      if (url.pathname.endsWith("/content")) {
        return Promise.resolve(new Response("WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHello"));
      }
      throw new Error(`Unexpected Graph URL: ${url.pathname}`);
    });
    const candidates = Array.from({ length: 10 }, (_, index) => ({
      ...meeting,
      id: `event-${index}`,
    }));

    const first = await getTeamsMeetingsPage("token", candidates, 0, 8);
    expect(first.meetings).toHaveLength(8);
    expect(first.nextOffset).toBe(8);
    expect(fetchMock).toHaveBeenCalledTimes(16);
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/content"))).toBe(false);
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/recordings"))).toBe(false);

    const second = await getTeamsMeetingsPage("token", candidates, first.nextOffset!, 8);
    expect(second.meetings).toHaveLength(2);
    expect(second.nextOffset).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(20);
  });

  it("orders and combines every paginated transcript segment", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          value: [{ id: "online-1", joinWebUrl: meeting.joinUrl }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          value: [
            {
              id: "segment-2",
              meetingId: "online-1",
              createdDateTime: "2026-07-20T10:02:00Z",
            },
          ],
          "@odata.nextLink":
            "https://graph.microsoft.com/v1.0/transcript-page-2",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          value: [
            {
              id: "segment-1",
              meetingId: "online-1",
              createdDateTime: "2026-07-20T10:01:00Z",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        new Response("WEBVTT\nKind: captions\n\nopaque-cue-id\n00:00.000 --> 00:01.000\n<v Alex>First</v>"),
      )
      .mockResolvedValueOnce(
        new Response("WEBVTT\n\n00:00.000 --> 00:01.000\n<v Sam>Second</v>"),
      );

    const result = await downloadTeamsTranscript("token", meeting);
    const content = await readFile(result.file);

    expect(result.transcriptCount).toBe(2);
    expect(result.hasSpeakerAttribution).toBe(true);
    expect(result.file.name).toBe("weekly_review_2026-07-20.vtt");
    expect(content.match(/WEBVTT/g)).toHaveLength(1);
    expect(content).not.toContain("Kind: captions");
    expect(content).not.toContain("opaque-cue-id");
    expect(content.indexOf("First")).toBeLessThan(content.indexOf("Second"));
    expect(
      new URL(String(fetchMock.mock.calls[0][0])).searchParams.get("$filter"),
    ).toBe(`JoinWebUrl eq '${escapeODataString(meeting.joinUrl)}'`);
    expect(new Headers(fetchMock.mock.calls[3][1]?.headers).get("Accept")).toBe(
      "text/vtt",
    );
  });

  it("retries a segment without speaker attribution when Graph requires it", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          value: [{ id: "online-1", joinWebUrl: meeting.joinUrl }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          value: [
            {
              id: "segment-1",
              meetingId: "online-1",
              createdDateTime: "2026-07-20T10:01:00Z",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: {
              code: "BadRequest",
              message: "Attribution is disabled",
              innerError: { code: "SpeakerAttributionNotAllowed" },
            },
          },
          400,
        ),
      )
      .mockResolvedValueOnce(
        new Response("WEBVTT\n\n00:00.000 --> 00:01.000\nUnattributed"),
      );

    const result = await downloadTeamsTranscript("token", meeting);

    expect(result.hasSpeakerAttribution).toBe(false);
    expect(new Headers(fetchMock.mock.calls[3][1]?.headers).get("Accept")).toBe(
      "application/vnd.microsoft.graph.transcript+text",
    );
  });

  it("marks a successful VTT response without voice tags as unattributed", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHello"),
    );
    const result = await downloadTeamsTranscript("token", {
      ...meeting,
      onlineMeetingId: "online-1",
      transcriptIds: ["segment-1"],
      recordingIds: [],
    });

    expect(result.source).toBe("transcript");
    expect(result.hasSpeakerAttribution).toBe(false);
  });

  it("creates an organiser email draft without accepting an invalid address", () => {
    expect(
      getTeamsAccessRequestUrl({
        ...meeting,
        organizerEmail: "alex@example.com",
      }),
    ).toContain("mailto:alex%40example.com");
    expect(
      getTeamsAccessRequestUrl({
        ...meeting,
        organizerEmail: "alex@example.com\r\nBcc:other@example.com",
      }),
    ).toBeNull();
  });

  it("keeps a meeting available for access requests when its transcript is forbidden", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/calendarView"))
        return jsonResponse({
          value: [
            {
              id: "invited-event",
              subject: "Invited meeting",
              isCancelled: false,
              isOnlineMeeting: true,
              onlineMeetingProvider: "teamsForBusiness",
              onlineMeeting: { joinUrl: meeting.joinUrl },
              organizer: { emailAddress: { address: "organiser@example.com" } },
              start: { dateTime: "2026-07-20T09:00:00Z" },
              end: { dateTime: "2026-07-20T10:00:00Z" },
            },
          ],
        });
      if (url.pathname.endsWith("/onlineMeetings"))
        return jsonResponse({
          value: [{ id: "online-1", joinWebUrl: meeting.joinUrl }],
        });
      if (url.pathname.endsWith("/transcripts"))
        return jsonResponse(
          { error: { code: "Forbidden", message: "Access denied" } },
          403,
        );
      if (url.pathname.endsWith("/recordings"))
        return jsonResponse({ value: [] });
      throw new Error(`Unexpected Graph URL: ${url.pathname}`);
    });

    const result = await getRecentTeamsMeetings(
      "token",
      new Date("2026-07-22T12:00:00Z"),
    );

    expect(result).toHaveLength(1);
    expect(result[0].transcriptAccessDenied).toBe(true);
    expect(result[0].organizerEmail).toBe("organiser@example.com");
  });

  it("defers transcript validation until a meeting is opened or processed", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/calendarView"))
        return jsonResponse({
          value: [
            {
              id: "recorded-event",
              subject: "Recorded meeting",
              isCancelled: false,
              isOnlineMeeting: true,
              onlineMeetingProvider: "teamsForBusiness",
              onlineMeeting: { joinUrl: meeting.joinUrl },
              start: { dateTime: "2026-07-20T09:00:00Z" },
              end: { dateTime: "2026-07-20T10:00:00Z" },
            },
          ],
        });
      if (url.pathname.endsWith("/onlineMeetings"))
        return jsonResponse({
          value: [{ id: "online-1", joinWebUrl: meeting.joinUrl }],
        });
      if (url.pathname.endsWith("/transcripts"))
        return jsonResponse({ value: [{ id: "empty-transcript" }] });
      if (url.pathname.endsWith("/recordings"))
        return jsonResponse({ value: [{ id: "recording-1" }] });
      if (url.pathname.endsWith("/content")) return new Response("WEBVTT\n\n");
      throw new Error(`Unexpected Graph URL: ${url.pathname}`);
    });

    const result = await getRecentTeamsMeetings(
      "token",
      new Date("2026-07-22T12:00:00Z"),
    );

    expect(result[0].transcriptIds).toEqual(["empty-transcript"]);
    expect(result[0].recordingIds).toEqual([]);
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/content"))).toBe(false);
  });

  it("imports an invited organiser's transcript through the delegated meeting path", async () => {
    const invitedMeeting = {
      ...meeting,
      organizerEmail: "someone.else@example.com",
      onlineMeetingId: "invited-online-meeting",
      transcriptIds: ["invited-transcript"],
      recordingIds: [],
    };
    fetchMock.mockResolvedValueOnce(
      new Response(
        "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n<v Alex>Hello</v>",
      ),
    );

    const result = await downloadTeamsTranscript("token", invitedMeeting, null);

    expect(result.source).toBe("transcript");
    expect(await readFile(result.file)).toContain("Hello");
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "/me/onlineMeetings/invited-online-meeting/transcripts/invited-transcript/content",
    );
  });

  it("does not attempt recording access without recording consent", async () => {
    const recordingOnlyMeeting = {
      ...meeting,
      onlineMeetingId: "online-1",
      transcriptIds: [],
      recordingIds: ["recording-1"],
    };

    await expect(
      downloadTeamsTranscript("token", recordingOnlyMeeting, null),
    ).rejects.toMatchObject({
      code: "NoMedia",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the recording when a transcript is missing or has no usable cues", async () => {
    const recordedMeeting = {
      ...meeting,
      onlineMeetingId: "online-1",
      transcriptIds: ["invalid-transcript"],
      recordingIds: ["recording-1"],
    };
    fetchMock
      .mockResolvedValueOnce(new Response("WEBVTT\n\n"))
      .mockResolvedValueOnce(
        new Response("mp4 bytes", {
          headers: { "Content-Type": "video/mp4" },
        }),
      );

    const result = await downloadTeamsTranscript("token", recordedMeeting);

    expect(result.source).toBe("recording");
    expect(result.file.name).toBe("weekly_review_2026-07-20.mp4");
    expect(result.file.size).toBeGreaterThan(0);
  });

  it("looks up a recording on demand when a listed transcript has no usable cues", async () => {
    const recordedMeeting = {
      ...meeting,
      onlineMeetingId: "online-1",
      transcriptIds: ["invalid-transcript"],
      recordingIds: [],
    };
    fetchMock
      .mockResolvedValueOnce(new Response("WEBVTT\n\n"))
      .mockResolvedValueOnce(jsonResponse({ value: [{ id: "recording-1" }] }))
      .mockResolvedValueOnce(
        new Response("mp4 bytes", {
          headers: { "Content-Type": "video/mp4" },
        }),
      );

    const result = await downloadTeamsTranscript("token", recordedMeeting);

    expect(result.source).toBe("recording");
    expect(String(fetchMock.mock.calls[1][0])).toContain("/recordings");
  });

  it("maps missing transcripts, disabled access, and throttling to actionable errors", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          value: [{ id: "online-1", joinWebUrl: meeting.joinUrl }],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ value: [] }))
      .mockResolvedValueOnce(jsonResponse({ value: [] }));

    await expect(
      downloadTeamsTranscript("token", meeting),
    ).rejects.toMatchObject({
      code: "NoMedia",
    });

    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { error: { code: "activityLimitReached", message: "Slow down" } },
        429,
      ),
    );
    await expect(getRecentTeamsMeetings("token")).rejects.toMatchObject({
      code: "TooManyRequests",
    });

    expect(
      getTeamsGraphErrorMessage(
        new TeamsGraphError(
          "disabled",
          "GraphAccessToTranscriptsDisabled",
          403,
        ),
      ),
    ).toContain("disabled");
    expect(
      getTeamsGraphErrorMessage(
        new TeamsGraphError("slow down", "TooManyRequests", 429),
      ),
    ).toContain("limiting requests");
  });

  it("combines VTT fragments under a single header", () => {
    expect(
      combineVttSegments([
        "WEBVTT\n\n00:00.000 --> 00:01.000\nFirst",
        "WEBVTT\r\n\r\n00:01.000 --> 00:02.000\r\nSecond",
      ]),
    ).toBe("WEBVTT\n\n00:00.000 --> 00:01.000\nFirst\n\n00:01.000 --> 00:02.000\nSecond\n");
  });
});
