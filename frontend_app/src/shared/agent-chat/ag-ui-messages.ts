import type { AgUiMessage, ToolApprovalRequest, ToolInvocation } from "./types";

interface ChatHistoryItem {
  role?: string;
  content?: string;
  agUiMessages?: Array<AgUiMessage>;
  toolInvocations?: Array<ToolInvocation>;
}

export function latestAgUiSnapshot(
  history: Array<ChatHistoryItem>,
): Array<AgUiMessage> | undefined {
  return [...history].reverse().find((item) => item.agUiMessages?.length)
    ?.agUiMessages;
}

export function addMissingToolResults(
  messages: Array<AgUiMessage>,
  history: Array<ChatHistoryItem>,
  approval?: ToolApprovalRequest,
): Array<AgUiMessage> {
  const results = toolResultsById(history);
  const existing = new Set(
    messages
      .filter((message) => message.role === "tool")
      .map((message) =>
        String(message.toolCallId || message.tool_call_id || ""),
      )
      .filter(Boolean),
  );
  const approvingCallId = approval?.callId;
  const repaired: Array<AgUiMessage> = [];

  for (const message of messages) {
    const visibleMessage = withoutInternalToolCalls(message);
    if (!visibleMessage) {
      continue;
    }

    repaired.push(visibleMessage);
    const calls = toolCalls(visibleMessage);
    for (const call of calls) {
      if (
        !call.id ||
        call.id === approvingCallId ||
        existing.has(call.id) ||
        call.name === "confirm_changes"
      ) {
        continue;
      }
      repaired.push({
        role: "tool",
        toolCallId: call.id,
        content: results.get(call.id) || "Tool completed.",
      });
      existing.add(call.id);
    }
  }

  if (approval && !existingToolCallIds(repaired).has(approval.callId)) {
    repaired.push({
      role: "assistant",
      tool_calls: [
        {
          id: approval.callId,
          type: "function",
          function: {
            name: approval.name,
            arguments: JSON.stringify(approval.arguments || {}),
          },
        },
      ],
    });
  }

  return repaired;
}

function withoutInternalToolCalls(
  message: AgUiMessage,
): AgUiMessage | undefined {
  const nextMessage = { ...message };
  const hadToolCalls =
    Array.isArray(message.tool_calls) || Array.isArray(message.toolCalls);
  if (Array.isArray(message.tool_calls)) {
    nextMessage.tool_calls = message.tool_calls.filter(
      (call) => toolCallName(call) !== "confirm_changes",
    );
  }
  if (Array.isArray(message.toolCalls)) {
    nextMessage.toolCalls = message.toolCalls.filter(
      (call) => toolCallName(call) !== "confirm_changes",
    );
  }

  const hasToolCalls =
    (Array.isArray(nextMessage.tool_calls) &&
      nextMessage.tool_calls.length > 0) ||
    (Array.isArray(nextMessage.toolCalls) && nextMessage.toolCalls.length > 0);
  if (
    hadToolCalls &&
    !hasToolCalls &&
    !String(nextMessage.content || "").trim()
  ) {
    return undefined;
  }
  return nextMessage;
}

function existingToolCallIds(messages: Array<AgUiMessage>): Set<string> {
  return new Set(messages.flatMap(toolCalls).map((call) => call.id));
}

function toolResultsById(history: Array<ChatHistoryItem>): Map<string, string> {
  const results = new Map<string, string>();
  for (const item of history) {
    for (const invocation of item.toolInvocations || []) {
      if (invocation.result) {
        results.set(invocation.id, invocation.result);
      }
    }
  }
  return results;
}

function toolCalls(message: AgUiMessage): Array<{ id: string; name: string }> {
  const calls = message.tool_calls || message.toolCalls;
  if (!Array.isArray(calls)) {
    return [];
  }
  return calls
    .map((call) => {
      if (!call || typeof call !== "object") {
        return undefined;
      }
      const payload = call as { id?: unknown; function?: { name?: unknown } };
      return {
        id: String(payload.id || ""),
        name: String(payload.function?.name || ""),
      };
    })
    .filter((call): call is { id: string; name: string } => Boolean(call?.id));
}

function toolCallName(call: unknown): string {
  if (!call || typeof call !== "object") {
    return "";
  }
  return String(
    (call as { function?: { name?: unknown } }).function?.name || "",
  );
}
