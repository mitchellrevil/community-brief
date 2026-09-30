import { useRef } from "react";
import { X } from "lucide-react";
import { streamTemplateAgentResponse } from "../data/prompt-agent";
import type { ChatSendContext, Message } from "@/components/chat/ChatInterface";
import type { ToolApprovalRequest } from "@/shared/agent-chat/types";
import type { Category, Prompt } from "../state/types";
import { ChatInterface } from "@/components/chat/ChatInterface";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { readAgUiTextStream } from "@/shared/agent-chat/ag-ui-stream";


export type PromptAgentScope =
  | { mode: "create"; category: Category }
  | { mode: "edit"; category: Category; prompt: Prompt };

interface PromptAgentPanelProps {
  scope: PromptAgentScope | null;
  onClose?: () => void;
  onPromptChanged: (prompt: Prompt) => void;
  compact?: boolean;
}

export function PromptAgentPanel({
  scope,
  onClose,
  onPromptChanged,
  compact = false,
}: PromptAgentPanelProps) {
  const sessionSequence = useRef(0);
  const session = useRef<{
    categoryId: string;
    promptId: string | null;
    key: string;
    threadId: string;
  } | null>(null);

  if (!scope) {
    session.current = null;
    return (
      <div className="bg-background flex h-full flex-col">
        <div className="border-b px-4 py-4">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold tracking-tight">Assistant</h2>
            <Badge variant="secondary" className="text-[10px] font-normal">
              Beta
            </Badge>
          </div>
        </div>
        <div className="text-muted-foreground flex flex-1 items-center justify-center px-6 text-center text-sm">
          Select a template to ask the assistant about it, or choose a folder to
          generate one.
        </div>
      </div>
    );
  }

  const prompt = scope.mode === "edit" ? scope.prompt : null;
  const promptId = prompt?.id || null;
  if (
    !session.current ||
    session.current.categoryId !== scope.category.id ||
    session.current.promptId !== promptId
  ) {
    sessionSequence.current += 1;
    const key = `${scope.category.id}:${promptId || "new"}:${sessionSequence.current}`;
    session.current = {
      categoryId: scope.category.id,
      promptId,
      key,
      threadId: `prompt-agent:${key}`,
    };
  }
  const activeSession = session.current;

  const handlePromptChanged = (changedPrompt: Prompt) => {
    if (session.current) {
      session.current.promptId = changedPrompt.id;
    }
    onPromptChanged(changedPrompt);
  };
  const initialMessages: Array<Message> = [
    {
      role: "assistant",
      content:
        scope.mode === "edit"
          ? `I can help revise "${scope.prompt.name}" in ${scope.category.name}. Tell me what works, what does not, what sections should change, and whether the pre-session form or in-session talking points need updates with reasons for each.`
          : `I can help create a template in ${scope.category.name}. Tell me the meeting type, useful sections, what you like or dislike in existing templates, and whether you need pre-session form fields or in-session talking points with reasons for each.`,
    },
  ];

  const handleSendMessage = async (
    message: string,
    history: Array<Message>,
    context?: ChatSendContext,
  ) => {
    const response = await streamTemplateAgentResponse({
      categoryId: scope.category.id,
      templateId: prompt?.id,
      threadId: activeSession.threadId,
      message,
      history,
    });

    const { text, needsApproval } = await readPromptAgentStream(
      response,
      context,
      handlePromptChanged,
    );

    return text || (needsApproval ? "" : "Done.");
  };

  const handleApproveTool = async (
    approval: ToolApprovalRequest,
    approved: boolean,
    history: Array<Message>,
    context?: ChatSendContext,
  ) => {
    const response = await streamTemplateAgentResponse({
      categoryId: scope.category.id,
      templateId: prompt?.id,
      threadId: activeSession.threadId,
      message: "",
      history,
      approval: {
        ...approval,
        approved,
      },
    });

    const { text, needsApproval } = await readPromptAgentStream(
      response,
      context,
      handlePromptChanged,
    );

    return text || (needsApproval ? "" : approved ? "Approved." : "Rejected.");
  };

  return (
    <div className="bg-background flex h-full flex-col">
      {!compact && (
        <div className="flex items-center justify-between border-b px-4 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-xl font-semibold tracking-tight">
                {scope.mode === "edit" ? "Assistant" : "Generate Template"}
              </h2>
            </div>
            <div className="text-muted-foreground mt-1 flex items-center gap-2 text-sm">
              <Badge variant="secondary" className="font-normal">
                {scope.category.name}
              </Badge>
              {prompt && <span className="truncate">{prompt.name}</span>}
            </div>
          </div>
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Close template assistant"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-hidden">
        <ChatInterface
          key={activeSession.key}
          initialMessages={initialMessages}
          onSendMessage={handleSendMessage}
          onApproveTool={handleApproveTool}
          title="Assistant"
          placeholder="Describe the template you need..."
          className="h-full"
          frameless={compact}
        />
      </div>
    </div>
  );
}

async function readPromptAgentStream(
  response: Response,
  context: ChatSendContext | undefined,
  onPromptChanged: (prompt: Prompt) => void,
): Promise<{ text: string; needsApproval: boolean }> {
  const streamErrors: Array<string> = [];
  let needsApproval = false;
  const text = await readAgUiTextStream(response, {
    onEvent: (event) => {
      if (event.type === "PROMPT_CHANGED" && event.prompt) {
        onPromptChanged(event.prompt);
      }
      if (event.type === "MESSAGES_SNAPSHOT" && Array.isArray(event.messages)) {
        context?.updateAgUiMessages(event.messages);
      }
      if (
        event.type === "CUSTOM" &&
        event.name === "function_approval_request"
      ) {
        needsApproval = true;
      }
    },
    onToolInvocation: context?.updateToolInvocation,
    onError: (error) => {
      streamErrors.push(error);
    },
  });

  if (streamErrors.length > 0) {
    throw new Error(streamErrors[0]);
  }
  return { text, needsApproval };
}
