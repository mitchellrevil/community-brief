import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMediaUpload } from "./useMediaUpload";
import { createQueryClient, createQueryClientWrapper } from "@/tests/test-utils";

const uploadFile = vi.hoisted(() => vi.fn());
const convertToWavWithFFmpeg = vi.hoisted(() => vi.fn());

vi.mock('@/lib/ffmpegConvert', () => ({ convertToWavWithFFmpeg }));
vi.mock('@/lib/online-status', () => ({ isOnlineSync: () => true }));

vi.mock("@/features/recordings/data/api", () => ({
  uploadFile,
  isUploadCancelledError: (error: unknown, signal?: AbortSignal) =>
    signal?.aborted || (error instanceof DOMException && error.name === "AbortError"),
}));

describe("useMediaUpload cancellation", () => {
  beforeEach(() => {
    uploadFile.mockReset();
    convertToWavWithFFmpeg.mockReset();
  });

  it('uploads a Teams VTT unchanged even after an audio file was selected', async () => {
    uploadFile.mockResolvedValue({ job_id: 'job-1' });
    const wrapper = createQueryClientWrapper(createQueryClient());
    const { result } = renderHook(() => useMediaUpload(), { wrapper });
    const vtt = new File(['WEBVTT\n\n'], 'teams-meeting.vtt', { type: 'text/vtt' });

    act(() => result.current.handleFileSelect(
      new File(['audio'], 'recording.wav', { type: 'audio/wav' }),
    ));
    await act(async () => {
      await result.current.onSubmit({
        mediaFile: vtt,
        promptCategory: 'category-1',
        promptSubcategory: 'subcategory-1',
      });
    });

    expect(convertToWavWithFFmpeg).not.toHaveBeenCalled();
    const uploadedFile = uploadFile.mock.calls[0][0] as File;
    expect(uploadedFile.name).toBe('teams-meeting.vtt');
    expect(uploadedFile.type).toBe('text/vtt');
    expect(await uploadedFile.text()).toBe('WEBVTT\n\n');
  });

  it("stops the active upload without setting success or invalidating recordings", async () => {
    uploadFile.mockImplementation((...args: Array<unknown>) => new Promise((_resolve, reject) => {
      const signal = args[6] as AbortSignal;
      signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    const queryClient = createQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = createQueryClientWrapper(queryClient);
    const { result } = renderHook(() => useMediaUpload(), { wrapper });

    const file = new File(["meeting notes"], "meeting.txt", { type: "text/plain" });
    act(() => {
      void result.current.onSubmit({
        mediaFile: file,
        promptCategory: "category-1",
        promptSubcategory: "subcategory-1",
      });
    });

    await waitFor(() => expect(uploadFile).toHaveBeenCalledOnce());
    expect(result.current.isUploadCancellable).toBe(true);

    act(() => result.current.cancelUpload());

    await waitFor(() => expect(result.current.isUploadCancelled).toBe(true));
    expect((uploadFile.mock.calls[0][6] as AbortSignal).aborted).toBe(true);
    expect(result.current.uploadSuccessJobId).toBeNull();
    expect(result.current.uploadError).toBeNull();
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it("synchronously blocks cancellation when finalisation starts", async () => {
    let signal: AbortSignal | undefined;
    let changePhase: ((phase: "uploading" | "finalizing") => void) | undefined;
    let finishUpload: ((value: { job_id: string }) => void) | undefined;
    uploadFile.mockImplementation((...args: Array<unknown>) => {
      signal = args[6] as AbortSignal;
      changePhase = args[7] as (phase: "uploading" | "finalizing") => void;
      return new Promise((resolve) => {
        finishUpload = resolve;
      });
    });
    const queryClient = createQueryClient();
    const wrapper = createQueryClientWrapper(queryClient);
    const { result } = renderHook(() => useMediaUpload(), { wrapper });

    act(() => {
      void result.current.onSubmit({
        mediaFile: new File(["notes"], "meeting.txt", { type: "text/plain" }),
        promptCategory: "category-1",
        promptSubcategory: "subcategory-1",
      });
    });
    await waitFor(() => expect(uploadFile).toHaveBeenCalledOnce());

    act(() => {
      changePhase?.("finalizing");
      result.current.cancelUpload();
    });

    expect(signal?.aborted).toBe(false);
    expect(result.current.isFinalizing).toBe(true);
    expect(result.current.isUploadCancelled).toBe(false);

    await act(async () => {
      finishUpload?.({ job_id: "job-1" });
      await Promise.resolve();
    });
  });

  it("does not abort finalisation when the component unmounts", async () => {
    let signal: AbortSignal | undefined;
    let changePhase: ((phase: "uploading" | "finalizing") => void) | undefined;
    let finishUpload: ((value: { job_id: string }) => void) | undefined;
    uploadFile.mockImplementation((...args: Array<unknown>) => {
      signal = args[6] as AbortSignal;
      changePhase = args[7] as (phase: "uploading" | "finalizing") => void;
      return new Promise((resolve) => {
        finishUpload = resolve;
      });
    });
    const queryClient = createQueryClient();
    const wrapper = createQueryClientWrapper(queryClient);
    const { result, unmount } = renderHook(() => useMediaUpload(), { wrapper });

    act(() => {
      void result.current.onSubmit({
        mediaFile: new File(["notes"], "meeting.txt", { type: "text/plain" }),
        promptCategory: "category-1",
        promptSubcategory: "subcategory-1",
      });
    });
    await waitFor(() => expect(uploadFile).toHaveBeenCalledOnce());

    act(() => changePhase?.("finalizing"));
    unmount();

    expect(signal?.aborted).toBe(false);
    finishUpload?.({ job_id: "job-1" });
  });
});
