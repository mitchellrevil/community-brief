import type { ToolApprovalRequest } from "@/shared/agent-chat/types";
import { addMissingToolResults, latestAgUiSnapshot } from "@/shared/agent-chat/ag-ui-messages";
import { CHAT_ENDPOINTS } from "@/shared/api/constants";
import { fetchWithAuth, streamWithAuth } from "@/shared/api/client/fetchClient";

export async function getChatHistory(jobId: string): Promise<any> {
  const response = await fetchWithAuth(CHAT_ENDPOINTS.getHistory(jobId), {
    headers: {
      "Content-Type": "application/json",
    },
  });

  return response.json();
}

export function streamChatResponse(
  jobId: string,
  message: string,
  conversationHistory: Array<any> = [],
  maxTokens: number = 2000,
  approval?: ToolApprovalRequest & { approved: boolean },
): Promise<Response> {
  const snapshot = latestAgUiSnapshot(conversationHistory);
  if (approval && !snapshot) {
    throw new Error("Cannot approve a tool call without an AG-UI conversation snapshot");
  }

  const messages = snapshot
    ? addMissingToolResults(snapshot, conversationHistory, approval)
    : conversationHistory
        .filter((item) => item?.role && item?.content)
        .map((item) => ({ role: item.role, content: item.content }));
  if (!approval) {
    messages.push({ role: "user", content: message });
  }
  const body: Record<string, unknown> = {
    thread_id: jobId,
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

  return streamWithAuth(CHAT_ENDPOINTS.streamChat(jobId), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

export async function saveChatMessage(jobId: string, role: "user" | "assistant", content: string): Promise<void> {
  try {
    await fetchWithAuth(CHAT_ENDPOINTS.saveMessage(jobId), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ role, content }),
    });
  } catch (error) {
    console.error("Failed to save message:", error);
  }
}

export async function clearChatHistory(jobId: string): Promise<{ status: string; message: string }> {
  const response = await fetchWithAuth(CHAT_ENDPOINTS.clearHistory(jobId), {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
  });

  return response.json();
}

