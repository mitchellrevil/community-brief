import {
  InteractionRequiredAuthError,
  InteractionStatus,
} from "@azure/msal-browser";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMicrosoftGraphToken } from "@/features/auth/hooks/useMicrosoftAccessToken";
import { teamsGraphScopes } from "@/features/auth/config/msal";

const mocks = vi.hoisted(() => {
  const acquireTokenSilent = vi.fn();
  const getActiveAccount = vi.fn();
  const setActiveAccount = vi.fn();
  return {
    auth: { isAuthenticated: true, isLoading: false },
    acquireTokenSilent,
    getActiveAccount,
    setActiveAccount,
    instance: { acquireTokenSilent, getActiveAccount, setActiveAccount },
    accounts: [] as Array<Record<string, string>>,
  };
});

vi.mock("@azure/msal-react", () => ({
  useMsal: () => ({
    instance: mocks.instance,
    accounts: mocks.accounts,
    inProgress: InteractionStatus.None,
  }),
}));

vi.mock("@/features/auth/hooks/useAuthSession", () => ({
  useAuthSession: () => mocks.auth,
}));

describe("useMicrosoftGraphToken", () => {
  const account = {
    homeAccountId: "home",
    localAccountId: "local",
    environment: "login.microsoftonline.com",
    tenantId: "tenant",
    username: "alex@example.com",
  };

  beforeEach(() => {
    mocks.auth.isAuthenticated = true;
    mocks.auth.isLoading = false;
    mocks.accounts.splice(0, mocks.accounts.length, account);
    mocks.getActiveAccount.mockReset().mockReturnValue(account);
    mocks.setActiveAccount.mockReset();
    mocks.acquireTokenSilent.mockReset();
  });

  it("requests the supplied Teams scopes and returns the token state", async () => {
    mocks.acquireTokenSilent.mockResolvedValue({ accessToken: "teams-token" });

    const { result } = renderHook(() =>
      useMicrosoftGraphToken(teamsGraphScopes),
    );

    await waitFor(() => expect(result.current.accessToken).toBe("teams-token"));
    expect(result.current).toEqual({
      accessToken: "teams-token",
      isLoading: false,
      error: null,
    });
    expect(mocks.acquireTokenSilent).toHaveBeenCalledWith({
      scopes: teamsGraphScopes,
      account,
    });
  });

  it("does not request a Graph token for an authenticated password session", async () => {
    mocks.accounts.splice(0);
    mocks.getActiveAccount.mockReturnValue(null);

    const { result } = renderHook(() =>
      useMicrosoftGraphToken(teamsGraphScopes),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.accessToken).toBeNull();
    expect(result.current.error).toBeNull();
    expect(mocks.acquireTokenSilent).not.toHaveBeenCalled();
  });

  it("exposes an actionable consent error", async () => {
    mocks.acquireTokenSilent.mockRejectedValue(
      new InteractionRequiredAuthError("consent_required", "Consent required"),
    );

    const { result } = renderHook(() =>
      useMicrosoftGraphToken(teamsGraphScopes),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.accessToken).toBeNull();
    expect(result.current.error).toEqual(
      new Error("Microsoft Graph consent is required."),
    );
  });

  it("does not acquire Teams scopes until enabled and clears the token when disabled", async () => {
    mocks.acquireTokenSilent.mockResolvedValue({ accessToken: "teams-token" });
    const { result, rerender } = renderHook(
      ({ enabled }) => useMicrosoftGraphToken(teamsGraphScopes, enabled),
      { initialProps: { enabled: false } },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mocks.acquireTokenSilent).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.accessToken).toBe("teams-token"));
    rerender({ enabled: false });
    await waitFor(() => expect(result.current.accessToken).toBeNull());
    expect(mocks.acquireTokenSilent).toHaveBeenCalledOnce();
  });
});
