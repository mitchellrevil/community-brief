import type { Message } from "@/components/chat/ChatInterface";
import type {
  AgUiMessage,
  ToolApprovalRequest,
} from "@/shared/agent-chat/types";
import {
  addMissingToolResults,
  latestAgUiSnapshot,
} from "@/shared/agent-chat/ag-ui-messages";
import { streamWithAuth } from "@/shared/api/client/fetchClient";
import { AGENT_RUNS_API } from "@/shared/api/constants";

export interface StreamTemplateAgentArgs {
  categoryId: string;
  templateId?: string | null;
  threadId?: string;
  message: string;
  history?: Array<Message>;
  maxTokens?: number;
  approval?: ToolApprovalRequest & { approved: boolean };
}

export function streamTemplateAgentResponse({
  categoryId,
  templateId,
  threadId,
  message,
  history = [],
  maxTokens = 2000,
  approval,
}: StreamTemplateAgentArgs): Promise<Response> {
  const messages = buildPromptAgentMessages(history, message, approval);

  const body: Record<string, unknown> = {
    folder_id: categoryId,
    template_id: templateId || null,
    thread_id:
      threadId ||
      (templateId ? `prompt:${templateId}` : `prompt-folder:${categoryId}`),
    messages,
    max_tokens: maxTokens,
  };
  if (approval) {
    body.resume = {
      id: approval.callId,
      value: {
        accepted: approval.approved,
        function_call_id: approval.callId,
      },
    };
  }

  return streamWithAuth(AGENT_RUNS_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function buildPromptAgentMessages(
  history: Array<Message>,
  message: string,
  approval?: ToolApprovalRequest & { approved: boolean },
): Array<AgUiMessage> {
  const snapshot = latestAgUiSnapshot(history);
  if (approval && !snapshot) {
    throw new Error(
      "Cannot approve a tool call without an AG-UI conversation snapshot",
    );
  }

  const messages: Array<AgUiMessage> = snapshot
    ? addMissingToolResults(snapshot, history, approval)
    : history
        .filter((item) => item.content.trim())
        .map((item) => ({ role: item.role, content: item.content }));

  if (!approval) {
    messages.push({ role: "user", content: message });
  }

  return messages;
}
