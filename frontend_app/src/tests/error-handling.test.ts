import { describe, expect, it } from 'vitest';
import { apiPath } from './apiPaths';
import type { AxiosError } from 'axios';

// These imports will fail until we implement the error system
import { ApiError } from '@/lib/errors/ApiError';
import { NetworkError } from '@/lib/errors/NetworkError';
import { ValidationError } from '@/lib/errors/ValidationError';
import { AppError, ErrorSeverity } from '@/lib/errors/AppError';
import { mapAxiosErrorToApiError, normalizeError  } from '@/lib/errors/errorHandler';


describe('AppError base class', () => {
  it('should construct with name, message, metadata, and severity', () => {
    const error = new AppError('Test error message', {
      metadata: { foo: 'bar' },
      severity: ErrorSeverity.Warning,
    });

    expect(error.name).toBe('AppError');
    expect(error.message).toBe('Test error message');
    expect(error.metadata).toEqual({ foo: 'bar' });
    expect(error.severity).toBe(ErrorSeverity.Warning);
    expect(error).toBeInstanceOf(Error);
  });

  it('should default severity to Error', () => {
    const error = new AppError('Simple error');

    expect(error.severity).toBe(ErrorSeverity.Error);
  });
});

describe('ApiError', () => {
  it('should construct with status code, message, and metadata', () => {
    const error = new ApiError('Unauthorized', {
      status: 401,
      responseData: { detail: 'Token expired' },
      metadata: { endpoint: apiPath('/users') },
    });

    expect(error.name).toBe('ApiError');
    expect(error.message).toBe('Unauthorized');
    expect(error.status).toBe(401);
    expect(error.responseData).toEqual({ detail: 'Token expired' });
    expect(error.metadata).toEqual({ endpoint: apiPath('/users') });
    expect(error).toBeInstanceOf(AppError);
  });

  it('should extend AppError', () => {
    const error = new ApiError('Server error', { status: 500 });

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
  });
});

describe('ValidationError', () => {
  it('should construct with fieldErrors', () => {
    const error = new ValidationError('Validation failed', {
      fieldErrors: {
        email: 'Invalid email format',
        password: 'Password too short',
      },
    });

    expect(error.name).toBe('ValidationError');
    expect(error.message).toBe('Validation failed');
    expect(error.fieldErrors).toEqual({
      email: 'Invalid email format',
      password: 'Password too short',
    });
    expect(error).toBeInstanceOf(AppError);
  });
});

describe('NetworkError', () => {
  it('should construct as network-specific error', () => {
    const error = new NetworkError('Network request failed');

    expect(error.name).toBe('NetworkError');
    expect(error.message).toBe('Network request failed');
    expect(error).toBeInstanceOf(AppError);
  });

  it('should mark as offline when specified', () => {
    const error = new NetworkError('Connection lost', { isOffline: true });

    expect(error.isOffline).toBe(true);
  });
});

describe('errorHandler - normalizeError', () => {
  it('should map 401 axios error to friendly unauthorized message', () => {
    const axiosError = createMockAxiosError(401, { detail: 'Token expired' });

    const result = normalizeError(axiosError);

    expect(result.userMessage).toMatch(/unauthorized|session.*(expired|sign in)/i);
    expect(result.code).toBe('UNAUTHORIZED');
    expect(result.severity).toBe(ErrorSeverity.Warning);
    expect(result.original).toBe(axiosError);
  });

  it('should map 500 axios error to generic server message', () => {
    const axiosError = createMockAxiosError(500, { detail: 'Internal error' });

    const result = normalizeError(axiosError);

    expect(result.userMessage).toMatch(/server error|something went wrong/i);
    expect(result.code).toBe('SERVER_ERROR');
    expect(result.severity).toBe(ErrorSeverity.Error);
  });

  it('should map 404 axios error to not found message', () => {
    const axiosError = createMockAxiosError(404, { detail: 'Resource not found' });

    const result = normalizeError(axiosError);

    expect(result.userMessage).toMatch(/not found/i);
    expect(result.code).toBe('NOT_FOUND');
  });

  it('should map 400 axios error to bad request message', () => {
    const axiosError = createMockAxiosError(400, { message: 'Invalid input' });

    const result = normalizeError(axiosError);

    expect(result.userMessage).toBe('Invalid input');
    expect(result.code).toBe('BAD_REQUEST');
  });

  it('should extract message from network error (no response) when offline', () => {
    const networkError = createMockNetworkError('Network Error', true);

    const result = normalizeError(networkError);

    expect(result.userMessage).toMatch(/offline|network/i);
    expect(result.code).toBe('NETWORK_ERROR');
    expect(result.severity).toBe(ErrorSeverity.Warning);
  });

  it('should handle standard Error objects', () => {
    const error = new Error('Something broke');

    const result = normalizeError(error);

    expect(result.userMessage).toBe('Something broke');
    expect(result.original).toBe(error);
  });

  it('should handle unknown thrown values', () => {
    const result = normalizeError('string error');

    expect(result.userMessage).toBe('An unexpected error occurred');
  });
});

describe('errorHandler - mapAxiosErrorToApiError', () => {
  it('should convert axios error to ApiError', () => {
    const axiosError = createMockAxiosError(401, { detail: 'Invalid token' });

    const apiError = mapAxiosErrorToApiError(axiosError);

    expect(apiError).toBeInstanceOf(ApiError);
    // Type guard for TypeScript
    if (apiError instanceof ApiError) {
      expect(apiError.status).toBe(401);
      expect(apiError.responseData).toEqual({ detail: 'Invalid token' });
    }
  });

  it('should convert network error to NetworkError', () => {
    const networkError = createMockNetworkError('Network failure', true);

    const mapped = mapAxiosErrorToApiError(networkError);

    expect(mapped).toBeInstanceOf(NetworkError);
    if (mapped instanceof NetworkError) {
      expect(mapped.isOffline).toBe(true);
    }
  });

  it('should preserve original error in cause', () => {
    const axiosError = createMockAxiosError(500, { error: 'DB timeout' });

    const apiError = mapAxiosErrorToApiError(axiosError);

    expect(apiError.cause).toBe(axiosError);
  });
});

// --- Test Helpers ---

function createMockAxiosError(
  status: number,
  data: Record<string, unknown>,
): AxiosError {
  const error = new Error(`Request failed with status ${status}`) as AxiosError;
  error.isAxiosError = true;
  error.name = 'AxiosError';
  error.response = {
    status,
    statusText: getStatusText(status),
    data,
    headers: {},
    config: {} as any,
  };
  error.config = {} as any;
  return error;
}

function createMockNetworkError(
  message: string,
  isOffline: boolean,
): AxiosError {
  const error = new Error(message) as AxiosError;
  error.isAxiosError = true;
  error.name = 'AxiosError';
  error.code = 'ERR_NETWORK';
  error.response = undefined;
  error.config = {} as any;

  // Simulate offline detection
  if (isOffline && typeof navigator !== 'undefined') {
    Object.defineProperty(navigator, 'onLine', {
      value: false,
      writable: true,
      configurable: true,
    });
  }

  return error;
}

function getStatusText(status: number): string {
  const statusTexts: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
  };
  return statusTexts[status] ?? 'Unknown';
}
