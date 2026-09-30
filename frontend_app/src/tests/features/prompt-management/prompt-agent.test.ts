import { beforeEach, describe, expect, it, vi } from "vitest";
import { streamTemplateAgentResponse } from "@/features/prompt-management/data/prompt-agent";
import { streamWithAuth } from "@/shared/api/client/fetchClient";

vi.mock("@/shared/api/client/fetchClient", () => ({
  streamWithAuth: vi.fn(() => Promise.resolve(new Response())),
}));

describe("streamTemplateAgentResponse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resumes approved write tools with the AG-UI resume payload", async () => {
    const snapshot = [
      {
        role: "assistant",
        tool_calls: [
          {
            id: "tool-1",
            type: "function",
            function: {
              name: "replace_selected_prompt",
              arguments: '{"name":"Review"}',
            },
          },
        ],
      },
    ];

    await streamTemplateAgentResponse({
      categoryId: "folder-1",
      templateId: "template-1",
      message: "",
      history: [{ role: "assistant", content: "", agUiMessages: snapshot }],
      approval: {
        id: "tool-1",
        callId: "tool-1",
        name: "replace_selected_prompt",
        arguments: { name: "Review" },
        approved: true,
      },
    });

    const [, init] = vi.mocked(streamWithAuth).mock.calls[0];
    const body = JSON.parse(String(init?.body));

    expect(body.template_id).toBe("template-1");
    expect(body.messages).toEqual(snapshot);
    expect(body).not.toHaveProperty("message");
    expect(body).not.toHaveProperty("conversation_history");
    expect(body.resume).toEqual({
      id: "tool-1",
      value: {
        accepted: true,
        function_call_id: "tool-1",
      },
    });
    expect(JSON.stringify(body)).not.toContain("function_approvals");
  });

  it("adds completed tool outputs before resuming prompt approvals", async () => {
    const snapshot = [
      {
        role: "assistant",
        tool_calls: [
          {
            id: "read-1",
            type: "function",
            function: {
              name: "read_selected_prompt",
              arguments: "{}",
            },
          },
        ],
      },
      {
        role: "assistant",
        tool_calls: [
          {
            id: "tool-1",
            type: "function",
            function: {
              name: "replace_selected_prompt",
              arguments: '{"name":"Review"}',
            },
          },
        ],
      },
    ];

    await streamTemplateAgentResponse({
      categoryId: "folder-1",
      templateId: "template-1",
      message: "",
      history: [
        {
          role: "assistant",
          content: "",
          agUiMessages: snapshot,
          toolInvocations: [
            {
              id: "read-1",
              name: "read_selected_prompt",
              status: "completed",
              result: '{"name":"Old"}',
            },
          ],
        },
      ],
      approval: {
        id: "tool-1",
        callId: "tool-1",
        name: "replace_selected_prompt",
        arguments: { name: "Review" },
        approved: true,
      },
    });

    const [, init] = vi.mocked(streamWithAuth).mock.calls[0];
    const body = JSON.parse(String(init?.body));

    expect(body.messages).toEqual([
      snapshot[0],
      {
        role: "tool",
        toolCallId: "read-1",
        content: '{"name":"Old"}',
      },
      snapshot[1],
    ]);
  });

  it("replaces the bridge's synthetic confirmation with the approved tool call", async () => {
    const snapshot = [
      {
        role: "user",
        content: "Add a manager field",
      },
      {
        role: "assistant",
        tool_calls: [
          {
            id: "confirm-1",
            type: "function",
            function: {
              name: "confirm_changes",
              arguments: '{"function_call_id":"tool-1"}',
            },
          },
        ],
      },
    ];

    await streamTemplateAgentResponse({
      categoryId: "folder-1",
      templateId: "template-1",
      message: "",
      history: [
        {
          role: "assistant",
          content: "",
          agUiMessages: snapshot,
          toolInvocations: [
            {
              id: "tool-1",
              name: "add_pre_session_form_field",
              status: "approval_required",
            },
          ],
        },
      ],
      approval: {
        id: "tool-1",
        callId: "tool-1",
        name: "add_pre_session_form_field",
        arguments: {
          label: "Manager",
          field_type: "text",
          reason: "Identifies the manager",
        },
        approved: true,
      },
    });

    const [, init] = vi.mocked(streamWithAuth).mock.calls[0];
    const body = JSON.parse(String(init?.body));

    expect(body.messages).toEqual([
      snapshot[0],
      {
        role: "assistant",
        tool_calls: [
          {
            id: "tool-1",
            type: "function",
            function: {
              name: "add_pre_session_form_field",
              arguments: JSON.stringify({
                label: "Manager",
                field_type: "text",
                reason: "Identifies the manager",
              }),
            },
          },
        ],
      },
    ]);
    expect(JSON.stringify(body.messages)).not.toContain("confirm_changes");
  });

  it("requires an AG-UI snapshot before approving a tool", () => {
    expect(() =>
      streamTemplateAgentResponse({
        categoryId: "folder-1",
        templateId: "template-1",
        message: "",
        history: [],
        approval: {
          id: "tool-1",
          callId: "tool-1",
          name: "replace_selected_prompt",
          arguments: { name: "Review" },
          approved: true,
        },
      }),
    ).toThrow(
      "Cannot approve a tool call without an AG-UI conversation snapshot",
    );

    expect(streamWithAuth).not.toHaveBeenCalled();
  });
});
