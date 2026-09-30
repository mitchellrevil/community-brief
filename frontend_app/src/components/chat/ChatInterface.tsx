/**
 * Chat Interface Component
 * 
 * A self-contained chat interface that manages message state and user input.
 */

import { useRef, useState } from "react";
import { Loader2, Send, Trash2 } from "lucide-react";
import { ChatMessage } from "./ChatMessage";
import { ToolInvocationBubble } from "./ToolInvocation";
import type { AgUiMessage, ToolApprovalRequest, ToolInvocation } from "@/shared/agent-chat/types";
import { applyToolApprovalDecision, formatToolName, mergeToolInvocation } from "@/shared/agent-chat/tool-invocations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface Message {
  role: "user" | "assistant";
  content: string;
  toolInvocations?: Array<ToolInvocation>;
  agUiMessages?: Array<AgUiMessage>;
}

export interface ChatSendContext {
  updateToolInvocation: (invocation: ToolInvocation) => void;
  updateAgUiMessages: (messages: Array<AgUiMessage>) => void;
}

export interface ChatInterfaceProps {
  /** Initial messages to display */
  initialMessages?: Array<Message>;
  /** Handler for sending messages - receives user message, returns assistant response */
  onSendMessage: (message: string, history: Array<Message>, context?: ChatSendContext) => Promise<string>;
  onApproveTool?: (
    approval: ToolApprovalRequest,
    approved: boolean,
    history: Array<Message>,
    context?: ChatSendContext,
  ) => Promise<string>;
  /** Whether the chat is loading */
  isLoading?: boolean;
  /** Title for the chat panel */
  title?: string;
  /** Placeholder text for the input */
  placeholder?: string;
  /** Additional class names */
  className?: string;
  /** Render without Card chrome for embedding inside an existing panel */
  frameless?: boolean;
}

/**
 * ChatInterface - Complete chat UI with message history and input handling.
 * 
 * @example
 * ```tsx
 * <ChatInterface 
 *   onSendMessage={async (msg) => {
 *     const response = await chatApi.send(msg);
 *     return response.content;
 *   }}
 *   title="Chat Assistant"
 * />
 * ```
 */
export function ChatInterface({
  initialMessages = [],
  onSendMessage,
  onApproveTool,
  isLoading: externalLoading = false,
  title = "Chat",
  placeholder = "Type your message...",
  className,
  frameless = false,
}: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Array<Message>>(initialMessages);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeToolInvocations, setActiveToolInvocations] = useState<Array<ToolInvocation>>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    // Check if scrollIntoView exists (not available in jsdom)
    if (messagesEndRef.current?.scrollIntoView) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const trimmedInput = input.trim();
    if (!trimmedInput) return;

    setInput("");
    setError(null);
    setActiveToolInvocations([]);
    setIsLoading(true);

    // Add user message immediately
    const userMessage: Message = { role: "user", content: trimmedInput };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);

    try {
      let toolInvocations: Array<ToolInvocation> = [];
      let agUiMessages: Array<AgUiMessage> | undefined;
      const response = await onSendMessage(trimmedInput, messages, {
        updateToolInvocation: (invocation) => {
          toolInvocations = mergeToolInvocation(toolInvocations, invocation);
          setActiveToolInvocations(toolInvocations);
        },
        updateAgUiMessages: (nextMessages) => {
          agUiMessages = nextMessages;
        },
      });
      
      // Add assistant response
      const assistantMessage: Message = {
        role: "assistant",
        content: response,
        toolInvocations: toolInvocations.length > 0 ? toolInvocations : undefined,
        agUiMessages,
      };
      setMessages((prev) => [...prev, assistantMessage]);
      
      scrollToBottom();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to send message";
      setError(errorMessage);
      // Remove the user message on failure
      setMessages(messages);
    } finally {
      setActiveToolInvocations([]);
      setIsLoading(false);
    }
  };

  const handleToolApproval = async (approval: ToolApprovalRequest, approved: boolean) => {
    if (!onApproveTool || loading) {
      return;
    }

    setError(null);
    setActiveToolInvocations([]);
    setIsLoading(true);

    const userMessage: Message = {
      role: "user",
      content: `${approved ? "Approved" : "Rejected"} ${formatToolName(approval.name)}`,
    };
    const decidedMessages = applyToolApprovalDecision(messages, approval, approved);
    setMessages([...decidedMessages, userMessage]);

    try {
      let toolInvocations: Array<ToolInvocation> = [];
      let agUiMessages: Array<AgUiMessage> | undefined;
      const response = await onApproveTool(approval, approved, decidedMessages, {
        updateToolInvocation: (invocation) => {
          toolInvocations = mergeToolInvocation(toolInvocations, invocation);
          setActiveToolInvocations(toolInvocations);
        },
        updateAgUiMessages: (nextMessages) => {
          agUiMessages = nextMessages;
        },
      });

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: response,
          toolInvocations: toolInvocations.length > 0 ? toolInvocations : undefined,
          agUiMessages,
        },
      ]);
      scrollToBottom();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to update tool approval";
      setError(errorMessage);
      setMessages(messages);
    } finally {
      setActiveToolInvocations([]);
      setIsLoading(false);
    }
  };

  const loading = isLoading || externalLoading;
  const handleClearChat = () => {
    setMessages(initialMessages);
    setInput("");
    setError(null);
    setActiveToolInvocations([]);
  };

  return (
    <Card className={`flex min-h-0 flex-col ${frameless ? "rounded-none border-0 shadow-none" : ""} ${className || "h-[480px]"}`}>
      {frameless ? (
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleClearChat}
            disabled={loading || messages.length === initialMessages.length}
            aria-label="Clear chat"
            title="Clear chat"
            className="h-8 w-8"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      ) : (
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-lg">{title}</CardTitle>
        </CardHeader>
      )}
      <CardContent className="p-0 flex min-h-0 flex-1 flex-col">
        {/* Messages area */}
        <div 
          className="flex-1 overflow-y-auto p-4 space-y-4"
          role="log"
          aria-live="polite"
          aria-label="Chat messages"
        >
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <p data-testid="empty-chat">No messages yet. Start a conversation!</p>
            </div>
          )}

          {messages.map((message, idx) => (
            <ChatMessage 
              key={idx} 
              role={message.role} 
              content={message.content} 
              toolInvocations={message.toolInvocations}
              onApproveTool={(approval) => void handleToolApproval(approval, true)}
              onRejectTool={(approval) => void handleToolApproval(approval, false)}
              toolActionsDisabled={loading}
            />
          ))}

          <ToolInvocationBubble invocations={activeToolInvocations} disabled={loading} />

          {loading && (
            <div className="flex justify-start" data-testid="loading-indicator">
              <div className="bg-secondary rounded-lg p-3 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span className="text-sm">Thinking...</span>
              </div>
            </div>
          )}

          {error && (
            <div 
              className="bg-destructive/10 text-destructive rounded-lg p-3 text-sm"
              role="alert"
              data-testid="error-message"
            >
              {error}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input form */}
        <form 
          onSubmit={handleSubmit} 
          className="border-t p-3 flex flex-shrink-0 gap-2"
          aria-label="Send a message"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={placeholder}
            disabled={loading}
            className="flex-1"
            aria-label="Message input"
            data-testid="chat-input"
          />
          <Button 
            type="submit" 
            disabled={loading || !input.trim()}
            aria-label="Send message"
            data-testid="send-button"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="h-4 w-4" aria-hidden="true" />
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default ChatInterface;
