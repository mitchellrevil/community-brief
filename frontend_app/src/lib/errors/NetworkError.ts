import { AppError,  ErrorSeverity } from './AppError';
import type {AppErrorOptions} from './AppError';

export interface NetworkErrorOptions extends AppErrorOptions {
  isOffline?: boolean;
}

/**
 * Error class for network-related failures.
 * Tracks offline status for PWA/connectivity awareness.
 */
export class NetworkError extends AppError {
  readonly isOffline: boolean;

  constructor(message: string, options: NetworkErrorOptions = {}) {
    super(message, {
      ...options,
      severity: options.severity ?? ErrorSeverity.Warning,
    });
    this.name = 'NetworkError';
    this.isOffline = options.isOffline ?? false;
  }
}
