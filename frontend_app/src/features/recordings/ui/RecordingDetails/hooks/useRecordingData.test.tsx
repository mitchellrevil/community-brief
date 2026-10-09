import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useRecordingData } from "./useRecordingData";
import type { PropsWithChildren } from "react";
import { recordingsKeys } from "@/features/recordings/data/keys";

const mocks = vi.hoisted(() => ({ transcript: vi.fn() }));
vi.mock("@/features/recordings/data/queries", () => ({
  getAudioRecordingQuery: (id: string) => ({
    queryKey: recordingsKeys.single(id),
    queryFn: vi.fn(),
    staleTime: Infinity,
  }),
  getAudioTranscriptionQuery: (id: string, version?: { revision?: string; status: string }) => ({
    queryKey: version ? [...recordingsKeys.transcription(id), version] : recordingsKeys.transcription(id),
    queryFn: mocks.transcript,
  }),
}));
vi.mock("@/shared/data/templates", () => ({
  allFoldersQuery: () => ({ queryKey: ["folders"], queryFn: () => Promise.resolve([]) }),
  allTemplatesQuery: () => ({
    queryKey: ["templates"],
    queryFn: () => Promise.resolve([]),
  }),
}));

const clients: Array<QueryClient> = [];
afterEach(() => {
  clients.forEach((client) => client.clear());
  clients.length = 0;
  vi.clearAllMocks();
});

function renderRecording(status: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  clients.push(client);
  const recording = {
    id: "job-1",
    status,
    file_path: "https://storage/audio.wav",
    transcription_revision: "revision-1",
  };
  client.setQueryData(recordingsKeys.single("job-1"), recording);
  client.setQueryData([...recordingsKeys.transcription("job-1"), { revision: "old-revision", status: "completed" }], "Old cached labels");
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return {
    ...renderHook(() => useRecordingData("job-1"), { wrapper }),
    client,
    recording,
  };
}

describe("Recording transcript cache", () => {
  it("does not reuse an earlier revision when reopening a completed job", async () => {
    mocks.transcript.mockResolvedValue("Jane");
    const { result } = renderRecording("completed");
    await waitFor(() => expect(result.current.transcriptionText).toBe("Jane"));
    expect(mocks.transcript).toHaveBeenCalledTimes(1);
  });
  it("refreshes completed content when speaker edits change its revision", async () => {
    mocks.transcript
      .mockResolvedValueOnce("Speaker 1")
      .mockResolvedValue("Jane");
    const { result, client, recording } = renderRecording("completed");
    await waitFor(() =>
      expect(result.current.transcriptionText).toBe("Speaker 1"),
    );
    act(() =>
      client.setQueryData(recordingsKeys.single("job-1"), {
        ...recording,
        transcription_revision: "revision-2",
      }),
    );
    await waitFor(() => expect(result.current.transcriptionText).toBe("Jane"));
    expect(mocks.transcript).toHaveBeenCalledTimes(2);
  });

  it("loads the final transcript as processing completes", async () => {
    mocks.transcript
      .mockResolvedValueOnce("Speaker 1")
      .mockResolvedValue("Jane");
    const { result, client, recording } = renderRecording("analysing");
    await waitFor(() =>
      expect(result.current.transcriptionText).toBe("Speaker 1"),
    );
    act(() =>
      client.setQueryData(recordingsKeys.single("job-1"), {
        ...recording,
        status: "completed",
      }),
    );
    await waitFor(() => expect(result.current.transcriptionText).toBe("Jane"));
    expect(mocks.transcript).toHaveBeenCalledTimes(2);
  });
});
