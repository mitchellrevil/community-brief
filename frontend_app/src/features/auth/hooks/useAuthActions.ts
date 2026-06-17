import { useMsal } from "@azure/msal-react";
import { useQueryClient } from "@tanstack/react-query";

import { loginWithCredentials, logoutSession } from "../data/api";
import { authSessionQueryKey, getAuthSessionQuery } from "../data/queries";
import { isMicrosoftAuthConfigured, microsoftLoginRequest } from "../config/msal";
import { clearClientSessionState } from "../lib/auth-storage";
import type { AuthSessionUser } from "../data/types";

interface MicrosoftSignInOptions {
  overrideInteractionInProgress?: boolean;
}

export function useAuthActions() {
  const queryClient = useQueryClient();
  const { instance, inProgress } = useMsal();

  const refreshAuthSession = async (): Promise<AuthSessionUser | null> => {
    queryClient.removeQueries({ queryKey: authSessionQueryKey });

    try {
      return await queryClient.fetchQuery(getAuthSessionQuery());
    } catch {
      return null;
    }
  };

  const signInWithCredentials = async (
    email: string,
    password: string,
  ): Promise<AuthSessionUser> => {
    await loginWithCredentials(email, password);
    const user = await refreshAuthSession();

    if (!user) {
      throw new Error("Login succeeded but the session could not be loaded.");
    }

    return user;
  };

  const signInWithMicrosoft = async (
    options?: MicrosoftSignInOptions,
  ): Promise<AuthSessionUser> => {
    if (!isMicrosoftAuthConfigured) {
      throw new Error("Microsoft sign-in is not configured for this environment.");
    }

    const response = await instance.loginPopup({
      ...microsoftLoginRequest,
      overrideInteractionInProgress: options?.overrideInteractionInProgress,
    });

    instance.setActiveAccount(response.account);

    const user = await refreshAuthSession();
    if (!user) {
      throw new Error("Microsoft sign-in succeeded but the session could not be loaded.");
    }

    return user;
  };

  const signOut = async (): Promise<void> => {
    const account = instance.getActiveAccount() ?? instance.getAllAccounts().at(0) ?? null;

    try {
      await logoutSession();
    } catch {
      // Local sign-out should still complete when the server session is already invalid.
    }

    await queryClient.cancelQueries();

    queryClient.setQueryData(authSessionQueryKey, null);
    queryClient.removeQueries({
      predicate: (query) => query.queryKey[0] !== "auth",
    });

    if (account) {
      await instance.clearCache({ account });
    } else {
      await instance.clearCache();
    }

    instance.setActiveAccount(null);
    await clearClientSessionState();
  };

  return {
    signInWithCredentials,
    signInWithMicrosoft,
    signOut,
    refreshAuthSession,
    msalInProgress: inProgress,
    isMicrosoftConfigured: isMicrosoftAuthConfigured,
  };
}
