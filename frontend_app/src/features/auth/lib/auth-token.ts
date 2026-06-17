import {
  InteractionRequiredAuthError,
} from "@azure/msal-browser";

import { entraApiTokenRequest, isMicrosoftAuthConfigured } from "../config/msal";
import { notifyAuthSessionInvalidated } from "./auth-events";
import { PASSWORD_AUTH_TOKEN_KEY } from "./auth-storage";
import { msalInstance } from "./msal";
import type { AccountInfo, SilentRequest } from "@azure/msal-browser";

export class AuthInteractionRequiredError extends Error {
  constructor(message = "Interactive sign-in is required.") {
    super(message);
    this.name = "AuthInteractionRequiredError";
  }
}

export function getPasswordAuthToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.sessionStorage.getItem(PASSWORD_AUTH_TOKEN_KEY);
}

export function setPasswordAuthToken(token: string | null): void {
  if (typeof window === "undefined") {
    return;
  }

  if (token) {
    window.sessionStorage.setItem(PASSWORD_AUTH_TOKEN_KEY, token);
  } else {
    window.sessionStorage.removeItem(PASSWORD_AUTH_TOKEN_KEY);
  }
}

export function getActiveAccount(): AccountInfo | null {
  const activeAccount = msalInstance.getActiveAccount();
  if (activeAccount) {
    return activeAccount;
  }

  const firstAccount = msalInstance.getAllAccounts().at(0) ?? null;
  if (firstAccount) {
    msalInstance.setActiveAccount(firstAccount);
  }

  return firstAccount;
}

export async function getAccessToken(options?: {
  forceRefresh?: boolean;
  allowPasswordToken?: boolean;
}): Promise<string | null> {
  const passwordToken = getPasswordAuthToken();
  if (passwordToken && options?.allowPasswordToken !== false) {
    return passwordToken;
  }

  if (!isMicrosoftAuthConfigured) {
    return null;
  }

  const account = getActiveAccount();
  if (!account || entraApiTokenRequest.scopes.length === 0) {
    return null;
  }

  const request: SilentRequest = {
    ...entraApiTokenRequest,
    account,
    forceRefresh: options?.forceRefresh,
  };

  try {
    const response = await msalInstance.acquireTokenSilent(request);
    return response.accessToken || null;
  } catch (error) {
    if (error instanceof InteractionRequiredAuthError) {
      notifyAuthSessionInvalidated();
      throw new AuthInteractionRequiredError();
    }

    throw error;
  }
}
