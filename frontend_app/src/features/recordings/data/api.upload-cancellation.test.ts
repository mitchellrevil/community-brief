import { beforeEach, describe, expect, it, vi } from "vitest";
import { UploadCancelledError, uploadFile } from "./api";
import { normalizeAudioFilename } from "@/lib/audio-format";

const mocks = vi.hoisted(() => ({
  blobUpload: vi.fn(),
  deleteIfExists: vi.fn(),
  directPost: vi.fn(),
  httpPost: vi.fn(),
}));

vi.mock("@azure/storage-blob", () => ({
  BlockBlobClient: class {
    uploadData = mocks.blobUpload;
    deleteIfExists = mocks.deleteIfExists;
  },
}));

vi.mock("@/shared/api/client/httpClient", () => ({
  directBackendClient: { post: mocks.directPost },
  httpClient: { post: mocks.httpPost },
}));

vi.mock("@/lib/online-status", () => ({ isOnline: vi.fn() }));
vi.mock("@/lib/pwa-queue", () => ({ queueRecording: vi.fn() }));

describe("uploadFile cancellation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.httpPost.mockResolvedValue({
      data: {
        sas_url: "https://storage.example/recordings/clip.wav?sas=token",
        blob_url: "https://storage.example/recordings/clip.wav",
        filename: "clip.wav",
      },
    });
    mocks.deleteIfExists.mockResolvedValue({ succeeded: true });
  });

  it("aborts the Blob transfer, cleans up, and never creates a job", async () => {
    let transferOptions: { abortSignal?: AbortSignal } | undefined;
    mocks.blobUpload.mockImplementation((_file: File, options: { abortSignal?: AbortSignal }) => new Promise((_resolve, reject) => {
      transferOptions = options;
      options.abortSignal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    const controller = new AbortController();

    const upload = uploadFile(
      new File(["recording"], "clip.wav", { type: "audio/wav" }),
      "category-1",
      "subcategory-1",
      undefined,
      undefined,
      undefined,
      controller.signal,
    );

    await vi.waitFor(() => expect(mocks.blobUpload).toHaveBeenCalledOnce());
    expect(transferOptions?.abortSignal).toBe(controller.signal);

    controller.abort();

    await expect(upload).rejects.toBeInstanceOf(UploadCancelledError);
    expect(mocks.deleteIfExists).toHaveBeenCalledOnce();
    expect(mocks.httpPost).toHaveBeenCalledOnce();
    expect(mocks.directPost).not.toHaveBeenCalled();
  });

  it("does not call the completion endpoint when cancellation wins after Blob upload", async () => {
    const controller = new AbortController();
    const phases: Array<string> = [];
    mocks.blobUpload.mockImplementation(() => {
      controller.abort();
      return Promise.resolve();
    });

    await expect(
      uploadFile(
        new File(["recording"], "clip.wav", { type: "audio/wav" }),
        "category-1",
        "subcategory-1",
        undefined,
        undefined,
        undefined,
        controller.signal,
        (phase) => phases.push(phase),
      ),
    ).rejects.toBeInstanceOf(UploadCancelledError);

    expect(mocks.deleteIfExists).toHaveBeenCalledOnce();
    expect(mocks.httpPost).toHaveBeenCalledOnce();
    expect(phases).toEqual(["uploading"]);
  });

  it("persists the Teams event identity through direct upload completion", async () => {
    mocks.blobUpload.mockResolvedValueOnce({});
    await uploadFile(new File(["WEBVTT"], "meeting.vtt", { type: "text/vtt" }), "category-1", "template-1", undefined, undefined, { teams_event_id: "event-1" });
    expect(mocks.httpPost.mock.calls[1][1]).toMatchObject({ teams_event_id: "event-1" });
  });

  it("keeps a normalized WAV name aligned through token, Blob headers and completion", async () => {
    const file = normalizeAudioFilename(new File(["synthetic WAV"], "continued.webm", { type: "audio/wav" }));
    mocks.blobUpload.mockResolvedValueOnce({});
    mocks.httpPost.mockResolvedValueOnce({ data: {
      sas_url: "https://storage.example/recordings/continued.wav?sas=token",
      blob_url: "https://storage.example/recordings/continued.wav",
      filename: "continued.wav",
    } }).mockResolvedValueOnce({ data: { id: "synthetic-job" } });
    await uploadFile(file, "category-1", "template-1");
    expect(mocks.httpPost.mock.calls[0][1]).toMatchObject({ filename: "continued.wav", content_type: "audio/wav" });
    expect(mocks.blobUpload.mock.calls[0][0]).toBe(file);
    expect(mocks.blobUpload.mock.calls[0][1].blobHTTPHeaders).toMatchObject({ blobContentType: "audio/wav" });
    expect(mocks.httpPost.mock.calls[1][1]).toMatchObject({ filename: "continued.wav" });
  });

  it("retains the Teams event identity when direct upload falls back to multipart", async () => {
    mocks.httpPost.mockRejectedValueOnce({ response: { status: 404 } });
    mocks.directPost.mockResolvedValueOnce({ data: { id: "job-1" } });
    await uploadFile(new File(["WEBVTT"], "meeting.vtt", { type: "text/vtt" }), "category-1", "template-1", undefined, undefined, { teams_event_id: "event-1" });
    const formData = mocks.directPost.mock.calls[0][1] as FormData;
    expect(formData.get("teams_event_id")).toBe("event-1");
  });
});
