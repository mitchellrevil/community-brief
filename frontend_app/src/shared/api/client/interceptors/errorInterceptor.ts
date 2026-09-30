/**
 * Error Interceptor Factory
 *
 * Creates response interceptors for normalizing errors.
 */
import { isAxiosError } from "axios";
import type { AxiosError } from "axios";

import { mapAxiosErrorToApiError } from "@/lib/errors/errorHandler";

export interface ErrorInterceptorHandlers {
  responseError: (error: unknown) => Promise<any>;
}

export function createErrorInterceptor(): ErrorInterceptorHandlers {
  const responseError = async (error: unknown): Promise<any> => {
    if (isAxiosError(error)) {
      return Promise.reject(mapAxiosErrorToApiError(error as AxiosError));
    }

    return Promise.reject(error);
  };

  return {
    responseError,
  };
}
