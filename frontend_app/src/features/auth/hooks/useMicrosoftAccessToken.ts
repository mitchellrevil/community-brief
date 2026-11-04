import { useCallback, useEffect, useState } from "react";
import {
  InteractionRequiredAuthError,
  InteractionStatus,
} from "@azure/msal-browser";
import { useMsal } from "@azure/msal-react";

import { microsoftGraphScopes } from "../config/msal";
import { acquireGraphToken } from "../lib/graph-token";
import { useAuthSession } from "./useAuthSession";
import type { GraphTokenProvider } from "@/shared/api/graph-client";
import { MicrosoftGraphError } from "@/shared/api/graph-client";

export interface MicrosoftGraphTokenState {
  accessToken: string | null;
  isLoading: boolean;
  error: unknown;
  getAccessToken: GraphTokenProvider;
}

export function useMicrosoftGraphToken(
  scopes: Array<string>,
  enabled = true,
): MicrosoftGraphTokenState {
  const { instance, accounts, inProgress } = useMsal();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuthSession();
  const [state, setState] = useState<
    Omit<MicrosoftGraphTokenState, "getAccessToken">
  >({
    accessToken: null,
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    if (!enabled) {
      setState({ accessToken: null, isLoading: false, error: null });
      return;
    }
    if (isAuthLoading || inProgress !== InteractionStatus.None) {
      setState({ accessToken: null, isLoading: true, error: null });
      return;
    }

    if (!isAuthenticated) {
      setState({ accessToken: null, isLoading: false, error: null });
      return;
    }

    const account = instance.getActiveAccount() ?? accounts.at(0) ?? null;
    if (!account) {
      setState({ accessToken: null, isLoading: false, error: null });
      return;
    }

    if (!instance.getActiveAccount()) {
      instance.setActiveAccount(account);
    }

    let isCancelled = false;
    setState({ accessToken: null, isLoading: true, error: null });

    void acquireGraphToken(instance, account, scopes)
      .then((accessToken) => {
        if (!isCancelled) {
          setState({
            accessToken,
            isLoading: false,
            error: null,
          });
        }
      })
      .catch((error) => {
        if (!isCancelled) {
          setState({
            accessToken: null,
            isLoading: false,
            error:
              error instanceof InteractionRequiredAuthError
                ? new Error("Microsoft Graph consent is required.")
                : error,
          });
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [
    accounts,
    inProgress,
    instance,
    isAuthenticated,
    isAuthLoading,
    scopes,
    enabled,
  ]);

  const getAccessToken = useCallback<GraphTokenProvider>(
    async (options) => {
      const account = instance.getActiveAccount() ?? accounts.at(0);
      if (!enabled || !isAuthenticated || !account) {
        throw new MicrosoftGraphError(
          "Sign in with your Microsoft work account to reconnect Teams.",
          "GraphAuthenticationFailed",
          401,
        );
      }
      try {
        return await acquireGraphToken(
          instance,
          account,
          scopes,
          options?.forceRefresh,
        );
      } catch (error) {
        if (error instanceof InteractionRequiredAuthError) {
          throw new MicrosoftGraphError(
            "Sign in with Microsoft again to grant Teams access.",
            "GraphAuthenticationFailed",
            401,
          );
        }
        throw error;
      }
    },
    [accounts, enabled, instance, isAuthenticated, scopes],
  );

  return { ...state, getAccessToken };
}

export function useMicrosoftAccessToken() {
  return useMicrosoftGraphToken(microsoftGraphScopes).accessToken;
}
