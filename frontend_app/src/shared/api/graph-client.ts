export type GraphTokenProvider = (options?: {
  forceRefresh?: boolean;
}) => Promise<string>;
export type GraphAccessToken = string | GraphTokenProvider;

export class MicrosoftGraphError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "MicrosoftGraphError";
  }
}

interface GraphErrorPayload {
  error?: { code?: string; message?: string; innerError?: { code?: string } };
}

/** Graph tokens are opaque. MSAL owns their validation, expiry and renewal. */
export async function graphRequest(
  url: string,
  token: GraphAccessToken,
  init?: RequestInit,
): Promise<Response> {
  if (new URL(url).origin !== "https://graph.microsoft.com") {
    throw new MicrosoftGraphError(
      "Microsoft Graph returned an invalid URL.",
      "InvalidGraphUrl",
      502,
    );
  }
  const headers = new Headers(init?.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  const send = async (forceRefresh = false) => {
    init?.signal?.throwIfAborted();
    const accessToken =
      typeof token === "string" ? token : await token({ forceRefresh });
    if (!accessToken)
      throw new MicrosoftGraphError(
        "Sign in with your Microsoft work account to reconnect Teams.",
        "GraphAuthenticationFailed",
        401,
      );
    headers.set("Authorization", `Bearer ${accessToken}`);
    return fetch(url, { ...init, headers });
  };
  let response = await send();
  if (response.status === 401 && typeof token !== "string")
    response = await send(true);
  if (response.ok) return response;

  let payload: GraphErrorPayload | null = null;
  try {
    payload = await response.json();
  } catch {
    /* Gateway responses can be empty. */
  }
  if (response.status === 401) {
    throw new MicrosoftGraphError(
      "Your Microsoft Teams session could not be refreshed. Sign in with Microsoft again to reconnect Teams.",
      "GraphAuthenticationFailed",
      401,
    );
  }
  throw new MicrosoftGraphError(
    payload?.error?.message ||
      `Microsoft Graph request failed (${response.status}).`,
    response.status === 429
      ? "TooManyRequests"
      : payload?.error?.innerError?.code ||
          payload?.error?.code ||
          "GraphRequestFailed",
    response.status,
  );
}
