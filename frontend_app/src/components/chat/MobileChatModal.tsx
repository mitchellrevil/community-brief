import { memo, useCallback } from 'react';
import { AlertCircle, Loader2, MessageCircle, Send, X } from 'lucide-react';
import { ChatMessage } from './ChatMessage';
import type { ChatMessage as ChatMessageType } from './hooks/useChatInterface';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * Props for MobileChatModal component
 */
export interface MobileChatModalProps {
  messages: Array<ChatMessageType>;
  input: string;
  setInput: (value: string) => void;
  isLoading: boolean;
  error: string | null;
  isTinyScreen: boolean;
  onClose: () => void;
  onClearHistory: () => void;
  onSubmit: (e: React.FormEvent) => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Mobile-specific chat modal component.
 * Renders a full-screen modal for mobile devices.
 * Memoized to prevent unnecessary re-renders.
 */
export const MobileChatModal = memo(function MobileChatModalView({
  messages,
  input,
  setInput,
  isLoading,
  error,
  isTinyScreen,
  onClose,
  onClearHistory,
  onSubmit,
  messagesEndRef,
}: MobileChatModalProps) {
  // Handle Escape key to close modal
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  return (
    <div 
      className="fixed inset-0 z-50 bg-background flex flex-col" 
      role="dialog" 
      aria-modal="true" 
      aria-labelledby="mobile-chat-title"
      onKeyDown={handleKeyDown}
    >
      <div className="flex items-center justify-between p-4 border-b">
        <h2 id="mobile-chat-title" className={`${isTinyScreen ? 'text-base' : 'text-lg'} font-semibold flex items-center gap-2`}>
          <MessageCircle className={`${isTinyScreen ? 'h-4 w-4' : 'h-5 w-5'}`} aria-hidden="true" />
          Chat Assistant
        </h2>
        <div className="flex items-center gap-1">
          <Button onClick={onClearHistory} variant="ghost" size="sm" title="Clear chat history" aria-label="Clear chat history">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
          </Button>
          <Button onClick={onClose} variant="ghost" size="sm" aria-label="Close chat">
            <X className="h-5 w-5" aria-hidden="true" />
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto space-y-4 p-4" role="log" aria-live="polite" aria-label="Chat messages">
        {messages.length === 0 && !error && (
          <div className="flex items-center justify-center h-full text-center text-muted-foreground">
            <p>No messages yet. Start a conversation!</p>
          </div>
        )}

        {error && (
          <div className="flex gap-3 p-4 bg-destructive/10 rounded-lg border border-destructive/20" role="alert">
            <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div className="flex-1">
              <p className="font-medium text-sm text-destructive">Error</p>
              <p className="text-sm text-destructive/80">{error}</p>
            </div>
          </div>
        )}

        {messages.map((message, idx) => (
          <ChatMessage key={idx} role={message.role} content={message.content} />
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-secondary text-secondary-foreground border border-border rounded-lg p-3 flex gap-2 items-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Thinking...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={onSubmit} className="border-t p-3 bg-background flex-shrink-0">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about this recording..."
            disabled={isLoading}
            className="flex-1"
            aria-label="Chat message input"
          />
          <Button type="submit" disabled={isLoading || !input.trim()} className="shrink-0" aria-label={isLoading ? "Sending message" : "Send message"}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
          </Button>
        </div>
      </form>
    </div>
  );
});
