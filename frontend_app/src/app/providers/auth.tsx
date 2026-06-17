import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { authSessionQueryKey } from "@/features/auth/data/queries";
import { subscribeToAuthSessionInvalidated } from "@/features/auth/lib/auth-events";
import { clearClientSessionState } from "@/features/auth/lib/auth-storage";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();

  useEffect(() => {
    return subscribeToAuthSessionInvalidated(() => {
      void queryClient.cancelQueries();
      void clearClientSessionState();
      queryClient.removeQueries({
        predicate: (query) => query.queryKey[0] !== "auth",
      });
      queryClient.setQueryData(authSessionQueryKey, null);
    });
  }, [queryClient]);

  return <>{children}</>;
}