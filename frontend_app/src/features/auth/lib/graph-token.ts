import type {
  AccountInfo,
  AuthenticationResult,
  IPublicClientApplication,
} from "@azure/msal-browser";

const pendingTokens = new WeakMap<
  IPublicClientApplication,
  Map<string, Promise<AuthenticationResult>>
>();

/** Share simultaneous renewals across calendar, transcript and recording requests. */
export async function acquireGraphToken(
  instance: IPublicClientApplication,
  account: AccountInfo,
  scopes: Array<string>,
  forceRefresh = false,
): Promise<string> {
  let pending = pendingTokens.get(instance);
  if (!pending) {
    pending = new Map();
    pendingTokens.set(instance, pending);
  }
  const key = JSON.stringify([
    account.homeAccountId,
    [...scopes].sort(),
    forceRefresh,
  ]);
  let request = pending.get(key);
  if (!request) {
    request = instance.acquireTokenSilent({
      scopes,
      account,
      ...(forceRefresh ? { forceRefresh: true } : {}),
    });
    pending.set(key, request);
  }
  try {
    const result = await request;
    if (!result.accessToken)
      throw new Error("Sign in with Microsoft again to reconnect Teams.");
    return result.accessToken;
  } finally {
    if (pending.get(key) === request) pending.delete(key);
  }
}
