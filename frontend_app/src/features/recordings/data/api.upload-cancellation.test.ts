import { beforeEach, describe, expect, it, vi } from "vitest";
import { UploadCancelledError, uploadFile } from "./api";

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
});
