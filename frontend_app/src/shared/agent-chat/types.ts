export type AgUiMessage = Record<string, unknown>;

export interface ToolApprovalRequest {
  id: string;
  callId: string;
  name: string;
  arguments: unknown;
}

export interface ToolInvocation {
  id: string;
  name: string;
  status: "running" | "completed" | "approval_required";
  args?: string;
  result?: string;
  approval?: ToolApprovalRequest;
}

export interface AgentChatMessage {
  role: "user" | "assistant";
  content: string;
  toolInvocations?: Array<ToolInvocation>;
  agUiMessages?: Array<AgUiMessage>;
}

