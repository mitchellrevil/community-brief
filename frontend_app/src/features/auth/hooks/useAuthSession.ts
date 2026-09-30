import { useQuery } from "@tanstack/react-query";


import { getAuthSessionQuery } from "../data/queries";
import type { AuthSessionState, AuthStatus } from "../data/types";
import { ApiError } from "@/lib/errors";

export function isUnauthenticatedError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

export function useAuthSession() {
  const query = useQuery<AuthSessionState>({
    ...getAuthSessionQuery(),
  });

  let status: AuthStatus = "loading";
  if (query.isPending) {
    status = "loading";
  } else if (query.data) {
    status = "authenticated";
  } else if (query.error && isUnauthenticatedError(query.error)) {
    status = "unauthenticated";
  } else if (query.error) {
    status = "error";
  } else {
    status = "unauthenticated";
  }

  return {
    ...query,
    status,
    user: query.data ?? null,
    isAuthenticated: status === "authenticated",
    isLoading: status === "loading",
  };
}