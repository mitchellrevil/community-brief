import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import type { UseMutationOptions } from "@tanstack/react-query";
import { queryClient } from "@/app/providers/query-client";

/**
 * Configuration for optimistic cache updates.
 */
interface OptimisticUpdateConfig<TData> {
  /** Query key to update optimistically */
  queryKey: Array<string>;
  /** Function to compute new cache state from old data and mutation variables */
  updateFn: (oldData: Array<TData> | undefined, newData: any) => Array<TData>;
  /** Success toast message (optional) */
  successMessage?: string;
  /** Side effect to run on optimistic update (e.g., close dialog) */
  onMutateSideEffect?: () => void;
}

/**
 * Full configuration for optimistic mutations.
 * @template TData - Type of the data being mutated
 * @template TVariables - Type of the mutation input variables
 * @template TError - Type of error (defaults to Error)
 */
interface OptimisticMutationConfig<TData, TVariables, TError = Error>
  extends OptimisticUpdateConfig<TData> {
  /** The mutation function to call */
  mutationFn: (variables: TVariables) => Promise<TData>;
  /** Additional mutation options */
  options?: Omit<
    UseMutationOptions<
      TData,
      TError,
      TVariables,
      { previousData: Array<TData> | undefined }
    >,
    "mutationFn" | "onMutate" | "onError" | "onSuccess" | "onSettled"
  >;
}

/**
 * Hook for creating optimistic mutations with automatic cache management.
 *
 * Provides instant UI feedback by updating the cache before the server responds,
 * then automatically rolling back on error. Ideal for creating snappy, responsive
 * user experiences.
 *
 * @description Wraps TanStack Query's useMutation with built-in optimistic update
 * logic, error rollback, and success notifications. Handles cache invalidation
 * and side effects automatically.
 *
 * @template TData - Type of the data being mutated
 * @template TVariables - Type of the mutation input variables
 * @template TError - Type of error (defaults to Error)
 *
 * @param {OptimisticMutationConfig<TData, TVariables, TError>} config - Mutation configuration
 *
 * @returns TanStack Query mutation result with optimistic context
 *
 * @throws {ApiError} When the API request fails (after rollback)
 * @throws {NetworkError} When the network is unavailable
 *
 * @example
 * ```tsx
 * import { useOptimisticMutation } from '@/hooks/useOptimisticMutation';
 * import { deleteRecording } from '@/features/recordings/data/api';
 *
 * function RecordingsList() {
 *   const deleteMutation = useOptimisticMutation({
 *     mutationFn: (id: string) => deleteRecording(id),
 *     queryKey: ['recordings'],
 *     updateFn: (old, deletedId) =>
 *       (old ?? []).filter((r) => r.id !== deletedId),
 *     successMessage: 'Recording deleted',
 *     onMutateSideEffect: () => setDeleteModal(false),
 *   });
 *
 *   return (
 *     <button
 *       onClick={() => deleteMutation.mutate(recordingId)}
 *       disabled={deleteMutation.isPending}
 *     >
 *       Delete
 *     </button>
 *   );
 * }
 * ```
 *
 * @see {@link useMutation} from TanStack Query for the underlying implementation
 * @see {@link ApiError} for error handling
 */
export function useOptimisticMutation<TData, TVariables, TError = Error>({
  mutationFn,
  queryKey,
  updateFn,
  successMessage,
  onMutateSideEffect,
  options,
}: OptimisticMutationConfig<TData, TVariables, TError>) {
  return useMutation({
    mutationFn,
    onMutate: async (newData) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey });

      // Snapshot the previous value
      const previousData = queryClient.getQueryData<Array<TData>>(queryKey);

      // Optimistically update
      queryClient.setQueryData<Array<TData>>(queryKey, (old) =>
        updateFn(old, newData),
      );

      // Run side effects, like resetting the form or closing the dialog
      onMutateSideEffect?.();

      return { previousData };
    },
    onError: (_error, _newData, context) => {
      // Rollback on error
      queryClient.setQueryData(queryKey, context?.previousData);
    },
    onSuccess: () => {
      if (successMessage) {
        toast.success("Success", {
          description: successMessage,
        });
      }
    },
    ...options,
  });
}


