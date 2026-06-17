import { useEffect, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useChatInterface } from '@/components/chat/hooks/useChatInterface';
import { DesktopChatPanel } from '@/components/chat/DesktopChatPanel';
import { MobileChatModal } from '@/components/chat/MobileChatModal';

interface ChatInterfaceProps {
  jobId: string;
  isMobile: boolean;
  isTinyScreen: boolean;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/** Adaptive chat orchestrator - delegates to DesktopChatPanel or MobileChatModal */
export function ChatInterface({ jobId, isMobile, isTinyScreen, isOpen: isOpenProp, onOpenChange }: ChatInterfaceProps) {
  const [isOpen, setIsOpen] = useState<boolean>(isOpenProp ?? false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Sync with controlled prop
  useEffect(() => {
    if (typeof isOpenProp === 'boolean') {
      setIsOpen(isOpenProp);
    }
  }, [isOpenProp]);

  const changeOpen = (open: boolean) => {
    setIsOpen(open);
    onOpenChange?.(open);
  };

  // Reset expanded state when switching to mobile
  useEffect(() => {
    if (!isMobile && isOpen) {
      setIsExpanded(false);
    }
  }, [isMobile, isOpen]);

  // Use shared chat logic hook
  const {
    messages,
    input,
    setInput,
    isLoading,
    error,
    messagesEndRef,
    handleSubmit,
    handleClearHistory,
  } = useChatInterface({ jobId });

  // Hide chat button on mobile - parent controls visibility
  if (!isOpen && isMobile) {
    return null;
  }

  // Closed state: show open button (desktop only)
  if (!isOpen) {
    return (
      <Button
        onClick={() => changeOpen(true)}
        className="fixed bottom-6 right-6 z-50 rounded-full h-14 w-14 sm:h-16 sm:w-16 p-0 shadow-lg"
        size={isTinyScreen ? 'sm' : 'default'}
      >
        <MessageCircle className={`${isTinyScreen ? 'h-5 w-5' : 'h-6 w-6'}`} />
      </Button>
    );
  }

  // Mobile: Full-screen modal
  if (isMobile) {
    return (
      <MobileChatModal
        messages={messages}
        input={input}
        setInput={setInput}
        isLoading={isLoading}
        error={error}
        isTinyScreen={isTinyScreen}
        onClose={() => changeOpen(false)}
        onClearHistory={handleClearHistory}
        onSubmit={handleSubmit}
        messagesEndRef={messagesEndRef}
      />
    );
  }

  // Desktop: Floating card with minimize/maximize
  return (
    <DesktopChatPanel
      messages={messages}
      input={input}
      setInput={setInput}
      isLoading={isLoading}
      error={error}
      isExpanded={isExpanded}
      onToggleExpanded={() => setIsExpanded(!isExpanded)}
      onClose={() => changeOpen(false)}
      onClearHistory={handleClearHistory}
      onSubmit={handleSubmit}
      messagesEndRef={messagesEndRef}
    />
  );
}
