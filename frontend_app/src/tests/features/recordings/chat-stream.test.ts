import { beforeEach, describe, expect, it, vi } from "vitest";
import { streamWithAuth } from "@/shared/api/client/fetchClient";
import { streamChatResponse } from "@/features/recordings/data/recording-analysis-chat";

vi.mock("@/shared/api/client/fetchClient", () => ({
  fetchWithAuth: vi.fn(),
  streamWithAuth: vi.fn(() => Promise.resolve(new Response())),
}));

describe("streamChatResponse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resumes approved apply_patch tools with the AG-UI snapshot", async () => {
    const snapshot = [
      {
        role: "assistant",
        tool_calls: [
          {
            id: "patch-1",
            type: "function",
            function: {
              name: "apply_patch",
              arguments: '{"old_text":"old","new_text":"new"}',
            },
          },
        ],
      },
    ];

    await streamChatResponse(
      "job-1",
      "",
      [{ role: "assistant", content: "", agUiMessages: snapshot }],
      2000,
      {
        id: "approval-1",
        callId: "patch-1",
        name: "apply_patch",
        arguments: { old_text: "old", new_text: "new" },
        approved: true,
      },
    );

    const [, init] = vi.mocked(streamWithAuth).mock.calls[0];
    const body = JSON.parse(String(init?.body));

    expect(body.messages).toEqual(snapshot);
    expect(body.resume).toEqual({
      id: "patch-1",
      value: {
        accepted: true,
        function_call_id: "patch-1",
      },
    });
  });

  it("adds completed tool outputs before resuming approval", async () => {
    const snapshot = [
      {
        role: "assistant",
        tool_calls: [
          {
            id: "read-1",
            type: "function",
            function: {
              name: "read_analysis_markdown",
              arguments: "{}",
            },
          },
        ],
      },
      {
        role: "assistant",
        tool_calls: [
          {
            id: "patch-1",
            type: "function",
            function: {
              name: "apply_patch",
              arguments: '{"old_text":"old","new_text":"new"}',
            },
          },
        ],
      },
    ];

    await streamChatResponse(
      "job-1",
      "",
      [
        {
          role: "assistant",
          content: "",
          agUiMessages: snapshot,
          toolInvocations: [
            {
              id: "read-1",
              name: "read_analysis_markdown",
              status: "completed",
              result: "old text",
            },
            {
              id: "patch-1",
              name: "apply_patch",
              status: "approval_required",
            },
          ],
        },
      ],
      2000,
      {
        id: "approval-1",
        callId: "patch-1",
        name: "apply_patch",
        arguments: { old_text: "old", new_text: "new" },
        approved: true,
      },
    );

    const [, init] = vi.mocked(streamWithAuth).mock.calls[0];
    const body = JSON.parse(String(init?.body));

    expect(body.messages).toEqual([
      snapshot[0],
      {
        role: "tool",
        toolCallId: "read-1",
        content: "old text",
      },
      snapshot[1],
    ]);
  });
});
