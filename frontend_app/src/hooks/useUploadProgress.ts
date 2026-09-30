/**
 * Undo Manager Hook
 *
 * Manages operations that can be undone within a time window.
 * Supports optimistic UI updates and delayed API calls for
 * implementing "Undo" toast patterns.
 */

import { useCallback, useRef } from "react";

/**
 * Configuration for a single undoable operation.
 * @template T - Type of the operation result
 */
export interface UndoOperation<T = any> {
  /** Unique identifier for the operation */
  id: string;
  /** Function to execute if not undone (the actual API call) */
  execute: () => Promise<T>;
  /** Function to revert optimistic updates on undo or error */
  revert?: () => void;
  /** Timeout in milliseconds before auto-execution (default: 10000) */
  timeout?: number;
  /** Callback when operation is executed successfully */
  onExecute?: (result: T) => void;
  /** Callback when operation is undone by user */
  onUndo?: () => void;
  /** Callback on execution error */
  onError?: (error: any) => void;
}

/**
 * Options for the undo manager hook.
 */
export interface UndoManagerOptions {
  /** Default timeout for operations in milliseconds (default: 10000) */
  defaultTimeout?: number;
}

/**
 * Hook for managing undoable operations with delayed execution.
 *
 * Enables "Undo" patterns where an action appears immediate but can be
 * cancelled within a time window. Perfect for delete confirmations,
 * form submissions, or any action users might want to reverse.
 *
 * @description Registers operations that execute after a timeout unless
 * cancelled. Supports optimistic UI updates that are reverted on undo.
 * Multiple operations can be tracked simultaneously.
 *
 * @param {UndoManagerOptions} [options] - Configuration options
 *
 * @returns Undo manager controls
 * @returns {Function} registerOperation - Register a new undoable operation
 * @returns {Function} cancelOperation - Cancel a specific operation by ID
 * @returns {Function} cancelAll - Cancel all pending operations
 * @returns {Function} isPending - Check if an operation is pending
 *
 * @example
 * ```tsx
 * import { useUndoManager } from '@/hooks/useUndoManager';
 * import { toast } from 'sonner';
 *
 * function RecordingCard({ recording }: { recording: Recording }) {
 *   const { registerOperation } = useUndoManager({ defaultTimeout: 5000 });
 *   const [isDeleted, setIsDeleted] = useState(false);
 *
 *   const handleDelete = () => {
 *     // Optimistically hide the card
 *     setIsDeleted(true);
 *
 *     const undo = registerOperation({
 *       id: `delete-${recording.id}`,
 *       execute: () => deleteRecording(recording.id),
 *       revert: () => setIsDeleted(false),
 *       onUndo: () => toast.success('Delete cancelled'),
 *     });
 *
 *     toast.info('Recording deleted', {
 *       action: {
 *         label: 'Undo',
 *         onClick: undo,
 *       },
 *     });
 *   };
 *
 *   if (isDeleted) return null;
 *   return <Card>{recording.name}</Card>;
 * }
 * ```
 *
 * @see {@link UndoOperation} for operation configuration
 * @see {@link useOptimisticMutation} for simpler optimistic updates without undo
 */
export function useUndoManager(options: UndoManagerOptions = {}) {
  const { defaultTimeout = 10000 } = options;
  const pendingOperations = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const operations = useRef<Map<string, UndoOperation>>(new Map());

  /**
   * Register an operation that can be undone
   * Returns an undo function
   */
  const registerOperation = useCallback(
    <T = any>(operation: UndoOperation<T>): (() => void) => {
      const { id, execute, revert, timeout = defaultTimeout, onExecute, onUndo, onError } = operation;

      operations.current.set(id, operation);

      // Set up auto-execution after timeout
      const timer = setTimeout(async () => {
        try {
          const result = await execute();
          if (onExecute) {
            onExecute(result);
          }
        } catch (error) {
          console.error(`Failed to execute operation ${id}:`, error);
          if (onError) {
            onError(error);
          }
          // Revert on error
          if (revert) {
            revert();
          }
        } finally {
          // Cleanup
          pendingOperations.current.delete(id);
          operations.current.delete(id);
        }
      }, timeout);

      pendingOperations.current.set(id, timer);

      return () => {
        const pendingTimer = pendingOperations.current.get(id);
        if (pendingTimer) {
          clearTimeout(pendingTimer);
          pendingOperations.current.delete(id);
        }

        const op = operations.current.get(id);
        if (op?.revert) {
          op.revert();
        }

        operations.current.delete(id);

        if (onUndo) {
          onUndo();
        }
      };
    },
    [defaultTimeout]
  );

  /**
   * Cancel a specific operation by ID
   */
  const cancelOperation = useCallback((id: string) => {
    const timer = pendingOperations.current.get(id);
    if (timer) {
      clearTimeout(timer);
      pendingOperations.current.delete(id);
    }

    const operation = operations.current.get(id);
    if (operation?.revert) {
      operation.revert();
    }

    operations.current.delete(id);
  }, []);

  /**
   * Cancel all pending operations
   */
  const cancelAll = useCallback(() => {
    pendingOperations.current.forEach((timer) => clearTimeout(timer));
    pendingOperations.current.clear();
    
    operations.current.forEach((operation) => {
      if (operation.revert) {
        operation.revert();
      }
    });
    operations.current.clear();
  }, []);

  /**
   * Check if an operation is pending
   */
  const isPending = useCallback((id: string) => {
    return pendingOperations.current.has(id);
  }, []);

  return {
    registerOperation,
    cancelOperation,
    cancelAll,
    isPending,
  };
}
