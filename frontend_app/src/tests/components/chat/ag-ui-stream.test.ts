import { describe, expect, it, vi } from "vitest";
import { readAgUiTextStream } from "@/shared/agent-chat/ag-ui-stream";

describe("readAgUiTextStream", () => {
  it("collects AG-UI text deltas and exposes custom events", async () => {
    const onEvent = vi.fn();
    const response = new Response(
      [
        'data: {"type":"TEXT_MESSAGE_CONTENT","delta":"Hello"}\n\n',
        'data: {"type":"PROMPT_CHANGED","promptId":"prompt-1"}\n\n',
        'data: {"type":"TEXT_MESSAGE_CONTENT","delta":" world"}\n\n',
      ].join(""),
    );

    const text = await readAgUiTextStream(response, { onEvent });

    expect(text).toBe("Hello world");
    expect(onEvent).toHaveBeenCalledWith({
      type: "PROMPT_CHANGED",
      promptId: "prompt-1",
    });
  });

  it("emits tool invocation updates from AG-UI tool events", async () => {
    const onToolInvocation = vi.fn();
    const response = new Response(
      [
        'data: {"type":"TOOL_CALL_START","toolCallId":"tool-1","toolCallName":"read_selected_folder"}\n\n',
        'data: {"type":"TOOL_CALL_ARGS","toolCallId":"tool-1","delta":"{\\"limit\\":100}"}\n\n',
        'data: {"type":"TOOL_CALL_END","toolCallId":"tool-1"}\n\n',
        'data: {"type":"TOOL_CALL_RESULT","toolCallId":"tool-1","content":"{\\"count\\":2}"}\n\n',
      ].join(""),
    );

    await readAgUiTextStream(response, { onToolInvocation });

    expect(onToolInvocation).toHaveBeenLastCalledWith({
      id: "tool-1",
      name: "read_selected_folder",
      status: "completed",
      args: '{"limit":100}',
      result: '{"count":2}',
    });
  });

  it("emits approval-required tool invocations from function approval requests", async () => {
    const onToolInvocation = vi.fn();
    const response = new Response(
      [
        'data: {"type":"CUSTOM","name":"function_approval_request","value":{"id":"approval-1","functionCall":{"callId":"tool-1","name":"create_prompt","arguments":{"name":"Review"}}}}\n\n',
      ].join(""),
    );

    await readAgUiTextStream(response, { onToolInvocation });

    expect(onToolInvocation).toHaveBeenCalledWith({
      id: "tool-1",
      name: "create_prompt",
      status: "approval_required",
      args: '{"name":"Review"}',
      approval: {
        id: "approval-1",
        callId: "tool-1",
        name: "create_prompt",
        arguments: { name: "Review" },
      },
    });
  });

  it("hides internal confirm_changes tool events", async () => {
    const onToolInvocation = vi.fn();
    const response = new Response(
      [
        'data: {"type":"TOOL_CALL_START","toolCallId":"confirm-1","toolCallName":"confirm_changes"}\n\n',
        'data: {"type":"TOOL_CALL_ARGS","toolCallId":"confirm-1","delta":"{}"}\n\n',
        'data: {"type":"TOOL_CALL_END","toolCallId":"confirm-1"}\n\n',
      ].join(""),
    );

    await readAgUiTextStream(response, { onToolInvocation });

    expect(onToolInvocation).not.toHaveBeenCalled();
  });
});
