import {  isAxiosError } from 'axios';
import { ApiError } from './ApiError';
import { AppError, ErrorSeverity } from './AppError';
import { NetworkError } from './NetworkError';
import type {AxiosError} from 'axios';

/**
 * Normalized error result for UI consumption.
 */
export interface NormalizedError {
  userMessage: string;
  code?: string;
  severity?: ErrorSeverity;
  original: unknown;
}

/**
 * HTTP status code to error code mapping.
 */
const ERROR_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'VALIDATION_ERROR',
  429: 'RATE_LIMITED',
  500: 'SERVER_ERROR',
  502: 'BAD_GATEWAY',
  503: 'SERVICE_UNAVAILABLE',
};

/**
 * User-friendly messages for HTTP status codes.
 */
const USER_MESSAGES: Record<number, string> = {
  400: 'The request was invalid.',
  401: 'Your session has expired. Please sign in again.',
  403: 'You do not have permission to perform this action.',
  404: 'The requested resource was not found.',
  409: 'The request conflicts with existing data.',
  422: 'The provided data is invalid.',
  429: 'Too many requests. Please try again later.',
  500: 'Something went wrong on our end. Please try again.',
  502: 'Service temporarily unavailable.',
  503: 'Service temporarily unavailable.',
};

/**
 * Extracts a user-displayable message from error response data.
 */
function extractMessageFromData(data: unknown): string | null {
  if (typeof data === 'string') {
    return data;
  }
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    if (typeof obj.message === 'string') return obj.message;
    if (typeof obj.detail === 'string') return obj.detail;
    if (typeof obj.error === 'string') return obj.error;
  }
  return null;
}

/**
 * Determines if the browser is offline.
 */
function isOffline(): boolean {
  if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
    return !navigator.onLine;
  }
  return false;
}

/**
 * Normalizes any error into a consistent structure for UI display.
 */
export function normalizeError(error: unknown): NormalizedError {
  // Handle axios errors
  if (isAxiosError(error)) {
    const axiosError = error as AxiosError;
    const status = axiosError.response?.status;
    const data = axiosError.response?.data;

    // Network error (no response)
    if (!axiosError.response || axiosError.code === 'ERR_NETWORK') {
      const offline = isOffline();
      return {
        userMessage: offline
          ? 'You appear to be offline. Please check your connection.'
          : 'Network error. Please check your connection and try again.',
        code: 'NETWORK_ERROR',
        severity: ErrorSeverity.Warning,
        original: error,
      };
    }

    // HTTP error with response
    if (status) {
      const code = ERROR_CODES[status] ?? 'UNKNOWN_ERROR';
      let userMessage = USER_MESSAGES[status] ?? 'An unexpected error occurred.';

      // For 400 errors, prefer the server's message if available
      if (status === 400) {
        const extractedMessage = extractMessageFromData(data);
        if (extractedMessage) {
          userMessage = extractedMessage;
        }
      }

      const severity =
        status === 401 || status === 403 || status === 404
          ? ErrorSeverity.Warning
          : ErrorSeverity.Error;

      return {
        userMessage,
        code,
        severity,
        original: error,
      };
    }
  }

  // Handle AppError and subclasses
  if (error instanceof AppError) {
    return {
      userMessage: error.message,
      code: error.name.toUpperCase().replace('ERROR', '_ERROR'),
      severity: error.severity,
      original: error,
    };
  }

  // Handle standard Error objects
  if (error instanceof Error) {
    return {
      userMessage: error.message,
      original: error,
    };
  }

  // Handle plain objects with message-like fields.
  // Only extract from objects — do not treat bare strings or primitives as display messages.
  const extractedMessage = error && typeof error === 'object' ? extractMessageFromData(error) : null;
  if (extractedMessage) {
    return {
      userMessage: extractedMessage,
      original: error,
    };
  }

  // Unknown error type
  return {
    userMessage: 'An unexpected error occurred',
    original: error,
  };
}

/**
 * Maps an axios error to the appropriate AppError subclass.
 * Used by HTTP interceptors to provide typed errors.
 */
export function mapAxiosErrorToApiError(
  error: AxiosError,
): ApiError | NetworkError {
  // Network error (no response)
  if (!error.response || error.code === 'ERR_NETWORK') {
    const offline = isOffline();
    return new NetworkError(
      offline
        ? 'You appear to be offline.'
        : 'Network request failed.',
      {
        isOffline: offline,
        cause: error,
      },
    );
  }

  const status = error.response.status;
  const data = error.response.data;
  const message =
    extractMessageFromData(data) ??
    USER_MESSAGES[status];

  return new ApiError(message, {
    status,
    responseData: data,
    cause: error,
    severity:
      status === 401 || status === 403 || status === 404
        ? ErrorSeverity.Warning
        : ErrorSeverity.Error,
  });
}
