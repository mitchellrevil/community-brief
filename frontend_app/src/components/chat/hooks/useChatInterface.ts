import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { clearChatHistory, getChatHistory, saveChatMessage, streamChatResponse } from '@/features/recordings/data/api';

/**
 * Chat message type representing a single message in the conversation
 */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Options for the useChatInterface hook
 */
export interface UseChatInterfaceOptions {
  jobId: string;
  onAnalysisUpdated?: (analysisText: string) => void;
}

/**
 * Return type for useChatInterface hook
 */
export interface UseChatInterfaceReturn {
  messages: Array<ChatMessage>;
  input: string;
  setInput: (value: string) => void;
  isLoading: boolean;
  error: string | null;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
  handleClearHistory: () => Promise<void>;
}

/**
 * Custom hook that encapsulates all chat interface logic.
 * Handles message state, streaming responses, history management.
 */
export function useChatInterface({ jobId, onAnalysisUpdated }: UseChatInterfaceOptions): UseChatInterfaceReturn {
  const [messages, setMessages] = useState<Array<ChatMessage>>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load chat history on mount
  useEffect(() => {
    const loadChatHistory = async () => {
      try {
        const data = await getChatHistory(jobId);
        if (data.chat_history && Array.isArray(data.chat_history)) {
          setMessages(data.chat_history);
        }
      } catch (err) {
        console.error('Failed to load chat history:', err);
      }
    };

    loadChatHistory();
  }, [jobId]);

  // Save a message to history
  const saveMessageToHistory = useCallback(
    async (role: 'user' | 'assistant', content: string) => {
      try {
        await saveChatMessage(jobId, role, content);
      } catch (err) {
        console.error('Error saving message:', err);
      }
    },
    [jobId]
  );

  // Clear chat history
  const handleClearHistory = useCallback(async () => {
    if (!window.confirm('Clear all chat history? This action cannot be undone.')) {
      return;
    }

    try {
      setIsLoading(true);
      await clearChatHistory(jobId);
      setMessages([]);
      setError(null);
      toast.success('Chat history cleared');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to clear history';
      setError(errorMessage);
      toast.error('Error', { description: errorMessage });
    } finally {
      setIsLoading(false);
    }
  }, [jobId]);

  // Handle form submission with streaming response
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage = input.trim();
    setInput('');
    setError(null);

    const newMessages: Array<ChatMessage> = [
      ...messages,
      { role: 'user', content: userMessage },
    ];
    setMessages(newMessages);
    
    await saveMessageToHistory('user', userMessage);
    setIsLoading(true);

    try {
      // Send the prior panel messages plus the new user message as AG-UI input.
      const response = await streamChatResponse(jobId, userMessage, messages, 2000);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const body = response.body;
      if (!body) {
        throw new Error('Cannot read response stream');
      }
      const reader = body.getReader();

      const decoder = new TextDecoder();
      let assistantMessage = '';
      let buffer = '';
      let lastUpdateTime = Date.now();
      const UPDATE_INTERVAL = 100;
      const appendAssistantDelta = (delta: string) => {
        if (!delta) return;
        assistantMessage += delta;

        const now = Date.now();
        const shouldUpdate = now - lastUpdateTime > UPDATE_INTERVAL || assistantMessage.length % 50 === 0;

        if (shouldUpdate) {
          lastUpdateTime = now;
          setMessages((prev) => {
            const newMsgs = [...prev];
            const lastMsg = newMsgs[newMsgs.length - 1];
            if (lastMsg.role === 'assistant') {
              lastMsg.content = assistantMessage;
            } else {
              newMsgs.push({ role: 'assistant', content: assistantMessage });
            }
            return newMsgs;
          });
        }
      };

      let isDone = false;
      while (!isDone) {
        const { done, value } = await reader.read();
        if (done) {
          if (assistantMessage.length > 0) {
            setMessages((prev) => {
              const newMsgs = [...prev];
              const lastMsg = newMsgs[newMsgs.length - 1];
              if (lastMsg.role === 'assistant') {
                lastMsg.content = assistantMessage;
              } else {
                newMsgs.push({ role: 'assistant', content: assistantMessage });
              }
              return newMsgs;
            });
            
            await saveMessageToHistory('assistant', assistantMessage);
          }
          isDone = true;
          continue;
        }

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        const lines = buffer.split('\n');
        buffer = lines[lines.length - 1];

        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i].trim();
          
          if (!line || !line.startsWith('data: ')) continue;

          const data = line.slice(6);

          if (data === '[DONE]') break;

          if (data.startsWith('[ERROR]')) {
            setError(data);
            continue;
          }

          try {
            const event = JSON.parse(data);
            if (event.type === 'TEXT_MESSAGE_CONTENT') {
              appendAssistantDelta(event.delta || '');
            } else if (event.type === 'ANALYSIS_UPDATED') {
              onAnalysisUpdated?.(event.analysisText || '');
            } else if (event.type === 'RUN_ERROR') {
              setError(event.message || 'Chat stream failed');
            }
          } catch {
            appendAssistantDelta(data);
          }
        }
      }

      if (assistantMessage.length === 0) {
        setError('No response from server');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send message';
      setError(errorMessage);
      toast.error('Chat Error', { description: errorMessage });
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  }, [input, messages, jobId, saveMessageToHistory, onAnalysisUpdated]);

  return {
    messages,
    input,
    setInput,
    isLoading,
    error,
    messagesEndRef,
    handleSubmit,
    handleClearHistory,
  };
}


