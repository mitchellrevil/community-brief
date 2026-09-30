import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { AgentChatMessage, ToolApprovalRequest, ToolInvocation } from '@/shared/agent-chat/types';
import { readAgUiTextStream } from '@/shared/agent-chat/ag-ui-stream';
import { applyToolApprovalDecision, formatToolName, mergeToolInvocation } from '@/shared/agent-chat/tool-invocations';
import { clearChatHistory, getChatHistory, saveChatMessage, streamChatResponse } from '@/features/recordings/data/recording-analysis-chat';

/**
 * Chat message type representing a single message in the conversation
 */
export type ChatMessage = AgentChatMessage;

/**
 * Options for the useRecordingAnalysisChat hook
 */
export interface UseRecordingAnalysisChatOptions {
  jobId: string;
  onAnalysisUpdated?: (analysisText: string) => void;
}

/**
 * Return type for useRecordingAnalysisChat hook
 */
export interface UseRecordingAnalysisChatReturn {
  messages: Array<ChatMessage>;
  input: string;
  setInput: (value: string) => void;
  isLoading: boolean;
  error: string | null;
  activeToolInvocations: Array<ToolInvocation>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
  handleApproveTool: (approval: ToolApprovalRequest) => Promise<void>;
  handleRejectTool: (approval: ToolApprovalRequest) => Promise<void>;
  handleClearHistory: () => Promise<void>;
}

/**
 * Custom hook that encapsulates all chat interface logic.
 * Handles message state, streaming responses, history management.
 */
export function useRecordingAnalysisChat({
  jobId,
  onAnalysisUpdated,
}: UseRecordingAnalysisChatOptions): UseRecordingAnalysisChatReturn {
  const [messages, setMessages] = useState<Array<ChatMessage>>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeToolInvocations, setActiveToolInvocations] = useState<Array<ToolInvocation>>([]);
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
    setActiveToolInvocations([]);

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

      let assistantMessage = '';
      let toolInvocations: Array<ToolInvocation> = [];
      let agUiMessages: Array<Record<string, unknown>> | undefined;
      let lastUpdateTime = Date.now();
      const UPDATE_INTERVAL = 100;
      const toolInvocationValue = () => toolInvocations.length > 0 ? toolInvocations : undefined;
      const assistantMessageValue = (): ChatMessage => ({
        role: 'assistant',
        content: assistantMessage,
        toolInvocations: toolInvocationValue(),
        agUiMessages,
      });
      const showAssistantText = (text: string) => {
        if (!text) return;
        assistantMessage = text;

        const now = Date.now();
        const shouldUpdate = now - lastUpdateTime > UPDATE_INTERVAL || assistantMessage.length % 50 === 0;

        if (shouldUpdate) {
          lastUpdateTime = now;
          setMessages((prev) => {
            const newMsgs = [...prev];
            const lastMsg = newMsgs[newMsgs.length - 1];
            if (lastMsg.role === 'assistant') {
              lastMsg.content = assistantMessage;
              lastMsg.toolInvocations = toolInvocationValue();
              lastMsg.agUiMessages = agUiMessages;
            } else {
              newMsgs.push(assistantMessageValue());
            }
            return newMsgs;
          });
        }
      };

      await readAgUiTextStream(response, {
        onTextDelta: (text) => showAssistantText(text),
        onEvent: (event) => {
          if (event.type === 'ANALYSIS_UPDATED') {
            onAnalysisUpdated?.(event.analysisText || '');
          }
          if (event.type === 'MESSAGES_SNAPSHOT' && Array.isArray(event.messages)) {
            agUiMessages = event.messages;
          }
        },
        onToolInvocation: (invocation) => {
          toolInvocations = mergeToolInvocation(toolInvocations, invocation);
          setActiveToolInvocations(toolInvocations);
        },
        onError: setError,
      });

      if (assistantMessage.length > 0 || toolInvocations.length > 0) {
        setMessages((prev) => {
          const newMsgs = [...prev];
          const lastMsg = newMsgs[newMsgs.length - 1];
          if (lastMsg.role === 'assistant') {
            lastMsg.content = assistantMessage;
            lastMsg.toolInvocations = toolInvocationValue();
            lastMsg.agUiMessages = agUiMessages;
          } else {
            newMsgs.push(assistantMessageValue());
          }
          return newMsgs;
        });

        await saveMessageToHistory('assistant', assistantMessage);
      }

      if (assistantMessage.length === 0 && toolInvocations.length === 0) {
        setError('No response from server');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send message';
      setError(errorMessage);
      toast.error('Chat Error', { description: errorMessage });
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setActiveToolInvocations([]);
      setIsLoading(false);
    }
  }, [input, messages, jobId, saveMessageToHistory, onAnalysisUpdated]);

  const handleToolApproval = useCallback(async (approval: ToolApprovalRequest, approved: boolean) => {
    if (isLoading) {
      return;
    }

    setError(null);
    setActiveToolInvocations([]);
    setIsLoading(true);

    const decidedMessages = applyToolApprovalDecision(messages, approval, approved);
    const userMessage: ChatMessage = {
      role: 'user',
      content: `${approved ? 'Approved' : 'Rejected'} ${formatToolName(approval.name)}`,
    };
    setMessages([...decidedMessages, userMessage]);

    try {
      const response = await streamChatResponse(jobId, '', decidedMessages, 2000, {
        ...approval,
        approved,
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      let assistantMessage = '';
      let toolInvocations: Array<ToolInvocation> = [];
      let agUiMessages: Array<Record<string, unknown>> | undefined;

      await readAgUiTextStream(response, {
        onTextDelta: (text) => {
          assistantMessage = text;
        },
        onEvent: (event) => {
          if (event.type === 'ANALYSIS_UPDATED') {
            onAnalysisUpdated?.(event.analysisText || '');
          }
          if (event.type === 'MESSAGES_SNAPSHOT' && Array.isArray(event.messages)) {
            agUiMessages = event.messages;
          }
        },
        onToolInvocation: (invocation) => {
          toolInvocations = mergeToolInvocation(toolInvocations, invocation);
          setActiveToolInvocations(toolInvocations);
        },
        onError: setError,
      });

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: assistantMessage,
          toolInvocations: toolInvocations.length > 0 ? toolInvocations : undefined,
          agUiMessages,
        },
      ]);
      if (assistantMessage) {
        await saveMessageToHistory('assistant', assistantMessage);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update tool approval';
      setError(errorMessage);
      toast.error('Chat Error', { description: errorMessage });
      setMessages(messages);
    } finally {
      setActiveToolInvocations([]);
      setIsLoading(false);
    }
  }, [isLoading, jobId, messages, onAnalysisUpdated, saveMessageToHistory]);

  return {
    messages,
    input,
    setInput,
    isLoading,
    error,
    activeToolInvocations,
    messagesEndRef,
    handleSubmit,
    handleApproveTool: (approval) => handleToolApproval(approval, true),
    handleRejectTool: (approval) => handleToolApproval(approval, false),
    handleClearHistory,
  };
}
