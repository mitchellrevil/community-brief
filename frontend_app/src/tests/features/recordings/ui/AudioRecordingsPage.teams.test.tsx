import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as MsalConfig from "@/features/auth/config/msal";
import type * as RecordingsApi from "@/features/recordings/data/api";
import type { TeamsMeeting } from "@/features/teams";
import type * as TeamsApi from "@/features/teams/data/api";
import type { PropsWithChildren } from "react";
import { AudioRecordingsPage } from "@/features/recordings/ui/AudioRecordingsPage";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  getFiles: vi.fn(),
  getMeetings: vi.fn(),
  getMedia: vi.fn(),
  getImports: vi.fn(),
  downloadTranscript: vi.fn(),
  auth: { user: { user_id: "user-1", auth_source: "entra" }, isLoading: false },
  token: vi.fn((_scopes: Array<string>, enabled: boolean) => ({
    accessToken: enabled ? "token" : null,
    getAccessToken: vi.fn().mockResolvedValue("token"),
    isLoading: false,
    error: null,
  })),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: PropsWithChildren) => <a>{children}</a>,
  useRouter: () => ({ navigate: mocks.navigate }),
}));
vi.mock("@/app/contexts/tutorial-context", () => ({
  TUTORIAL_SAMPLE_JOB: {},
  useTutorialOptional: () => null,
}));
vi.mock("@/features/auth/config/msal", async (importOriginal) => ({
  ...(await importOriginal<typeof MsalConfig>()),
  isMicrosoftAuthConfigured: true,
  teamsGraphScopes: ["teams-scope"],
}));
vi.mock("@/features/auth/hooks/useAuthSession", () => ({
  useAuthSession: () => mocks.auth,
}));
vi.mock("@/features/auth/hooks/useMicrosoftAccessToken", () => ({
  useMicrosoftGraphToken: mocks.token,
}));
vi.mock("@/features/recordings/data/api", async (importOriginal) => ({
  ...(await importOriginal<typeof RecordingsApi>()),
  getAudioRecordings: mocks.getFiles,
  getTeamsImportJobs: mocks.getImports,
}));
vi.mock("@/features/teams/data/api", async (importOriginal) => ({
  ...(await importOriginal<typeof TeamsApi>()),
  getRecentTeamsMeetingCandidates: mocks.getMeetings,
  getMeetingMedia: mocks.getMedia,
  downloadTeamsTranscript: mocks.downloadTranscript,
}));
vi.mock("@/components/ui/editable-display-name", () => ({
  EditableDisplayName: ({ job }: { job: { displayname: string } }) => (
    <h3>{job.displayname}</h3>
  ),
}));
vi.mock("@/lib/pwa-queue", () => ({
  getPendingRecordings: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/features/uploads", () => ({
  MediaUploadForm: ({
    mediaFile,
    onSuccess,
  }: {
    mediaFile: File;
    onSuccess: (jobId: string) => void;
  }) => (
    <div>
      <span>{mediaFile.name}</span>
      <button onClick={() => onSuccess("imported-job")}>
        Submit transcript
      </button>
    </div>
  ),
}));

const meeting: TeamsMeeting = {
  transcriptIds: ["transcript-1"],
  id: "meeting-1",
  subject: "Weekly review",
  organizer: "Alex Smith",
  organizerEmail: "alex@example.test",
  createdDateTime: "2026-09-08T09:00:00Z",
  lastModifiedDateTime: "2026-09-08T10:00:00Z",
  startDateTime: "2026-09-09T09:00:00Z",
  endDateTime: "2026-09-09T10:00:00Z",
  joinUrl: "https://teams.microsoft.com/meeting-1",
};
const files = [
  {
    id: "newer",
    displayname: "Newest Community Brief file",
    created_at: "2026-09-10T09:00:00Z",
    status: "completed",
  },
  {
    id: "older",
    displayname: "Older Community Brief file",
    created_at: "2026-09-01T09:00:00Z",
    status: "completed",
  },
];
let client: QueryClient;
function renderPage(perPage = 12) {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AudioRecordingsPage initialFilters={{ per_page: perPage }} />
    </QueryClientProvider>,
  );
}
function displayedTitles() {
  return screen
    .getAllByRole("heading", { level: 3 })
    .map((heading) => heading.textContent);
}

describe("My Files source filters", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.stubEnv("VITE_ENABLE_TEAMS_RECORDINGS", "true");
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    mocks.auth.user = { user_id: "user-1", auth_source: "entra" };
    mocks.getMeetings.mockResolvedValue([meeting]);
    mocks.getMedia.mockImplementation((_token, candidate) =>
      Promise.resolve(candidate),
    );
    mocks.getImports.mockResolvedValue([]);
    mocks.downloadTranscript.mockResolvedValue({
      file: new File(["WEBVTT"], "weekly_review.vtt"),
      transcriptCount: 1,
      hasSpeakerAttribution: true,
      source: "transcript",
    });
    mocks.getFiles.mockImplementation(({ page = 1, per_page = 12 }) =>
      Promise.resolve({
        jobs: files.slice((page - 1) * per_page, page * per_page),
        count: files.length,
        status: 200,
      }),
    );
  });
  afterEach(() => {
    client.clear();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    delete window.__COMMUNITY_BRIEF_CONFIG__;
  });

  it("keeps source controls and Teams requests off when the deployment flag is disabled", async () => {
    localStorage.setItem("audio-recordings-include-teams", "true");
    localStorage.setItem("audio-recordings-include-files", "false");
    window.__COMMUNITY_BRIEF_CONFIG__ = { features: { teamsRecordings: false } };
    renderPage();
    expect(await screen.findByText("Newest Community Brief file")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(mocks.getMeetings).not.toHaveBeenCalled();
    expect(mocks.token).toHaveBeenCalledWith(["teams-scope"], false);
  });

  it("mixes sources using the shared cards and sorts them newest first", async () => {
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText("Newest Community Brief file")).toBeInTheDocument();
    expect(mocks.getMeetings).not.toHaveBeenCalled();
    await user.click(screen.getByRole("checkbox", { name: "Teams meetings" }));
    expect(await screen.findByText("Weekly review")).toBeInTheDocument();
    expect(displayedTitles()).toEqual([
      "Newest Community Brief file",
      "Weekly review",
      "Older Community Brief file",
    ]);
    expect(screen.getByText("Alex Smith")).toBeInTheDocument();
    expect(screen.getByText("Microsoft Teams")).toBeInTheDocument();
    expect(screen.getByText("Transcript available")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Scheduled meeting length 1:00:00"),
    ).toBeInTheDocument();
    const sources = screen.getByRole("group", { name: "Recording sources" });
    const refresh = screen.getByRole("button", { name: "Refresh recordings" });
    expect(
      sources.compareDocumentPosition(refresh) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("offers an organiser access request when a transcript is permission denied", async () => {
    localStorage.setItem("audio-recordings-include-teams", "true");
    mocks.getMeetings.mockResolvedValue([
      { ...meeting, transcriptIds: [], transcriptAccessDenied: true },
    ]);
    renderPage();

    expect(
      await screen.findByText("Transcript access needed"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: /Process transcript for Weekly review/,
      }),
    ).not.toBeInTheDocument();
    const request = screen.getByRole("link", {
      name: /Request transcript access from Alex Smith/,
    });
    expect(request).toHaveAttribute(
      "href",
      expect.stringContaining("mailto:alex%40example.test"),
    );
    expect(request).toHaveAttribute(
      "href",
      expect.stringContaining("Weekly%20review"),
    );
  });

  it("shows Teams only and restores both source preferences on the next visit", async () => {
    const user = userEvent.setup();
    const firstVisit = renderPage();
    await user.click(screen.getByRole("checkbox", { name: "Teams meetings" }));
    await user.click(screen.getByRole("checkbox", { name: "Community Brief files" }));
    expect(await screen.findByText("Weekly review")).toBeInTheDocument();
    expect(displayedTitles()).toEqual(["Weekly review"]);
    expect(localStorage.getItem("audio-recordings-include-teams")).toBe("true");
    expect(localStorage.getItem("audio-recordings-include-files")).toBe(
      "false",
    );
    firstVisit.unmount();
    client.clear();
    mocks.getFiles.mockClear();
    renderPage();
    expect(await screen.findByText("Weekly review")).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Teams meetings" }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Community Brief files" }),
    ).not.toBeChecked();
    expect(mocks.getFiles).not.toHaveBeenCalled();
    await user.click(screen.getByRole("checkbox", { name: "Teams meetings" }));
    expect(screen.queryByText("Weekly review")).not.toBeInTheDocument();
    expect(localStorage.getItem("audio-recordings-include-teams")).toBe(
      "false",
    );
  });

  it("paginates the combined ordering without repeating Teams or dropping files", async () => {
    localStorage.setItem("audio-recordings-include-teams", "true");
    const user = userEvent.setup();
    renderPage(2);
    expect(await screen.findByText("Weekly review")).toBeInTheDocument();
    expect(displayedTitles()).toEqual(["Newest Community Brief file", "Weekly review"]);
    expect(mocks.navigate).not.toHaveBeenCalled();
    await user.click(screen.getByLabelText("Go to next page"));
    expect(await screen.findByText("Older Community Brief file")).toBeInTheDocument();
    expect(displayedTitles()).toEqual(["Older Community Brief file"]);
    expect(mocks.getFiles).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, per_page: 2 }),
    );
  });

  it("filters Teams metadata and keeps processing available in list view", async () => {
    localStorage.setItem("audio-recordings-include-teams", "true");
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText("Weekly review")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Table view" }));
    fireEvent.change(
      screen.getByRole("textbox", { name: "Search recordings" }),
      { target: { value: "Alex" } },
    );
    fireEvent.change(screen.getByLabelText("Start date"), {
      target: { value: "2026-09-08" },
    });
    fireEvent.change(screen.getByLabelText("End date"), {
      target: { value: "2026-09-08" },
    });
    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: "Process transcript for Weekly review",
        }),
      ).toBeInTheDocument(),
    );
    await user.click(
      screen.getByRole("button", {
        name: "Process transcript for Weekly review",
      }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("weekly_review.vtt")).toBeInTheDocument();
    expect(mocks.downloadTranscript).toHaveBeenCalledWith(
      expect.any(Function),
      meeting,
      expect.any(Function),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Submit transcript" }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Teams meetings" }),
    ).toBeChecked();
    expect(localStorage.getItem("audio-recordings-view-mode")).toBe("table");
  });

  it("keeps files visible when Teams access fails", async () => {
    localStorage.setItem("audio-recordings-include-teams", "true");
    mocks.getMeetings.mockRejectedValue(new Error("Graph unavailable"));
    renderPage();
    expect(await screen.findByText("Newest Community Brief file")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("opens persisted Teams jobs before Graph finishes and removes their duplicate file cards", async () => {
    localStorage.setItem("audio-recordings-include-teams", "true");
    mocks.getMeetings.mockReturnValue(new Promise(() => {}));
    mocks.getImports.mockResolvedValue([
      { ...files[0], teams_event_id: meeting.id },
    ]);
    renderPage();
    const viewJob = await screen.findByRole("button", { name: "View job" });
    expect(screen.getAllByText("Newest Community Brief file")).toHaveLength(1);
    expect(screen.getByText("Processed")).toBeInTheDocument();
    expect(screen.getByText(/Checking Teams meetings/)).toBeInTheDocument();
    await userEvent.click(viewJob);
    expect(mocks.navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "/audio-recordings/$id",
        params: { id: "newer" },
      }),
    );
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Community Brief files" }),
    );
    expect(
      screen.getByRole("button", { name: "View job" }),
    ).toBeInTheDocument();
  });

  it("renders each ready meeting, isolates failures and keeps at most four checks in flight", async () => {
    localStorage.setItem("audio-recordings-include-teams", "true");
    localStorage.setItem("audio-recordings-include-files", "false");
    const meetings = Array.from({ length: 8 }, (_, index) => ({
      ...meeting,
      id: `meeting-${index}`,
      subject: `Meeting ${index}`,
    }));
    mocks.getMeetings.mockResolvedValue(meetings);
    const pending = new Map<
      string,
      {
        resolve: (meeting: TeamsMeeting) => void;
        reject: (error: Error) => void;
      }
    >();
    mocks.getMedia.mockImplementation(
      (_token, candidate) =>
        new Promise((resolve, reject) =>
          pending.set(candidate.id, { resolve, reject }),
        ),
    );
    renderPage();
    await waitFor(() => expect(mocks.getMedia).toHaveBeenCalledTimes(4));
    act(() => pending.get("meeting-1")!.resolve(meetings[1]));
    expect(await screen.findByText("Meeting 1")).toBeInTheDocument();
    expect(screen.queryByText("Meeting 0")).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.getMedia).toHaveBeenCalledTimes(5));
    act(() =>
      pending.get("meeting-2")!.reject(new Error("Graph unavailable")),
    );
    await waitFor(() => expect(mocks.getMedia).toHaveBeenCalledTimes(6));
    expect(screen.getByText("Meeting 1")).toBeInTheDocument();
    expect(mocks.downloadTranscript).not.toHaveBeenCalled();
  });

  it("starts discovery from a partial calendar page and skips checks for explicitly linked imports", async () => {
    localStorage.setItem("audio-recordings-include-teams", "true");
    localStorage.setItem("audio-recordings-include-files", "false");
    mocks.getImports.mockResolvedValue([
      {
        id: "existing",
        teams_event_id: meeting.id,
        status: "completed",
        created_at: "2026-09-10T09:00:00Z",
        displayname: "Saved Teams job",
      },
    ]);
    mocks.getMeetings.mockImplementation((_token, _now, options) => {
      options.onMeetings([
        meeting,
        { ...meeting, id: "other", subject: "Another meeting" },
      ]);
      return new Promise(() => {});
    });
    renderPage();
    expect(await screen.findByText("Another meeting")).toBeInTheDocument();
    expect(screen.getByText("Saved Teams job")).toBeInTheDocument();
    expect(mocks.getMedia).toHaveBeenCalledTimes(1);
    expect(mocks.getMedia.mock.calls[0][1].id).toBe("other");
  });
});
