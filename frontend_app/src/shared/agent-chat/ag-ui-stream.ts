import type { ToolInvocation } from "./types";

const INTERNAL_TOOL_NAMES = new Set(["confirm_changes"]);

export interface AgUiStreamHandlers {
  onTextDelta?: (text: string, delta: string) => void;
  onEvent?: (event: any) => void;
  onError?: (message: string) => void;
  onToolInvocation?: (invocation: ToolInvocation) => void;
}

export async function readAgUiTextStream(
  response: Response,
  handlers: AgUiStreamHandlers = {},
): Promise<string> {
  const body = response.body;
  if (!body) {
    throw new Error("Cannot read response stream");
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let buffer = "";
  const toolNames = new Map<string, string>();
  const toolArgs = new Map<string, string>();

  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      return text;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines[lines.length - 1];

    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i].trim();
      if (!line || !line.startsWith("data: ")) {
        continue;
      }

      const data = line.slice(6);
      if (data === "[DONE]") {
        return text;
      }
      if (data.startsWith("[ERROR]")) {
        handlers.onError?.(data);
        continue;
      }

      try {
        const event = JSON.parse(data);
        handlers.onEvent?.(event);
        emitToolInvocation(event, handlers, toolNames, toolArgs);
        emitToolApproval(event, handlers, toolNames, toolArgs);
        if (event.type === "TEXT_MESSAGE_CONTENT") {
          const delta = event.delta || "";
          text += delta;
          handlers.onTextDelta?.(text, delta);
        } else if (event.type === "RUN_ERROR") {
          handlers.onError?.(event.message || "Chat stream failed");
        }
      } catch {
        text += data;
        handlers.onTextDelta?.(text, data);
      }
    }
  }
}

function emitToolApproval(
  event: any,
  handlers: AgUiStreamHandlers,
  toolNames: Map<string, string>,
  toolArgs: Map<string, string>,
) {
  if (event.type !== "CUSTOM" || event.name !== "function_approval_request") {
    return;
  }

  const value = event.value || {};
  const functionCall = value.functionCall || value.function_call || {};
  const callId = functionCall.callId || functionCall.call_id;
  const name = functionCall.name || "tool";
  if (!callId) {
    return;
  }

  const args = functionCall.arguments || {};
  const argsText = JSON.stringify(args);
  toolNames.set(callId, name);
  toolArgs.set(callId, argsText);
  handlers.onToolInvocation?.({
    id: callId,
    name,
    status: "approval_required",
    args: argsText,
    approval: {
      id: value.id || callId,
      callId,
      name,
      arguments: args,
    },
  });
}

function emitToolInvocation(
  event: any,
  handlers: AgUiStreamHandlers,
  toolNames: Map<string, string>,
  toolArgs: Map<string, string>,
) {
  const id = event.toolCallId || event.tool_call_id;
  if (!id) {
    return;
  }

  if (event.type === "TOOL_CALL_START" || event.type === "TOOL_CALL_CHUNK") {
    const name = event.toolCallName || event.tool_call_name || toolNames.get(id) || "tool";
    toolNames.set(id, name);
    if (INTERNAL_TOOL_NAMES.has(name)) {
      return;
    }
    handlers.onToolInvocation?.({
      id,
      name,
      status: "running",
      args: toolArgs.get(id),
    });
    return;
  }

  if (event.type === "TOOL_CALL_ARGS") {
    if (INTERNAL_TOOL_NAMES.has(toolNames.get(id) || "")) {
      return;
    }
    const nextArgs = `${toolArgs.get(id) || ""}${event.delta || ""}`;
    toolArgs.set(id, nextArgs);
    handlers.onToolInvocation?.({
      id,
      name: toolNames.get(id) || "tool",
      status: "running",
      args: nextArgs,
    });
    return;
  }

  if (event.type === "TOOL_CALL_END") {
    if (INTERNAL_TOOL_NAMES.has(toolNames.get(id) || "")) {
      return;
    }
    handlers.onToolInvocation?.({
      id,
      name: toolNames.get(id) || "tool",
      status: "completed",
      args: toolArgs.get(id),
    });
    return;
  }

  if (event.type === "TOOL_CALL_RESULT") {
    if (INTERNAL_TOOL_NAMES.has(toolNames.get(id) || "")) {
      return;
    }
    handlers.onToolInvocation?.({
      id,
      name: toolNames.get(id) || "tool",
      status: "completed",
      args: toolArgs.get(id),
      result: event.content || "",
    });
  }
}

