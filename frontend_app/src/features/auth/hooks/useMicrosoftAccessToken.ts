import {
  InteractionRequiredAuthError,
  InteractionStatus,
} from "@azure/msal-browser";
import { useMsal } from "@azure/msal-react";
import { useEffect, useState } from "react";

import { microsoftGraphTokenRequest } from "../config/msal";
import { useAuthSession } from "./useAuthSession";

export function useMicrosoftAccessToken() {
  const { instance, accounts, inProgress } = useMsal();
  const { isAuthenticated } = useAuthSession();
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || inProgress !== InteractionStatus.None) {
      setAccessToken(null);
      return;
    }

    const account = instance.getActiveAccount() ?? accounts.at(0) ?? null;
    if (!account) {
      setAccessToken(null);
      return;
    }

    if (!instance.getActiveAccount()) {
      instance.setActiveAccount(account);
    }

    let isCancelled = false;

    void instance
      .acquireTokenSilent({
        ...microsoftGraphTokenRequest,
        account,
      })
      .then((response) => {
        if (!isCancelled) {
          setAccessToken(response.accessToken || null);
        }
      })
      .catch((error) => {
        if (!isCancelled) {
          if (error instanceof InteractionRequiredAuthError) {
            setAccessToken(null);
            return;
          }

          setAccessToken(null);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [accounts, inProgress, instance, isAuthenticated]);

  return accessToken;
}