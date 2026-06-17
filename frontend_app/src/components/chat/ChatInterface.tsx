/**
 * Chat Interface Component
 * 
 * A self-contained chat interface that manages message state and user input.
 */

import { useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { ChatMessage } from "./ChatMessage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface ChatInterfaceProps {
  /** Initial messages to display */
  initialMessages?: Array<Message>;
  /** Handler for sending messages - receives user message, returns assistant response */
  onSendMessage: (message: string, history: Array<Message>) => Promise<string>;
  /** Whether the chat is loading */
  isLoading?: boolean;
  /** Title for the chat panel */
  title?: string;
  /** Placeholder text for the input */
  placeholder?: string;
  /** Additional class names */
  className?: string;
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
  isLoading: externalLoading = false,
  title = "Chat",
  placeholder = "Type your message...",
  className,
}: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Array<Message>>(initialMessages);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    setIsLoading(true);

    // Add user message immediately
    const userMessage: Message = { role: "user", content: trimmedInput };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);

    try {
      const response = await onSendMessage(trimmedInput, messages);
      
      // Add assistant response
      const assistantMessage: Message = { role: "assistant", content: response };
      setMessages((prev) => [...prev, assistantMessage]);
      
      scrollToBottom();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to send message";
      setError(errorMessage);
      // Remove the user message on failure
      setMessages(messages);
    } finally {
      setIsLoading(false);
    }
  };

  const loading = isLoading || externalLoading;

  return (
    <Card className={className}>
      <CardHeader className="pb-3 border-b">
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0 flex flex-col h-[400px]">
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
            />
          ))}

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
          className="border-t p-3 flex gap-2"
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
