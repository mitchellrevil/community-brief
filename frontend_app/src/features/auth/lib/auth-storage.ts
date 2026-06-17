const AUTH_LOCAL_STORAGE_KEYS = [
  "ms_profile_image",
  "permission",
  "profile",
  "user",
] as const;

export const PASSWORD_AUTH_TOKEN_KEY = "community_brief_password_auth_token";

const AUTH_SESSION_STORAGE_KEYS = [
  PASSWORD_AUTH_TOKEN_KEY,
] as const;

export function clearClientSessionState(): void {
  if (typeof window === "undefined") {
    return;
  }

  for (const key of AUTH_LOCAL_STORAGE_KEYS) {
    window.localStorage.removeItem(key);
  }

  for (const key of AUTH_SESSION_STORAGE_KEYS) {
    window.sessionStorage.removeItem(key);
  }
}
