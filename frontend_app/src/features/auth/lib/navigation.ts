export function getCurrentAppPath(): string {
  if (typeof window === "undefined") {
    return "/";
  }

  return `${window.location.pathname}${window.location.search}`;
}

export function buildLoginRedirectUrl(target: string = getCurrentAppPath()): string {
  return `/login?redirect=${encodeURIComponent(target)}`;
}

export function getRedirectPathFromSearch(search: string): string | null {
  const params = new URLSearchParams(search);
  const redirect = params.get("redirect");
  if (!redirect) {
    return null;
  }

  if (!redirect.startsWith("/") || redirect.startsWith("//")) {
    return null;
  }

  try {
    const parsed = new URL(redirect, window.location.origin);
    if (parsed.origin !== window.location.origin) {
      return null;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}
