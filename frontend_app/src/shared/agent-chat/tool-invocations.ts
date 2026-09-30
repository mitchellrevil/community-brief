import type { ToolApprovalRequest, ToolInvocation } from "./types";

export function formatToolName(name: string): string {
  return name
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function mergeToolInvocation(
  invocations: Array<ToolInvocation>,
  next: ToolInvocation,
): Array<ToolInvocation> {
  const index = invocations.findIndex(
    (invocation) => invocation.id === next.id,
  );
  if (index === -1) {
    return [...invocations, next];
  }

  const updated = [...invocations];
  const existing = updated[index];
  const shouldKeepApprovalOpen =
    existing.status === "approval_required" &&
    next.status === "completed" &&
    !next.result;

  updated[index] = {
    ...existing,
    ...next,
    status: shouldKeepApprovalOpen ? existing.status : next.status,
    approval: shouldKeepApprovalOpen ? existing.approval : next.approval,
    args: next.args ?? updated[index].args,
    result: next.result ?? updated[index].result,
  };
  return updated;
}

export function applyToolApprovalDecision<
  T extends { toolInvocations?: Array<ToolInvocation> },
>(
  messages: Array<T>,
  approval: ToolApprovalRequest,
  approved: boolean,
): Array<T> {
  return messages.map((message) => ({
    ...message,
    toolInvocations: message.toolInvocations?.map((invocation) => {
      if (invocation.approval?.callId !== approval.callId) {
        return invocation;
      }
      return {
        ...invocation,
        status: "completed",
        approval: undefined,
        result: approved ? "Approved by user." : "Rejected by user.",
      };
    }),
  }));
}
