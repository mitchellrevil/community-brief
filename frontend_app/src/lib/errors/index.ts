// Centralized error handling exports
export { AppError, ErrorSeverity, type AppErrorOptions } from './AppError';
export { ApiError, type ApiErrorOptions } from './ApiError';
export { NetworkError, type NetworkErrorOptions } from './NetworkError';
export { ValidationError, type ValidationErrorOptions } from './ValidationError';
export {
  normalizeError,
  mapAxiosErrorToApiError,
  type NormalizedError,
} from './errorHandler';
