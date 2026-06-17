import { memo, useMemo } from 'react';

/**
 * Props for the ChatMessage component
 */
export interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Renders markdown text to HTML.
 * Pure function used by memoized chat rendering.
 */
export function renderMarkdownText(text: string): string {
  let processed = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
  
  processed = processed
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.*?)__/g, '<strong>$1</strong>')
    .replace(/\*([^*]+?)\*/g, '<em>$1</em>')
    .replace(/_([^_]+?)_/g, '<em>$1</em>')
    .replace(/\n/g, '<br />');
  
  return processed;
}

/**
 * Memoized chat message component.
 * Renders user or assistant messages with markdown support for assistant messages.
 * Uses React.memo to prevent re-renders when sibling messages change.
 */
export const ChatMessage = memo(function ChatMessageView({ role, content }: ChatMessageProps) {
  // Memoize the markdown rendering for assistant messages
  const renderedContent = useMemo(() => {
    if (role === 'assistant') {
      return renderMarkdownText(content);
    }
    return null;
  }, [role, content]);

  return (
    <div className={`flex ${role === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-lg p-3 ${
          role === 'user'
            ? 'bg-primary text-primary-foreground'
            : 'bg-secondary text-secondary-foreground border border-border'
        }`}
      >
        {role === 'assistant' ? (
          <div 
            className="text-sm space-y-2"
            dangerouslySetInnerHTML={{ __html: renderedContent! }}
          />
        ) : (
          <p className="text-sm whitespace-pre-wrap break-words">{content}</p>
        )}
      </div>
    </div>
  );
});
