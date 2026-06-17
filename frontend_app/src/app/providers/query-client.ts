import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { normalizeError } from "@/lib/errors";

function shouldSuppressGlobalErrorToast(meta: unknown): boolean {
  return Boolean((meta as { suppressGlobalErrorToast?: boolean } | undefined)?.suppressGlobalErrorToast);
}

function onError(error: Error) {
  if (typeof error.message === "string") {
    try {
      const parsed = JSON.parse(error.message);
      if (parsed.body) {
        error.message =
          typeof parsed.body === "string"
            ? parsed.body
            : (parsed.body?.result?.message ??
              parsed.body?.issues
                ?.map((m: any) => m?.message)
                .filter(Boolean)
                .join(", ") ??
              parsed.body?.message ??
              parsed.message ??
              error.message);
      }
    } catch (_e) {
      // Intentionally ignore JSON parse errors.
    }
  }
  toast.error("An error occurred", {
    description: normalizeError(error).userMessage,
  });
}

export const queryClient: QueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnReconnect: () => !queryClient.isMutating(),
      staleTime: 30 * 1000,
      gcTime: 5 * 60 * 1000,
      retry: (failureCount, error: any) => {
        if (error?.response?.status >= 400 && error?.response?.status < 500) {
          return false;
        }
        return failureCount < 2;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
  },
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (shouldSuppressGlobalErrorToast(query.meta)) {
        return;
      }

      onError(error);
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (shouldSuppressGlobalErrorToast(mutation.options.meta)) {
        return;
      }

      onError(error);
    },
    // Removed global invalidation - mutations now handle invalidation explicitly.
  }),
});
