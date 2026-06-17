/**
 * HTTP Clients for API Communication
 *
 * Provides two axios instances for API communication:
 * - httpClient: Standard API client (goes through Azure Static Web App proxy)
 * - directBackendClient: Direct backend access for large file uploads (bypasses 30MB limit)
 *
 * Both clients share identical auth and error interceptor logic via the shared
 * interceptor factories.
 */
import axios from "axios";
import { createAuthInterceptor } from "./interceptors/authInterceptor";

const rawApiBaseUrl = import.meta.env.VITE_API_URL?.trim();
const absoluteBaseUrlPattern = /^[a-z][a-z0-9+.-]*:\/\//i;
const resolvedBaseUrl = rawApiBaseUrl && (absoluteBaseUrlPattern.test(rawApiBaseUrl) || rawApiBaseUrl.startsWith("//"))
  ? rawApiBaseUrl
  : undefined;

// Avoid setting axios baseURL for relative proxy paths so we don't double prefix requests.
const axiosDefaults = {
  baseURL: resolvedBaseUrl,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
};

// Create the main HTTP client
export const httpClient = axios.create({ ...axiosDefaults });

// Direct backend client for large file uploads (bypasses Azure Static Web App's 30MB limit)
// Uses VITE_BACKEND_DIRECT_URL if set, otherwise falls back to VITE_API_URL
const directBackendUrl = import.meta.env.VITE_BACKEND_DIRECT_URL?.trim() || resolvedBaseUrl;
export const directBackendClient = axios.create({
  ...axiosDefaults,
  baseURL: directBackendUrl,
});

function isExternalUrl(url?: string, baseURL?: string): boolean {
  if (!url) {
    return false;
  }

  try {
    const currentOrigin =
      typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const resolved = new URL(url, baseURL || currentOrigin);
    const allowedOrigins = new Set<string>([currentOrigin]);
    if (resolvedBaseUrl) {
      allowedOrigins.add(new URL(resolvedBaseUrl, currentOrigin).origin);
    }
    if (directBackendUrl) {
      allowedOrigins.add(new URL(directBackendUrl, currentOrigin).origin);
    }
    return !allowedOrigins.has(resolved.origin);
  } catch {
    return false;
  }
}

/**
 * Applies shared interceptors to a client.
 * Each client needs its own auth interceptor instance to retry with the correct client.
 */
function applyInterceptors(client: typeof httpClient): void {
  const authInterceptor = createAuthInterceptor({
    retryClient: client,
    shouldAttachAuth: (url, baseURL) => !isExternalUrl(url, baseURL),
  });

  client.interceptors.request.use(authInterceptor.request);
  client.interceptors.response.use(
    (response) => response,
    authInterceptor.responseError,
  );
}

// Apply identical interceptors to both clients
applyInterceptors(httpClient);
applyInterceptors(directBackendClient);
