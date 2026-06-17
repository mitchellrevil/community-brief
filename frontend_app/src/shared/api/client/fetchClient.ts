import { httpClient } from "./httpClient";
import type { NormalizedError } from "@/lib/errors";
import type { AxiosRequestConfig } from "axios";
import { notifyAuthSessionInvalidated } from "@/features/auth/lib/auth-events";
import { clearClientSessionState } from "@/features/auth/lib/auth-storage";
import { getAccessToken } from "@/features/auth/lib/auth-token";
import { normalizeError } from "@/lib/errors";


/**
 * Error thrown by fetchWithAuth and streamWithAuth when requests fail.
 * Contains normalized error information for consistent UI display.
 */
export class FetchError extends Error {
  readonly normalized: NormalizedError;
  readonly status?: number;
  readonly response?: Response;

  constructor(
    message: string,
    options: {
      normalized: NormalizedError;
      status?: number;
      response?: Response;
    },
  ) {
    super(message);
    this.name = "FetchError";
    this.normalized = options.normalized;
    this.status = options.status;
    this.response = options.response;
  }
}

export async function fetchWithAuth(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const headers = await buildAuthHeaders(init?.headers);
  const mergedInit: RequestInit = {
    credentials: "include",
    ...init,
    headers,
  };

  try {
    let response = await fetch(input, mergedInit);

    if (response.status === 401) {
      try {
        response = await fetch(input, {
          ...mergedInit,
          headers: await buildAuthHeaders(init?.headers, {
            forceRefresh: true,
          }),
        });
      } catch {
        invalidateClientAuthSession();
      }
    }

    if (!response.ok) {
      const errorObj = new Error(
        `HTTP ${response.status}: ${response.statusText}`,
      );
      (errorObj as any).status = response.status;
      (errorObj as any).response = response;

      const normalized = normalizeError(errorObj);

      throw new FetchError(normalized.userMessage, {
        normalized,
        status: response.status,
        response,
      });
    }

    return response;
  } catch (error) {
    if (error instanceof FetchError) {
      throw error;
    }

    const normalized = normalizeError(error);

    throw new FetchError(normalized.userMessage, {
      normalized,
    });
  }
}

export async function downloadArrayBuffer(
  url: string,
  opts?: Omit<AxiosRequestConfig, "responseType">,
): Promise<ArrayBuffer> {
  const response = await httpClient.get<ArrayBuffer>(url, {
    ...opts,
    responseType: "arraybuffer",
  });

  return response.data;
}

export async function streamWithAuth(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const headers = await buildAuthHeaders(init?.headers);
  const mergedInit: RequestInit = {
    credentials: "include",
    ...init,
    headers,
  };

  try {
    let response = await fetch(url, mergedInit);

    if (response.status === 401) {
      try {
        response = await fetch(url, {
          ...mergedInit,
          headers: await buildAuthHeaders(init?.headers, {
            forceRefresh: true,
          }),
        });
      } catch {
        invalidateClientAuthSession();
      }
    }

    if (!response.ok) {
      const errorObj = new Error(
        `HTTP ${response.status}: ${response.statusText}`,
      );
      (errorObj as any).status = response.status;
      (errorObj as any).response = response;

      const normalized = normalizeError(errorObj);

      throw new FetchError(normalized.userMessage, {
        normalized,
        status: response.status,
        response,
      });
    }

    return response;
  } catch (error) {
    if (error instanceof FetchError) {
      throw error;
    }

    const normalized = normalizeError(error);

    throw new FetchError(normalized.userMessage, {
      normalized,
    });
  }
}

function invalidateClientAuthSession(): void {
  void clearClientSessionState();
  notifyAuthSessionInvalidated();
}

async function buildAuthHeaders(
  input?: HeadersInit,
  options?: { forceRefresh?: boolean },
): Promise<Headers> {
  const headers = new Headers(input);
  const token = await getAccessToken({ forceRefresh: options?.forceRefresh });
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return headers;
}
