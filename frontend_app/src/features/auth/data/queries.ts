import { queryOptions } from "@tanstack/react-query";

import { getCurrentAuthUser } from "./api";
import type { AuthSessionState, AuthSessionUser } from "./types";
import { PermissionLevel } from "@/types/permissions";


interface BackendUser {
  user_id: string;
  email: string;
  permission?: PermissionLevel;
  permission_level?: PermissionLevel;
  transcription_method?: "AZURE_AI_SPEECH" | "GPT4O_AUDIO";
  business_unit_id?: string | null;
  business_unit_ids?: Array<string>;
  business_unit_names?: Array<string>;
  auth_source?: "entra" | "password";
}

export const authSessionQueryKey = ["auth", "session"] as const;

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
    queryFn: async () => {
      const result = await getCurrentAuthUser();
      const backendUser = unwrapAuthUser(result);
      return normalizeAuthSessionUser(backendUser);
    },
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: false,
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
