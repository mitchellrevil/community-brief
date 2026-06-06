/**
 * HTTP client interceptor coverage.
 *
 * These tests focus on the shared auth/error interceptor behavior that both
 * frontend axios clients depend on.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiPath } from "../apiPaths";
import type { AxiosError, InternalAxiosRequestConfig } from "axios";
import { getAccessToken } from "@/features/auth/lib/auth-token";
import { ApiError } from "@/lib/errors/ApiError";
import { NetworkError } from "@/lib/errors/NetworkError";


vi.mock("@/features/auth/lib/auth-token", () => ({
  getAccessToken: vi.fn(),
}));

const mockGetAccessToken = vi.mocked(getAccessToken);
const mockLocationReplace = vi.fn();
const mockLocalStorageRemove = vi.fn();
const mockSessionStorageGetItem = vi.fn();
const mockSessionStorageSetItem = vi.fn();
const mockSessionStorageRemoveItem = vi.fn();
const mockSessionStorageClear = vi.fn();
const mockDispatchEvent = vi.fn();

Object.defineProperty(globalThis, "window", {
  value: {
    location: {
      origin: "http://localhost:3000",
      pathname: "/dashboard",
      search: "",
      replace: mockLocationReplace,
    },
    localStorage: {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: mockLocalStorageRemove,
    },
    sessionStorage: {
      getItem: mockSessionStorageGetItem,
      setItem: mockSessionStorageSetItem,
      removeItem: mockSessionStorageRemoveItem,
      clear: mockSessionStorageClear,
    },
    dispatchEvent: mockDispatchEvent,
  },
  writable: true,
  configurable: true,
});

Object.defineProperty(globalThis, "localStorage", {
  value: globalThis.window.localStorage,
  writable: true,
  configurable: true,
});

Object.defineProperty(globalThis, "sessionStorage", {
  value: globalThis.window.sessionStorage,
  writable: true,
  configurable: true,
});

describe("HTTP client interceptors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAccessToken.mockResolvedValue(null);
    window.location.pathname = "/dashboard";
    window.location.search = "";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("createAuthInterceptor", () => {
    it("creates request and response handlers", async () => {
      const { createAuthInterceptor } =
        await import("@/shared/api/client/interceptors/authInterceptor");

      const interceptor = createAuthInterceptor({
        retryClient: { request: vi.fn() },
      });

      expect(typeof interceptor.request).toBe("function");
      expect(typeof interceptor.responseError).toBe("function");
    });

    it("attaches bearer tokens to requests", async () => {
      const { createAuthInterceptor } =
        await import("@/shared/api/client/interceptors/authInterceptor");

      mockGetAccessToken.mockResolvedValue("token-123");

      const requestConfig = {
        url: apiPath("/data"),
        headers: {} as InternalAxiosRequestConfig["headers"],
      } as InternalAxiosRequestConfig;

      const interceptor = createAuthInterceptor({
        retryClient: { request: vi.fn() },
      });

      const result = await interceptor.request(requestConfig);

      expect(mockGetAccessToken).toHaveBeenCalledWith();
      expect(result.headers.Authorization).toBe("Bearer token-123");
    });

    it("skips auth attachment when configured to do so", async () => {
      const { createAuthInterceptor } =
        await import("@/shared/api/client/interceptors/authInterceptor");

      const requestConfig = {
        url: "https://external.example.com/data",
        headers: {} as InternalAxiosRequestConfig["headers"],
      } as InternalAxiosRequestConfig;

      const interceptor = createAuthInterceptor({
        retryClient: { request: vi.fn() },
        shouldAttachAuth: () => false,
      });

      const result = await interceptor.request(requestConfig);

      expect(mockGetAccessToken).not.toHaveBeenCalled();
      expect(result.headers.Authorization).toBeUndefined();
    });

    it("retries once with a forced token refresh after a 401", async () => {
      const { createAuthInterceptor } =
        await import("@/shared/api/client/interceptors/authInterceptor");

      mockGetAccessToken
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce("refreshed-token");

      const retryClient = {
        request: vi.fn().mockResolvedValue({ data: "success" }),
      };

      const requestConfig = {
        url: apiPath("/data"),
        headers: {} as InternalAxiosRequestConfig["headers"],
      } as InternalAxiosRequestConfig;

      const interceptor = createAuthInterceptor({
        retryClient,
      });

      const error = createMockAxiosError(
        401,
        { message: "Unauthorized" },
        requestConfig,
      );

      await interceptor.responseError(error);

      expect(mockGetAccessToken).toHaveBeenCalledWith({ forceRefresh: true });
      expect(retryClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          _retry: true,
          headers: expect.objectContaining({
            Authorization: "Bearer refreshed-token",
          }),
        }),
      );
    });

    it("does not retry requests already marked as retried", async () => {
      const { createAuthInterceptor } =
        await import("@/shared/api/client/interceptors/authInterceptor");

      const retryClient = {
        request: vi.fn(),
      };

      const interceptor = createAuthInterceptor({
        retryClient,
      });

      const requestConfig = {
        url: apiPath("/data"),
        headers: {} as InternalAxiosRequestConfig["headers"],
        _retry: true,
      } as InternalAxiosRequestConfig;

      const error = createMockAxiosError(
        401,
        { message: "Unauthorized" },
        requestConfig,
      );

      await expect(interceptor.responseError(error)).rejects.toBeInstanceOf(
        ApiError,
      );
      expect(retryClient.request).not.toHaveBeenCalled();
      expect(mockGetAccessToken).not.toHaveBeenCalledWith({
        forceRefresh: true,
      });
    });

    it("invalidates client auth state when token refresh fails", async () => {
      const { createAuthInterceptor } =
        await import("@/shared/api/client/interceptors/authInterceptor");

      mockGetAccessToken.mockRejectedValue(new Error("Token refresh failed"));

      const interceptor = createAuthInterceptor({
        retryClient: { request: vi.fn() },
      });

      const requestConfig = {
        url: apiPath("/data"),
        headers: {} as InternalAxiosRequestConfig["headers"],
      } as InternalAxiosRequestConfig;

      const error = createMockAxiosError(
        401,
        { message: "Unauthorized" },
        requestConfig,
      );

      await expect(interceptor.responseError(error)).rejects.toBeInstanceOf(
        ApiError,
      );

      expect(mockLocalStorageRemove).toHaveBeenCalledWith("permission");
      expect(mockLocalStorageRemove).toHaveBeenCalledWith("user");
      expect(mockLocalStorageRemove).toHaveBeenCalledWith("profile");
      expect(mockSessionStorageRemoveItem).toHaveBeenCalledWith(
<<<<<<< HEAD
        "community_brief_password_auth_token",
=======
        "community_brief_password_auth_token",
>>>>>>> f46302a9 (Enhance CI/CD pipeline and frontend build process: add frontend working directory variable, activate pnpm, and improve caching; introduce pnpm workspace configuration; refactor API and test files for better structure and readability.)
      );
      expect(mockDispatchEvent).toHaveBeenCalledTimes(1);
      expect(mockLocationReplace).not.toHaveBeenCalled();
    });

    it("does not invalidate the session on 403 responses", async () => {
      const { createAuthInterceptor } =
        await import("@/shared/api/client/interceptors/authInterceptor");

      const interceptor = createAuthInterceptor({
        retryClient: { request: vi.fn() },
      });

      const requestConfig = {
        url: apiPath("/data"),
        headers: {} as InternalAxiosRequestConfig["headers"],
      } as InternalAxiosRequestConfig;

      const error = createMockAxiosError(
        403,
        { message: "Forbidden" },
        requestConfig,
      );

      await expect(interceptor.responseError(error)).rejects.toBeInstanceOf(
        ApiError,
      );
      expect(mockDispatchEvent).not.toHaveBeenCalled();
      expect(mockLocalStorageRemove).not.toHaveBeenCalled();
    });
  });

  describe("createErrorInterceptor", () => {
    it("maps HTTP errors to ApiError", async () => {
      const { createErrorInterceptor } =
        await import("@/shared/api/client/interceptors/errorInterceptor");

      const interceptor = createErrorInterceptor();
      const error = createMockAxiosError(404, { message: "Not found" });

      await expect(interceptor.responseError(error)).rejects.toBeInstanceOf(
        ApiError,
      );
    });

    it("maps network errors to NetworkError", async () => {
      const { createErrorInterceptor } =
        await import("@/shared/api/client/interceptors/errorInterceptor");

      const interceptor = createErrorInterceptor();
      const error = createMockNetworkError("Network Error");

      await expect(interceptor.responseError(error)).rejects.toBeInstanceOf(
        NetworkError,
      );
    });

    it("passes non-axios errors through unchanged", async () => {
      const { createErrorInterceptor } =
        await import("@/shared/api/client/interceptors/errorInterceptor");

      const interceptor = createErrorInterceptor();
      const error = new Error("Something went wrong");

      await expect(interceptor.responseError(error)).rejects.toBe(error);
    });
  });

  describe("client factories", () => {
    it("exports interceptor factories from the barrel", async () => {
      const interceptors = await import("@/shared/api/client/interceptors");

      expect(typeof interceptors.createAuthInterceptor).toBe("function");
      expect(typeof interceptors.createErrorInterceptor).toBe("function");
    });

    it("creates configured axios clients", async () => {
      const { createClient } = await import("@/shared/api/client/createClient");

      const client = createClient({
        baseURL: "https://api.example.com",
        timeout: 5000,
      });

      expect(client.defaults.baseURL).toBe("https://api.example.com");
      expect(client.defaults.timeout).toBe(5000);
      expect(client.defaults.withCredentials).toBe(true);
      expect(client.defaults.headers["Content-Type"]).toBe("application/json");
      expect(client.interceptors.response).toBeDefined();
    });

    it("exports both shared axios clients", async () => {
      const { directBackendClient, httpClient } =
        await import("@/shared/api/client/httpClient");

      expect(httpClient).toBeDefined();
      expect(directBackendClient).toBeDefined();
      expect(httpClient.defaults.withCredentials).toBe(true);
      expect(directBackendClient.defaults.withCredentials).toBe(true);
      expect(httpClient.interceptors.response).toBeDefined();
      expect(directBackendClient.interceptors.response).toBeDefined();
    });
  });
});

function createMockAxiosError(
  status: number,
  data: Record<string, unknown>,
  config?: InternalAxiosRequestConfig,
): AxiosError {
  const error = new Error(`Request failed with status ${status}`) as AxiosError;
  error.isAxiosError = true;
  error.name = "AxiosError";
  error.response = {
    status,
    statusText: getStatusText(status),
    data,
    headers: {},
    config: config ?? ({} as InternalAxiosRequestConfig),
  };
  error.config = config ?? ({} as InternalAxiosRequestConfig);
  return error;
}

function createMockNetworkError(message: string): AxiosError {
  const error = new Error(message) as AxiosError;
  error.isAxiosError = true;
  error.name = "AxiosError";
  error.code = "ERR_NETWORK";
  error.config = {} as InternalAxiosRequestConfig;
  return error;
}

function getStatusText(status: number): string {
  const statusTexts: Record<number, string> = {
    400: "Bad Request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not Found",
    500: "Internal Server Error",
    502: "Bad Gateway",
    503: "Service Unavailable",
  };

  return statusTexts[status] ?? "Unknown";
}

declare module "axios" {
  interface InternalAxiosRequestConfig {
    _retry?: boolean;
  }
}

