import {
  EventType,
  PublicClientApplication,
} from "@azure/msal-browser";

import { msalConfig } from "../config/msal";

export const msalInstance = new PublicClientApplication(msalConfig);

let isMsalInitialized = false;
let hasRegisteredMsalEvents = false;

function registerMsalEventHandlers(): void {
  if (hasRegisteredMsalEvents) {
    return;
  }

  msalInstance.addEventCallback((event) => {
    if (
      (event.eventType === EventType.LOGIN_SUCCESS ||
        event.eventType === EventType.ACQUIRE_TOKEN_SUCCESS) &&
      event.payload &&
      "account" in event.payload &&
      event.payload.account
    ) {
      msalInstance.setActiveAccount(event.payload.account);
    }

    if (event.eventType === EventType.LOGOUT_SUCCESS) {
      msalInstance.setActiveAccount(null);
    }
  });

  hasRegisteredMsalEvents = true;
}

export async function initializeMsal(): Promise<void> {
  if (isMsalInitialized) {
    return;
  }

  await msalInstance.initialize();
  registerMsalEventHandlers();

  const activeAccount = msalInstance.getActiveAccount();
  if (!activeAccount) {
    const firstAccount = msalInstance.getAllAccounts().at(0);
    if (firstAccount) {
      msalInstance.setActiveAccount(firstAccount);
    }
  }

  isMsalInitialized = true;
}