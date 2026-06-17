import type { Configuration, PopupRequest, SilentRequest } from "@azure/msal-browser";

function resolveBrowserUrl(path: string): string {
  const origin =
    typeof window !== "undefined" && window.location.origin && window.location.origin !== "null"
      ? window.location.origin
      : "http://localhost";

  return new URL(path, origin).toString();
}

export const isMicrosoftAuthConfigured = Boolean(
  (import.meta.env.VITE_ENTRA_CLIENT_ID || import.meta.env.VITE_CLIENT_ID) &&
    (import.meta.env.VITE_ENTRA_TENANT_ID || import.meta.env.VITE_TENANT_ID),
);

const clientId = import.meta.env.VITE_CLIENT_ID || "";
const tenantId = import.meta.env.VITE_TENANT_ID || "common";
const authority = `https://login.microsoftonline.com/${tenantId}`;

export const entraApiScope =
  import.meta.env.VITE_ENTRA_API_SCOPE || (clientId ? `api://${clientId}/access_as_user` : "");
export const entraApiScopes = entraApiScope ? [entraApiScope] : [];
export const microsoftGraphScopes = ["openid", "profile", "email", "User.Read"];

export function getMsalRedirectUri(): string {
  return resolveBrowserUrl("/auth-redirect.html");
}

export const msalConfig: Configuration = {
  auth: {
    clientId,
    authority,
    redirectUri: getMsalRedirectUri(),
    postLogoutRedirectUri: resolveBrowserUrl("/login"),
  },
  cache: {
    cacheLocation: "sessionStorage",
  },
};

export const microsoftLoginRequest: PopupRequest = {
  scopes: entraApiScopes,
  prompt: "select_account",
  redirectUri: getMsalRedirectUri(),
};

export const entraApiTokenRequest: SilentRequest = {
  scopes: entraApiScopes,
};

export const microsoftGraphTokenRequest: SilentRequest = {
  scopes: microsoftGraphScopes,
};
