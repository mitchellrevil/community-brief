const AUTH_SESSION_INVALIDATED_EVENT = "auth:session-invalidated";

export function notifyAuthSessionInvalidated(): void {
  if (
    typeof window === "undefined" ||
    typeof window.dispatchEvent !== "function"
  ) {
    return;
  }

  window.dispatchEvent(new CustomEvent(AUTH_SESSION_INVALIDATED_EVENT));
}

export function subscribeToAuthSessionInvalidated(
  listener: () => void,
): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handler = () => listener();
  window.addEventListener(AUTH_SESSION_INVALIDATED_EVENT, handler);
  return () => {
    window.removeEventListener(AUTH_SESSION_INVALIDATED_EVENT, handler);
  };
}