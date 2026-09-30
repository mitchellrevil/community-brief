import { useEffect, useState } from "react";
import {
  InteractionRequiredAuthError,
  InteractionStatus,
} from "@azure/msal-browser";
import { useMsal } from "@azure/msal-react";

import { microsoftGraphScopes } from "../config/msal";
import { useAuthSession } from "./useAuthSession";

export interface MicrosoftGraphTokenState {
  accessToken: string | null;
  isLoading: boolean;
  error: unknown;
}

export function useMicrosoftGraphToken(
  scopes: Array<string>,
  enabled = true,
): MicrosoftGraphTokenState {
  const { instance, accounts, inProgress } = useMsal();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuthSession();
  const [state, setState] = useState<MicrosoftGraphTokenState>({
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

    void instance
      .acquireTokenSilent({
        scopes,
        account,
      })
      .then((response) => {
        if (!isCancelled) {
          setState({
            accessToken: response.accessToken || null,
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

  return state;
}

export function useMicrosoftAccessToken() {
  return useMicrosoftGraphToken(microsoftGraphScopes).accessToken;
}
