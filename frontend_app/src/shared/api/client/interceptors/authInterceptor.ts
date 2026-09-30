/**
 * Auth Interceptor Factory
 *
 * Creates response interceptors for handling authentication errors:
 * - Requests: attach Microsoft Entra or password-login bearer tokens
 * - 401: Attempts forced silent token reacquire and retries the original request
 * - 401 after reacquire failure: clears client auth state and notifies the app
 * - 403: leaves routing to the permission/session layer
 */
import { isAxiosError } from "axios";
import type {
  AxiosError,
  InternalAxiosRequestConfig,
} from "axios";

import { notifyAuthSessionInvalidated } from "@/features/auth/lib/auth-events";
import { clearClientSessionState } from "@/features/auth/lib/auth-storage";
import { getAccessToken } from "@/features/auth/lib/auth-token";
import { mapAxiosErrorToApiError } from "@/lib/errors/errorHandler";

export interface AuthInterceptorConfig {
  retryClient: {
    request: (config: InternalAxiosRequestConfig) => Promise<unknown>;
  };
  shouldAttachAuth?: (url?: string, baseURL?: string) => boolean;
}

export interface AuthInterceptorHandlers {
  request: (request: InternalAxiosRequestConfig) => Promise<InternalAxiosRequestConfig>;
  responseError: (error: unknown) => Promise<any>;
}

function handleUnauthenticated(): void {
  void clearClientSessionState();
  notifyAuthSessionInvalidated();
}

export function createAuthInterceptor(
  config?: AuthInterceptorConfig,
): AuthInterceptorHandlers {
  const request = async (
    requestConfig: InternalAxiosRequestConfig,
  ): Promise<InternalAxiosRequestConfig> => {
    const shouldAttach = config?.shouldAttachAuth?.(
      requestConfig.url,
      requestConfig.baseURL,
    ) ?? true;

    if (!shouldAttach) {
      return requestConfig;
    }

    const token = await getAccessToken();
    if (token) {
      requestConfig.headers.Authorization = `Bearer ${token}`;
    }

    return requestConfig;
  };

  const responseError = async (error: unknown): Promise<any> => {
    if (!isAxiosError(error)) {
      return Promise.reject(error);
    }

    const axiosError = error as AxiosError;
    const status = axiosError.response?.status;
    const original = axiosError.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (
      status === 401 &&
      config &&
      !original._retry &&
      config.shouldAttachAuth?.(original.url, original.baseURL) !== false
    ) {
      original._retry = true;
      try {
        const token = await getAccessToken({ forceRefresh: true });
        if (token) {
          original.headers.Authorization = `Bearer ${token}`;
        }
        return config.retryClient.request(original) as any;
      } catch (_) {
        handleUnauthenticated();
        return Promise.reject(mapAxiosErrorToApiError(axiosError));
      }
    }

    if (status === 401) {
      handleUnauthenticated();
    }

    return Promise.reject(mapAxiosErrorToApiError(axiosError));
  };

  return {
    request,
    responseError,
  };
}
