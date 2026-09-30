import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveDraftRecording } from "@/lib/draft-storage";
import { RecordingInterface } from "@/features/uploads/recording/RecordingInterface";

const mocks = vi.hoisted(() => ({
  concatenateAudioSegments: vi.fn(),
  audioLevel: 0,
  captureCleanup: vi.fn(),
  createRecordingCapture: vi.fn(),
  fetchAudioBlob: vi.fn(),
  getDraftRecording: vi.fn(),
  interrupted: vi.fn(),
  navigate: vi.fn(),
  blocker: vi.fn((_options: any) => ({ status: "idle", reset: vi.fn() })),
  onBack: vi.fn(),
  onUploadComplete: vi.fn(),
  updateJobDisplayName: vi.fn(),
  uploadFile: vi.fn(),
  warning: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useBlocker: (options: unknown) => mocks.blocker(options),
  useRouter: () => ({ navigate: mocks.navigate }),
}));

vi.mock("@/features/uploads/recording/ui/RecordingControls", () => ({
  RecordingControls: ({ hasAudio, isPaused, isPreparing, onContinue, onPause, onResume, onStart, onStop, onUpload }: any) => (
    <div>
      <button type="button" onClick={onStart} disabled={isPreparing}>
        {isPreparing ? "Preparing" : "Start"}
      </button>
      <button type="button" onClick={onStop}>
        Stop
      </button>
      <button type="button" onClick={isPaused ? onResume : onPause}>
        {isPaused ? "Resume" : "Pause"}
      </button>
      <button type="button" onClick={onContinue} disabled={!hasAudio || isPreparing}>
        Continue
      </button>
      <button type="button" onClick={onUpload} disabled={!hasAudio}>
        Submit Recording
      </button>
    </div>
  ),
}));

vi.mock("@/features/uploads/recording/TalkingPointsPanel", () => ({
  TalkingPointsPanel: () => <div />,
}));

vi.mock("@/features/uploads/recording/audio-capture", () => ({
  createRecordingCapture: (...args: Array<unknown>) =>
    mocks.createRecordingCapture(...args),
}));

vi.mock("@/features/recordings/data/api", () => ({
  fetchAudioBlob: (...args: Array<unknown>) => mocks.fetchAudioBlob(...args),
  updateJobDisplayName: (...args: Array<unknown>) =>
    mocks.updateJobDisplayName(...args),
  uploadFile: (...args: Array<unknown>) => mocks.uploadFile(...args),
}));

vi.mock("@/lib/ffmpegConvert", () => ({
  concatenateAudioSegments: (...args: Array<unknown>) =>
    mocks.concatenateAudioSegments(...args),
  convertToWavWithFFmpeg: (file: File, options: any) => {
    options.onMetadata?.({ durationSeconds: 3 });
    return Promise.resolve(
      new File([file], "converted.wav", { type: "audio/wav" }),
    );
  },
}));

vi.mock("@/lib/audio-compression", () => ({
  compressAudioToMP3: vi.fn(),
  getStorageLimits: () => ({ recommendedBitrate: 96, singleFileMB: 100 }),
}));

vi.mock("@/lib/online-status", () => ({
  isOnline: vi.fn(() => Promise.resolve(true)),
}));

vi.mock("@/lib/draft-storage", () => ({
  checkStorageAndWarn: vi.fn(() => Promise.resolve(undefined)),
  cleanupOldDrafts: vi.fn(() => Promise.resolve(undefined)),
  deleteDraftRecording: vi.fn(() => Promise.resolve(undefined)),
  formatBytes: vi.fn(() => "5 B"),
  getDraftRecording: (...args: Array<unknown>) => mocks.getDraftRecording(...args),
  saveDraftRecording: vi.fn(() => Promise.resolve("draft-1")),
}));

vi.mock("@/hooks/useAudioAnalyzer", () => ({
  useAudioAnalyzer: () => ({
    currentLevel: mocks.audioLevel,
    maxLevel: mocks.audioLevel,
  }),
}));

vi.mock("@/lib/toast-utils", () => ({
  recordingToasts: {
    empty: vi.fn(),
    interrupted: mocks.interrupted,
    microphoneError: vi.fn(),
  },
  uploadToasts: {
    failed: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: mocks.warning,
  },
}));

class MockMediaRecorder {
  static isTypeSupported = () => true;

  mimeType = "audio/webm";
  state = "inactive";
  ondataavailable?: (event: { data: Blob }) => void;
  onerror?: (event: { error: DOMException }) => void;
  onpause?: () => void;
  onresume?: () => void;
  onstart?: () => void;
  onstop?: () => void;

  constructor(_stream: MediaStream, _options?: MediaRecorderOptions) {}

  start() {
    this.state = "recording";
    this.onstart?.();
    this.ondataavailable?.({
      data: new Blob(["audio"], { type: "audio/webm" }),
    });
  }

  stop() {
    this.state = "inactive";
    this.onstop?.();
  }

  pause() {
    this.state = "paused";
    this.onpause?.();
  }

  resume() {
    this.state = "recording";
    this.onresume?.();
  }
}

describe("RecordingInterface", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    mocks.audioLevel = 0;
    const track = { kind: "audio", stop: vi.fn(), addEventListener: vi.fn() };
    const stream = {
      getAudioTracks: () => [track],
      getTracks: () => [track],
    };
    mocks.createRecordingCapture.mockImplementation(
      ({ mode, voiceIsolation }: any) =>
        Promise.resolve({
          recordingStream: stream,
          micMonitorStream: stream,
          systemMonitorStream: mode === "hybrid" ? stream : null,
          systemAudioAvailable: mode === "hybrid",
          voiceIsolationApplied: Boolean(voiceIsolation),
          cleanup: mocks.captureCleanup,
        }),
    );
    mocks.fetchAudioBlob.mockResolvedValue(
      new Blob(["audio"], { type: "audio/webm" }),
    );
    mocks.getDraftRecording.mockResolvedValue(null);
    mocks.concatenateAudioSegments.mockResolvedValue(
      new File(["joined-audio"], "continued-recording.wav", {
        type: "audio/wav",
      }),
    );
    mocks.updateJobDisplayName.mockResolvedValue({});
    mocks.uploadFile.mockResolvedValue({ job_id: "job-123" });

    vi.stubGlobal("MediaRecorder", MockMediaRecorder);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn(() =>
          Promise.resolve({
            getTracks: () => [{ stop: vi.fn() }],
          }),
        ),
      },
    });
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:recording"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function renderRecordingInterface(subcategoryOverrides: Record<string, unknown> = {}) {
    return render(
      <RecordingInterface
        categoryId="cat-1"
        subcategoryId="sub-1"
        categoryName="Service Area"
        subcategoryName="Meeting Type"
        subcategoryDetails={
          {
            id: "sub-1",
            folder_id: "cat-1",
            name: "Meeting Type",
            prompts: {},
            in_session_talking_points: [],
            pre_session_talking_points: [],
            ...subcategoryOverrides,
          } as any
        }
        onBack={mocks.onBack}
        onUploadComplete={mocks.onUploadComplete}
      />,
    );
  }

  it("blocks wizard back during capture, pause and review", async () => {
    const user = userEvent.setup();
    renderRecordingInterface();
    await user.click(screen.getByRole("button", { name: "Start" }));
    for (const action of [null, "Pause", "Resume", "Stop"]) {
      if (action) await user.click(screen.getByRole("button", { name: action }));
      await user.click(screen.getByRole("button", { name: /back/i }));
      expect(screen.getByRole("alertdialog")).toHaveTextContent("Upload your recording before leaving");
      expect(mocks.onBack).not.toHaveBeenCalled();
      expect(mocks.blocker.mock.lastCall?.[0].shouldBlockFn()).toBe(true);
      await user.click(screen.getByRole("button", { name: "Stay with recording" }));
    }
  });

  it("allows back before capture", async () => {
    renderRecordingInterface();
    await userEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(mocks.onBack).toHaveBeenCalledOnce();
    expect(mocks.blocker.mock.lastCall?.[0].enableBeforeUnload).toBe(false);
  });

  it("saves periodically despite clock renders, using current duration and MIME", async () => {
    renderRecordingInterface();
    vi.useFakeTimers();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Start" })); });
    for (let second = 0; second < 6; second++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    }
    expect(saveDraftRecording).toHaveBeenCalledWith(expect.objectContaining({ duration: 5, mimeType: "audio/webm" }));
  });

  it("shows a recoverable warning when draft persistence fails", async () => {
    vi.mocked(saveDraftRecording).mockRejectedValueOnce(new Error("Quota exceeded"));
    renderRecordingInterface();
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    await userEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be saved as a draft");
    expect(screen.getByRole("button", { name: "Submit Recording" })).toBeEnabled();
  });

  it("preserves continuation segments in background snapshots", async () => {
    renderRecordingInterface();
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    await userEvent.click(screen.getByRole("button", { name: "Stop" }));
    vi.useFakeTimers();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Continue" })); });
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(saveDraftRecording).toHaveBeenLastCalledWith(expect.objectContaining({ audioBlob: expect.any(Blob), continuationBlob: expect.any(Blob) }));
  });
  it("starts immediately when no recording disclaimer is configured", async () => {
    const user = userEvent.setup();

    renderRecordingInterface();

    await user.click(screen.getByRole("button", { name: "Start" }));

    await waitFor(() => {
      expect(mocks.createRecordingCapture).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByText("Recording consent")).not.toBeInTheDocument();
  });

  it("requires the user to resume before stopping a paused recording", async () => {
    const user = userEvent.setup();

    renderRecordingInterface();
    await user.click(screen.getByRole("button", { name: "Start" }));
    await user.click(screen.getByRole("button", { name: "Pause" }));
    await user.click(screen.getByRole("button", { name: "Stop" }));
    await user.click(screen.getByRole("button", { name: "Stop" }));

    expect(mocks.warning).toHaveBeenCalledTimes(2);
    expect(mocks.warning).toHaveBeenLastCalledWith(
      "Resume the recording before stopping.",
      expect.objectContaining({ id: "recording-stop-paused" }),
    );
    expect(
      screen.getByRole("button", { name: "Submit Recording" }),
    ).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Resume" }));
    await user.click(screen.getByRole("button", { name: "Stop" }));

    expect(
      await screen.findByRole("button", { name: "Submit Recording" }),
    ).toBeEnabled();
  });

  it("warns when microphone activity is detected while recording is paused", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-21T12:00:00.000Z"));

    renderRecordingInterface();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Start" }));
      await Promise.resolve();
    });

    mocks.audioLevel = 12;
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Recording is paused");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Resume recording to capture what is being said.",
    );
  });

  it("warns after two and a half minutes without microphone input", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-21T12:00:00.000Z"));

    renderRecordingInterface();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Start" }));
      await Promise.resolve();
    });

    act(() => {
      vi.advanceTimersByTime(150_250);
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "No microphone input detected",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Check your microphone",
    );
  });

  it("releases capture resources when the recorder cannot start", async () => {
    class FailingMediaRecorder {
      static isTypeSupported = () => true;

      constructor() {
        throw new DOMException("Recorder unavailable", "NotSupportedError");
      }
    }
    vi.stubGlobal("MediaRecorder", FailingMediaRecorder);

    renderRecordingInterface();
    fireEvent.click(screen.getByRole("button", { name: "Start" }));

    await waitFor(() => {
      expect(mocks.captureCleanup).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByRole("button", { name: "Start" })).toBeEnabled();
  });

  it("requires consent before starting a configured recording", async () => {
    const user = userEvent.setup();

    renderRecordingInterface({
      recording_disclaimer_enabled: true,
      recording_disclaimer: "Consent to record this session.",
    });

    await user.click(screen.getByRole("button", { name: "Start" }));

    expect(screen.getByText("Recording consent")).toBeInTheDocument();
    expect(screen.getByText("Consent to record this session.")).toBeInTheDocument();
    expect(mocks.createRecordingCapture).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mocks.createRecordingCapture).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Start" }));
    await user.click(screen.getByRole("button", { name: "I agree, record" }));

    await waitFor(() => {
      expect(mocks.createRecordingCapture).toHaveBeenCalledTimes(1);
    });
  });

  it("requires consent before continuing a configured recording", async () => {
    const user = userEvent.setup();

    renderRecordingInterface({
      recording_disclaimer_enabled: true,
      recording_disclaimer: "Consent before continuing.",
    });
    await user.click(screen.getByRole("button", { name: "Start" }));
    await user.click(screen.getByRole("button", { name: "I agree, record" }));
    await user.click(screen.getByRole("button", { name: "Stop" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
    });

    mocks.createRecordingCapture.mockClear();
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByText("Recording consent")).toBeInTheDocument();
    expect(mocks.createRecordingCapture).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "I agree, record" }));
    await waitFor(() => {
      expect(mocks.createRecordingCapture).toHaveBeenCalledTimes(1);
    });
  });

  it("submits accepted consent evidence with the recording", async () => {
    const user = userEvent.setup();

    renderRecordingInterface({
      recording_disclaimer_enabled: true,
      recording_disclaimer: "Consent to record this session.",
    });

    await user.click(screen.getByRole("button", { name: "Start" }));
    await user.click(screen.getByRole("button", { name: "I agree, record" }));
    await user.click(screen.getByRole("button", { name: "Stop" }));
    await user.click(await screen.findByRole("button", { name: "Submit Recording" }));

    await waitFor(() => expect(mocks.uploadFile).toHaveBeenCalled());
    expect(mocks.uploadFile.mock.calls[0][5].recording_consent).toMatchObject({
      accepted: true,
      policy_version: "recording-disclaimer-v1",
    });
    expect(mocks.uploadFile.mock.calls[0][5].recording_consent.accepted_at).toEqual(
      expect.any(String),
    );
  });

  it("restores consent evidence from a saved draft before retrying submission", async () => {
    const user = userEvent.setup();
    mocks.getDraftRecording.mockResolvedValue({
      id: "draft-1",
      categoryId: "cat-1",
      subcategoryId: "sub-1",
      categoryName: "Service Area",
      subcategoryName: "Meeting Type",
      audioBlob: new Blob(["audio"], { type: "audio/webm" }),
      duration: 3,
      timestamp: Date.now(),
      recordingConsent: {
        accepted: true,
        policy_version: "recording-disclaimer-v1",
        accepted_at: "2026-09-10T10:00:00.000Z",
      },
    });

    renderRecordingInterface({ recording_disclaimer_enabled: true });
    await user.click(await screen.findByRole("button", { name: "Restore Draft" }));
    await user.click(screen.getByRole("button", { name: "Submit Recording" }));

    await waitFor(() => expect(mocks.uploadFile).toHaveBeenCalled());
    expect(mocks.uploadFile.mock.calls[0][5].recording_consent).toEqual({
      accepted: true,
      policy_version: "recording-disclaimer-v1",
      accepted_at: "2026-09-10T10:00:00.000Z",
    });
  });

  it("uses the default disclaimer when enabled without custom text", async () => {
    const user = userEvent.setup();

    renderRecordingInterface({
      recording_disclaimer_enabled: true,
      recording_disclaimer: "",
    });

    await user.click(screen.getByRole("button", { name: "Start" }));

    expect(screen.getByText("Recording consent")).toBeInTheDocument();
    expect(
      screen.getByText(/I am using Community Brief tool to record/),
    ).toBeInTheDocument();
    expect(mocks.createRecordingCapture).not.toHaveBeenCalled();
  });

  it("merges separate media segments when continuing a recording", async () => {
    const user = userEvent.setup();

    renderRecordingInterface();
    await user.click(screen.getByRole("button", { name: "Start" }));
    await user.click(screen.getByRole("button", { name: "Stop" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
    });

    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Stop" }));

    await waitFor(() => {
      expect(mocks.concatenateAudioSegments).toHaveBeenCalledTimes(1);
    });
    const [segments] = mocks.concatenateAudioSegments.mock.calls[0];
    expect(segments).toHaveLength(2);
    expect(segments[0]).toBeInstanceOf(Blob);
    expect(segments[1]).toBeInstanceOf(Blob);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Submit Recording" })).toBeEnabled();
    });
    expect(URL.createObjectURL).toHaveBeenLastCalledWith(
      expect.objectContaining({
        name: "continued-recording.wav",
        type: "audio/wav",
      }),
    );
  });

  it("restores the previous recording when segment merging fails", async () => {
    const user = userEvent.setup();
    mocks.concatenateAudioSegments.mockRejectedValueOnce(
      new Error("Unable to decode segment"),
    );

    renderRecordingInterface();
    await user.click(screen.getByRole("button", { name: "Start" }));
    await user.click(screen.getByRole("button", { name: "Stop" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
    });

    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Stop" }));

    await waitFor(() => {
      expect(mocks.concatenateAudioSegments).toHaveBeenCalledTimes(1);
    });
    const [segments] = mocks.concatenateAudioSegments.mock.calls[0];
    await waitFor(() => {
      expect(URL.createObjectURL).toHaveBeenLastCalledWith(segments[0]);
      expect(screen.getByRole("button", { name: "Submit Recording" })).toBeEnabled();
    });
  });

  it("saves the modal display name before starting a new recording", async () => {
    const user = userEvent.setup();

    renderRecordingInterface();

    await user.click(screen.getByRole("button", { name: "Start" }));
    await user.click(screen.getByRole("button", { name: "Stop" }));
    await user.click(
      await screen.findByRole("button", { name: "Submit Recording" }),
    );

    await screen.findByText("Recording Saved");
    await user.type(
      screen.getByPlaceholderText("Untitled Session"),
      "Weekly standup",
    );
    await user.click(
      screen.getByRole("button", { name: "Start New Recording" }),
    );

    await waitFor(() => {
      expect(mocks.updateJobDisplayName).toHaveBeenCalledWith(
        "job-123",
        "Weekly standup",
      );
      expect(mocks.onUploadComplete).toHaveBeenCalledTimes(1);
    });
  });

  it("uses elapsed wall-clock time when timer ticks are delayed", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-02T12:00:00.000Z"));

    renderRecordingInterface();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Start" }));
      await Promise.resolve();
    });

    act(() => {
      vi.setSystemTime(new Date("2026-07-02T12:01:01.000Z"));
      vi.advanceTimersByTime(500);
    });

    expect(screen.getByText("01:01")).toBeInTheDocument();
  });

  it("preserves partial audio when the recording track ends unexpectedly", async () => {
    const user = userEvent.setup();
    let endSource: (() => void) | undefined;
    const track = {
      kind: "audio",
      stop: vi.fn(),
      addEventListener: vi.fn(),
    };
    const stream = {
      getAudioTracks: () => [track],
      getTracks: () => [track],
    };
    mocks.createRecordingCapture.mockImplementationOnce((options) => {
      endSource = options.onSourceEnded;
      return Promise.resolve({
        recordingStream: stream,
        micMonitorStream: stream,
        systemMonitorStream: null,
        systemAudioAvailable: false,
        voiceIsolationApplied: false,
        cleanup: vi.fn(),
      });
    });

    renderRecordingInterface();
    await user.click(screen.getByRole("button", { name: "Start" }));

    act(() => endSource?.());

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Submit Recording" })).toBeEnabled();
    });
    expect(mocks.interrupted).toHaveBeenCalledTimes(1);
  });

  it("keeps voice isolation off by default for hybrid mode and uploads hybrid metadata", async () => {
    const user = userEvent.setup();

    renderRecordingInterface();

    const voiceIsolation = screen.getByRole("switch", {
      name: "Voice Isolation",
    });
    expect(voiceIsolation).not.toBeChecked();
    expect(voiceIsolation).toHaveClass("h-5", "w-9");
    expect(voiceIsolation.firstElementChild).toHaveClass("h-4", "w-4");

    await user.click(screen.getByRole("button", { name: /hybrid/i }));
    expect(voiceIsolation).not.toBeChecked();

    await user.click(screen.getByRole("button", { name: "Start" }));
    await user.click(screen.getByRole("button", { name: "Stop" }));
    await user.click(
      await screen.findByRole("button", { name: "Submit Recording" }),
    );

    await waitFor(() => {
      expect(mocks.uploadFile).toHaveBeenCalled();
    });

    const uploadMetadata = mocks.uploadFile.mock.calls[0][5];
    expect(uploadMetadata.recording_settings).toMatchObject({
      capture_mode: "hybrid",
      system_audio_requested: true,
      system_audio_captured: true,
      voice_isolation_enabled: false,
      voice_isolation_applied: false,
      mix_strategy: "single_mixed_track",
    });
  });

  it("shows a preparation state while hybrid capture is pending", async () => {
    const user = userEvent.setup();
    const track = { kind: "audio", stop: vi.fn(), addEventListener: vi.fn() };
    const stream = {
      getAudioTracks: () => [track],
      getTracks: () => [track],
    };
    let resolveCapture!: (capture: unknown) => void;
    mocks.createRecordingCapture.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCapture = resolve;
      }),
    );

    renderRecordingInterface();

    await user.click(screen.getByRole("button", { name: /hybrid/i }));
    await user.click(screen.getByRole("button", { name: "Start" }));

    expect(screen.getByText("Preparing hybrid audio")).toBeInTheDocument();
    expect(screen.getByText("Opening share picker")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preparing" })).toBeDisabled();

    resolveCapture({
      recordingStream: stream,
      micMonitorStream: stream,
      systemMonitorStream: stream,
      systemAudioAvailable: true,
      voiceIsolationApplied: false,
      cleanup: vi.fn(),
    });

    await waitFor(() => {
      expect(screen.getByText("Recording")).toBeInTheDocument();
    });
  });
});
