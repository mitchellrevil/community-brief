import type {
  TeamsMeeting,
  TeamsTranscript,
  TeamsTranscriptBundle,
} from "./types";

const GRAPH_ROOT = "https://graph.microsoft.com/v1.0";
const UNATTRIBUTED_TRANSCRIPT_TYPE =
  "application/vnd.microsoft.graph.transcript+text";

interface GraphPage<T> {
  value?: Array<T>;
  "@odata.nextLink"?: string;
}

interface GraphCalendarEvent {
  id: string;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
  subject?: string;
  isCancelled?: boolean;
  isOnlineMeeting?: boolean;
  onlineMeetingProvider?: string;
  onlineMeeting?: { joinUrl?: string } | null;
  organizer?: { emailAddress?: { name?: string; address?: string } };
  start?: { dateTime?: string; timeZone?: string };
  end?: { dateTime?: string; timeZone?: string };
}

interface GraphOnlineMeeting {
  id: string;
  joinWebUrl?: string;
}

interface GraphTranscript {
  id: string;
  meetingId?: string;
  createdDateTime?: string;
}

interface GraphRecording {
  id: string;
  createdDateTime?: string;
}

interface GraphErrorPayload {
  error?: {
    code?: string;
    message?: string;
    innerError?: { code?: string };
  };
}

export class TeamsGraphError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "TeamsGraphError";
  }
}

function assertGraphUrl(url: string): void {
  if (new URL(url).origin !== new URL(GRAPH_ROOT).origin) {
    throw new TeamsGraphError(
      "Microsoft Graph returned an invalid URL.",
      "InvalidGraphUrl",
      502,
    );
  }
}

async function graphRequest(
  url: string,
  accessToken: string,
  init?: RequestInit,
): Promise<Response> {
  assertGraphUrl(url);
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");

  const response = await fetch(url, { ...init, headers });
  if (response.ok) return response;

  let payload: GraphErrorPayload | null = null;
  try {
    payload = await response.json();
  } catch {
    // Graph occasionally returns an empty or non-JSON gateway response.
  }

  const code =
    response.status === 429
      ? "TooManyRequests"
      : payload?.error?.innerError?.code ||
        payload?.error?.code ||
        "GraphRequestFailed";
  throw new TeamsGraphError(
    payload?.error?.message ||
      `Microsoft Graph request failed (${response.status}).`,
    code,
    response.status,
  );
}

async function getAllGraphPages<T>(
  initialUrl: string,
  accessToken: string,
  headers?: HeadersInit,
): Promise<Array<T>> {
  const values: Array<T> = [];
  let nextUrl: string | undefined = initialUrl;

  while (nextUrl) {
    const response = await graphRequest(nextUrl, accessToken, { headers });
    const page = (await response.json()) as GraphPage<T>;
    values.push(...(page.value ?? []));
    nextUrl = page["@odata.nextLink"];
  }

  return values;
}

function parseUtcDateTime(value?: { dateTime?: string }): string | null {
  const raw = value?.dateTime?.trim();
  if (!raw) return null;
  const normalized = /(?:z|[+-]\d{2}:\d{2})$/i.test(raw) ? raw : `${raw}Z`;
  const timestamp = Date.parse(normalized);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

export function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

export function isMeetingAccessDenied(error: unknown): boolean {
  return (
    error instanceof TeamsGraphError &&
    error.status === 403 &&
    error.code !== "GraphAccessToTranscriptsDisabled" &&
    error.code !== "Authorization_RequestDenied"
  );
}

export function getTeamsAccessRequestUrl(meeting: TeamsMeeting): string | null {
  const email = meeting.organizerEmail?.trim();
  if (!email || !/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(email)) return null;
  const subject = `Access to Teams meeting transcript: ${meeting.subject}`;
  const body = `Hello,\n\nPlease can you give me access to the transcript for ${meeting.subject} (${meeting.startDateTime})?\n\nMeeting: ${meeting.joinUrl}\n\nThank you.`;
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

async function getMeetingMedia(
  accessToken: string,
  meeting: TeamsMeeting,
  recordingAccessToken: string | null,
): Promise<TeamsMeeting | null> {
  let onlineMeeting: GraphOnlineMeeting;
  try {
    onlineMeeting = await resolveOnlineMeeting(accessToken, meeting);
  } catch (error) {
    if (error instanceof TeamsGraphError && error.status === 404) return null;
    if (isMeetingAccessDenied(error))
      return {
        ...meeting,
        transcriptIds: [],
        recordingIds: [],
        transcriptAccessDenied: true,
      };
    throw error;
  }

  const [transcriptResult] = await Promise.allSettled([
    listMeetingTranscripts(accessToken, onlineMeeting.id),
  ]);
  const transcriptIds =
    transcriptResult.status === "fulfilled"
      ? transcriptResult.value.map((transcript) => transcript.id)
      : [];
  const transcriptAccessDenied =
    transcriptResult.status === "rejected" &&
    isMeetingAccessDenied(transcriptResult.reason);
  // Content is downloaded and validated when the user opens or processes a meeting.
  // Doing it for every card delays the whole first page and repeats large Graph reads.
  const [recordingResult] = await Promise.allSettled([
    !transcriptIds.length && recordingAccessToken
      ? listMeetingRecordings(recordingAccessToken, onlineMeeting.id)
      : Promise.resolve([]),
  ]);
  const recordingIds =
    recordingResult.status === "fulfilled"
      ? recordingResult.value.map((recording) => recording.id)
      : [];
  if (
    transcriptResult.status === "rejected" &&
    transcriptResult.reason instanceof TeamsGraphError &&
    transcriptResult.reason.code === "GraphAccessToTranscriptsDisabled" &&
    !recordingIds.length
  ) {
    throw transcriptResult.reason;
  }
  if (!transcriptIds.length && !recordingIds.length) {
    if (transcriptAccessDenied)
      return {
        ...meeting,
        onlineMeetingId: onlineMeeting.id,
        transcriptIds,
        recordingIds,
        transcriptAccessDenied,
      };
    if (transcriptResult.status === "rejected") throw transcriptResult.reason;
    if (recordingResult.status === "rejected") throw recordingResult.reason;
  }
  if (!transcriptIds.length && !recordingIds.length) return null;
  return {
    ...meeting,
    onlineMeetingId: onlineMeeting.id,
    transcriptIds,
    recordingIds,
    transcriptAccessDenied,
  };
}

function calendarEventToMeeting(
  event: GraphCalendarEvent,
  start: Date,
  now: Date,
): TeamsMeeting | null {
  const startDateTime = parseUtcDateTime(event.start);
  const endDateTime = parseUtcDateTime(event.end);
  const joinUrl = event.onlineMeeting?.joinUrl;
  if (
    event.isCancelled ||
    !event.isOnlineMeeting ||
    event.onlineMeetingProvider !== "teamsForBusiness" ||
    !joinUrl ||
    !startDateTime ||
    !endDateTime ||
    Date.parse(startDateTime) < start.getTime() ||
    Date.parse(endDateTime) > now.getTime()
  ) return null;

  const email = event.organizer?.emailAddress;
  return {
    id: event.id,
    subject: event.subject?.trim() || "Teams meeting",
    organizer: email?.name?.trim() || email?.address?.trim() || "Unknown organiser",
    startDateTime,
    endDateTime,
    joinUrl,
    createdDateTime: parseUtcDateTime({ dateTime: event.createdDateTime }) ?? undefined,
    lastModifiedDateTime: parseUtcDateTime({ dateTime: event.lastModifiedDateTime }) ?? undefined,
    organizerEmail: email?.address?.trim(),
  };
}

export async function getRecentTeamsMeetingCandidates(
  accessToken: string,
  now = new Date(),
): Promise<Array<TeamsMeeting>> {
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - 90);

  const url = new URL(`${GRAPH_ROOT}/me/calendar/calendarView`);
  url.searchParams.set("startDateTime", start.toISOString());
  url.searchParams.set("endDateTime", now.toISOString());
  url.searchParams.set(
    "$select",
    "id,subject,start,end,createdDateTime,lastModifiedDateTime,isCancelled,isOnlineMeeting,onlineMeeting,onlineMeetingProvider,organizer",
  );
  url.searchParams.set("$top", "1000");

  const events = await getAllGraphPages<GraphCalendarEvent>(
    url.toString(),
    accessToken,
    { Prefer: 'outlook.timezone="UTC"' },
  );

  return events
    .flatMap((event): Array<TeamsMeeting> => {
      const meeting = calendarEventToMeeting(event, start, now);
      return meeting ? [meeting] : [];
    })
    .sort(
      (left, right) =>
        Date.parse(right.startDateTime) - Date.parse(left.startDateTime),
    );
}

export async function getTeamsMeetingById(
  accessToken: string,
  eventId: string,
  recordingAccessToken: string | null = accessToken,
  now = new Date(),
): Promise<TeamsMeeting | null> {
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - 90);
  const url = new URL(`${GRAPH_ROOT}/me/events/${encodeURIComponent(eventId)}`);
  url.searchParams.set("$select", "id,subject,start,end,createdDateTime,lastModifiedDateTime,isCancelled,isOnlineMeeting,onlineMeeting,onlineMeetingProvider,organizer");
  const response = await graphRequest(url.toString(), accessToken);
  const meeting = calendarEventToMeeting((await response.json()) as GraphCalendarEvent, start, now);
  return meeting ? getMeetingMedia(accessToken, meeting, recordingAccessToken) : null;
}

export async function getTeamsMeetingsPage(
  accessToken: string,
  candidates: Array<TeamsMeeting>,
  offset: number,
  pageSize = 8,
  recordingAccessToken: string | null = accessToken,
): Promise<{ meetings: Array<TeamsMeeting>; nextOffset: number | null }> {
  const selected = candidates.slice(offset, offset + pageSize);
  const available: Array<TeamsMeeting> = [];
  for (let index = 0; index < selected.length; index += 4) {
    const batch = await Promise.all(
      selected.slice(index, index + 4).map((meeting) =>
        getMeetingMedia(accessToken, meeting, recordingAccessToken),
      ),
    );
    available.push(...batch.filter((meeting): meeting is TeamsMeeting => meeting !== null));
  }
  const nextOffset = offset + selected.length;
  return { meetings: available, nextOffset: nextOffset < candidates.length ? nextOffset : null };
}

export async function getRecentTeamsMeetings(
  accessToken: string,
  now = new Date(),
  recordingAccessToken: string | null = accessToken,
): Promise<Array<TeamsMeeting>> {
  const candidates = await getRecentTeamsMeetingCandidates(accessToken, now);

  const available: Array<TeamsMeeting> = [];
  let offset: number | null = 0;
  while (offset !== null) {
    const page = await getTeamsMeetingsPage(accessToken, candidates, offset, 8, recordingAccessToken);
    available.push(...page.meetings);
    offset = page.nextOffset;
  }
  return available;
}

async function resolveOnlineMeeting(
  accessToken: string,
  meeting: TeamsMeeting,
): Promise<GraphOnlineMeeting> {
  const url = new URL(`${GRAPH_ROOT}/me/onlineMeetings`);
  url.searchParams.set(
    "$filter",
    `JoinWebUrl eq '${escapeODataString(meeting.joinUrl)}'`,
  );

  const response = await graphRequest(url.toString(), accessToken);
  const page = (await response.json()) as GraphPage<GraphOnlineMeeting>;
  const onlineMeeting =
    page.value?.find((candidate) => candidate.joinWebUrl === meeting.joinUrl) ??
    page.value?.[0];
  if (!onlineMeeting?.id) {
    throw new TeamsGraphError(
      "This meeting is no longer available in Microsoft Teams.",
      "MeetingUnavailable",
      404,
    );
  }
  return onlineMeeting;
}

async function listMeetingTranscripts(
  accessToken: string,
  meetingId: string,
): Promise<Array<TeamsTranscript>> {
  const url = `${GRAPH_ROOT}/me/onlineMeetings/${encodeURIComponent(meetingId)}/transcripts`;
  const transcripts = await getAllGraphPages<GraphTranscript>(url, accessToken);

  return transcripts
    .filter((transcript) => Boolean(transcript.id))
    .map((transcript) => ({
      id: transcript.id,
      meetingId: transcript.meetingId || meetingId,
      createdDateTime: transcript.createdDateTime || "",
    }))
    .sort(
      (left, right) =>
        Date.parse(left.createdDateTime || "1970-01-01") -
        Date.parse(right.createdDateTime || "1970-01-01"),
    );
}

async function listMeetingRecordings(
  accessToken: string,
  meetingId: string,
): Promise<Array<GraphRecording>> {
  const url = `${GRAPH_ROOT}/me/onlineMeetings/${encodeURIComponent(meetingId)}/recordings`;
  const recordings = await getAllGraphPages<GraphRecording>(url, accessToken);
  return recordings
    .filter((recording) => Boolean(recording.id))
    .sort(
      (left, right) =>
        Date.parse(left.createdDateTime || "1970-01-01") -
        Date.parse(right.createdDateTime || "1970-01-01"),
    );
}

async function downloadTranscriptSegment(
  accessToken: string,
  meetingId: string,
  transcriptId: string,
): Promise<{ content: string; hasSpeakerAttribution: boolean }> {
  const url = `${GRAPH_ROOT}/me/onlineMeetings/${encodeURIComponent(meetingId)}/transcripts/${encodeURIComponent(transcriptId)}/content`;

  try {
    const response = await graphRequest(url, accessToken, {
      headers: { Accept: "text/vtt" },
    });
    const content = await response.text();
    return { content, hasSpeakerAttribution: /<v\s+[^>]+>/i.test(content) };
  } catch (error) {
    if (
      !(error instanceof TeamsGraphError) ||
      error.code !== "SpeakerAttributionNotAllowed"
    ) {
      throw error;
    }

    const response = await graphRequest(url, accessToken, {
      headers: { Accept: UNATTRIBUTED_TRANSCRIPT_TYPE },
    });
    return { content: await response.text(), hasSpeakerAttribution: false };
  }
}

export function combineVttSegments(segments: Array<string>): string {
  const cues: Array<string> = [];
  const cueTiming = /^(?:\d{2}:)?\d{2}:\d{2}[.,]\d{3}\s+-->\s+(?:\d{2}:)?\d{2}:\d{2}[.,]\d{3}/;
  for (const segment of segments) {
    const blocks = segment.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split(/\n\s*\n/);
    for (const block of blocks) {
      const lines = block.split("\n").map((line) => line.trim());
      const timingIndex = lines.findIndex((line) => cueTiming.test(line));
      if (timingIndex < 0) continue;
      const payload = lines.slice(timingIndex + 1).filter(Boolean);
      if (payload.length) cues.push([lines[timingIndex], ...payload].join("\n"));
    }
  }
  return `WEBVTT\n\n${cues.join("\n\n")}\n`;
}

function hasUsableCaptions(content: string): boolean {
  return combineVttSegments([content]).trim() !== "WEBVTT";
}

function mediaFilename(
  meeting: TeamsMeeting,
  extension: "vtt" | "mp4",
): string {
  const stem =
    meeting.subject
      .replace(/[^a-zA-Z0-9-_]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toLowerCase() || "teams_meeting";
  return `${stem}_${meeting.startDateTime.slice(0, 10)}.${extension}`;
}

async function downloadRecording(
  accessToken: string,
  meeting: TeamsMeeting,
  meetingId: string,
  recordingId: string,
): Promise<TeamsTranscriptBundle> {
  const url = `${GRAPH_ROOT}/me/onlineMeetings/${encodeURIComponent(meetingId)}/recordings/${encodeURIComponent(recordingId)}/content`;
  const response = await graphRequest(url, accessToken, {
    headers: { Accept: "video/mp4" },
  });
  const content = await response.blob();
  if (
    content.size === 0 ||
    (content.type && !content.type.includes("video/mp4"))
  ) {
    throw new TeamsGraphError(
      "This Teams recording has no usable video content.",
      "InvalidRecording",
      422,
    );
  }
  return {
    file: new File([content], mediaFilename(meeting, "mp4"), {
      type: "video/mp4",
      lastModified: Date.now(),
    }),
    transcriptCount: 0,
    hasSpeakerAttribution: false,
    source: "recording",
  };
}

export async function downloadTeamsTranscript(
  accessToken: string,
  meeting: TeamsMeeting,
  recordingAccessToken: string | null = accessToken,
): Promise<TeamsTranscriptBundle> {
  const meetingId =
    meeting.onlineMeetingId ??
    (await resolveOnlineMeeting(accessToken, meeting)).id;
  const transcriptIds =
    meeting.transcriptIds ??
    (await listMeetingTranscripts(accessToken, meetingId)).map(
      (transcript) => transcript.id,
    );
  let transcriptError: unknown;
  if (transcriptIds.length) {
    try {
      const segments: Array<string> = [];
      let hasSpeakerAttribution = true;
      for (const transcriptId of transcriptIds) {
        const segment = await downloadTranscriptSegment(
          accessToken,
          meetingId,
          transcriptId,
        );
        if (!hasUsableCaptions(segment.content)) {
          throw new TeamsGraphError(
            "This Teams transcript has no usable captions.",
            "InvalidTranscript",
            422,
          );
        }
        segments.push(segment.content);
        hasSpeakerAttribution &&= segment.hasSpeakerAttribution;
      }
      return {
        file: new File(
          [combineVttSegments(segments)],
          mediaFilename(meeting, "vtt"),
          {
            type: "text/vtt",
            lastModified: Date.now(),
          },
        ),
        transcriptCount: transcriptIds.length,
        hasSpeakerAttribution,
        source: "transcript",
      };
    } catch (error) {
      transcriptError = error;
    }
  }

  const recordingIds = recordingAccessToken
    ? (meeting.recordingIds?.length
      ? meeting.recordingIds
      : (await listMeetingRecordings(recordingAccessToken, meetingId)).map(
        (recording) => recording.id,
      ))
    : [];
  if (recordingIds.length) {
    try {
      return await downloadRecording(
        recordingAccessToken!,
        meeting,
        meetingId,
        recordingIds[0],
      );
    } catch (error) {
      if (transcriptError && isMeetingAccessDenied(transcriptError))
        throw transcriptError;
      throw error;
    }
  }
  if (transcriptError) throw transcriptError;
  throw new TeamsGraphError(
    "No transcript or recording is available for this meeting.",
    "NoMedia",
    404,
  );
}

export function getTeamsGraphErrorMessage(error: unknown): string {
  if (!(error instanceof TeamsGraphError)) {
    return "Microsoft Teams could not be reached. Please try again.";
  }

  switch (error.code) {
    case "InvalidAuthenticationToken":
      return "Microsoft Graph rejected the sign-in token. Sign out and sign in again, then retry Teams meetings.";
    case "GraphAccessToTranscriptsDisabled":
      return "Transcript access is disabled in Teams. Ask a tenant administrator to enable Graph transcript access.";
    case "Authorization_RequestDenied":
    case "Forbidden":
      return "You do not have access to this meeting transcript, or the required Graph permission has not been granted.";
    case "NoTranscript":
    case "NoMedia":
    case "InvalidTranscript":
    case "InvalidRecording":
    case "MeetingUnavailable":
      return error.message;
    case "ErrorItemNotFound":
    case "ResourceNotFound":
    case "NotFound":
      return "This meeting or transcript is no longer available in Microsoft Teams.";
    case "TooManyRequests":
      return "Microsoft Teams is temporarily limiting requests. Wait a moment and try again.";
    default:
      return error.status === 401 || error.status === 403
        ? "Teams access is not configured for this account. Ask a tenant administrator to grant the required Graph permissions."
        : "Microsoft Teams could not load this meeting. Please try again.";
  }
}
