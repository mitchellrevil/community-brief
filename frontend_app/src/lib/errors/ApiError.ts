import { AppError,  ErrorSeverity } from './AppError';
import type {AppErrorOptions} from './AppError';

export interface ApiErrorOptions extends AppErrorOptions {
  status: number;
  responseData?: unknown;
}

/**
 * Error class for API/HTTP errors.
 * Includes HTTP status code and response data.
 */
export class ApiError extends AppError {
  readonly status: number;
  readonly responseData: unknown;

  constructor(message: string, options: ApiErrorOptions) {
    super(message, options);
    this.name = 'ApiError';
    this.status = options.status;
    this.responseData = options.responseData;
  }
}
