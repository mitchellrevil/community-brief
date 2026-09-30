import type {
  Configuration,
  PopupRequest,
  SilentRequest,
} from "@azure/msal-browser";
import { getRuntimeConfig } from "@/config/runtime-config";

export function resolveAuthConfig() {
  const runtimeConfig = getRuntimeConfig();

  return {
    clientId: runtimeConfig?.clientId || import.meta.env.VITE_CLIENT_ID || "",
    tenantId:
      runtimeConfig?.tenantId || import.meta.env.VITE_TENANT_ID || "common",
    apiScope:
      runtimeConfig?.apiScope || import.meta.env.VITE_ENTRA_API_SCOPE || "",
  };
}

function resolveBrowserUrl(path: string): string {
  const origin =
    typeof window !== "undefined" &&
    window.location.origin &&
    window.location.origin !== "null"
      ? window.location.origin
      : "http://localhost";

  return new URL(path, origin).toString();
}

const { clientId, tenantId, apiScope } = resolveAuthConfig();

export const isMicrosoftAuthConfigured = Boolean(
  clientId && tenantId && apiScope,
);
const authority = `https://login.microsoftonline.com/${tenantId}`;

export const entraApiScope = apiScope;
export const entraApiScopes = entraApiScope ? [entraApiScope] : [];
export const microsoftGraphScopes = ["openid", "profile", "email", "User.Read"];
export const teamsGraphScopes = [
  "Calendars.ReadBasic",
  "OnlineMeetings.Read",
  "OnlineMeetingTranscript.Read.All",
];
export const teamsRecordingGraphScopes = ["OnlineMeetingRecording.Read.All"];

export function getMsalRedirectUri(): string {
  return resolveBrowserUrl("/auth-redirect.html");
}

export function shouldUseMicrosoftRedirect(): boolean {
  return (
    typeof navigator !== "undefined" && /\bElectron\//.test(navigator.userAgent)
  );
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
