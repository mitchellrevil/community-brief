import { queryOptions } from "@tanstack/react-query";

import { getCurrentAuthUser } from "./api";
import type { AuthSessionState, AuthSessionUser } from "./types";
import { getOfflineUser, rememberOfflineUser } from "@/lib/offline-templates";
import { PermissionLevel } from "@/types/permissions";
import { ApiError } from "@/lib/errors/ApiError";
import { NetworkError } from "@/lib/errors/NetworkError";


interface BackendUser {
  user_id: string;
  email: string;
  permission?: PermissionLevel;
  permission_level?: PermissionLevel;
  transcription_method?: "AZURE_AI_SPEECH" | "GPT4O_AUDIO";
  favourite_prompt_ids?: Array<string>;
  business_unit_id?: string | null;
  business_unit_ids?: Array<string>;
  business_unit_names?: Array<string>;
  auth_source?: "entra" | "password";
}

export const authSessionQueryKey = ["auth", "session"] as const;

export function shouldRetryAuthSession(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  if (error instanceof NetworkError) return !error.isOffline;
  return error instanceof ApiError && [429, 502, 503, 504].includes(error.status);
}

export function normalizeAuthSessionUser(user: BackendUser): AuthSessionUser {
  return {
    ...user,
    permission:
      user.permission || user.permission_level || PermissionLevel.USER,
  };
}

export function getAuthSessionQuery() {
  return queryOptions<AuthSessionState>({
    queryKey: authSessionQueryKey,
    networkMode: "always",
    queryFn: async ({ signal }) => {
      if (!navigator.onLine) {
        const user = getOfflineUser();
        if (user) return user;
        throw new Error("Connect to the internet and sign in before using Community Brief offline.");
      }
      const result = await getCurrentAuthUser();
      const backendUser = unwrapAuthUser(result);
      signal.throwIfAborted();
      const user = normalizeAuthSessionUser(backendUser);
      rememberOfflineUser(user);
      return user;
    },
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: shouldRetryAuthSession,
    retryDelay: (attemptIndex) => 1000 * 2 ** attemptIndex,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    meta: {
      suppressGlobalErrorToast: true,
    },
  });
}

function unwrapAuthUser(result: unknown): BackendUser {
  if (
    result &&
    typeof result === "object" &&
    "data" in result &&
    (result as { data?: unknown }).data
  ) {
    return (result as { data: BackendUser }).data;
  }

  return result as BackendUser;
}
