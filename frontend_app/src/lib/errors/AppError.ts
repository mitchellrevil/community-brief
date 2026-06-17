/**
 * Severity levels for application errors.
 */
export enum ErrorSeverity {
  /** Informational - no action required */
  Info = 'info',
  /** Warning - user should be aware but can continue */
  Warning = 'warning',
  /** Error - operation failed, may need user action */
  Error = 'error',
  /** Critical - system-level failure */
  Critical = 'critical',
}

export interface AppErrorOptions {
  metadata?: Record<string, unknown>;
  severity?: ErrorSeverity;
  cause?: Error;
}

/**
 * Base error class for all application errors.
 * Provides consistent structure with metadata and severity.
 */
export class AppError extends Error {
  readonly metadata: Record<string, unknown>;
  readonly severity: ErrorSeverity;

  constructor(message: string, options: AppErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = 'AppError';
    this.metadata = options.metadata ?? {};
    this.severity = options.severity ?? ErrorSeverity.Error;

    // Maintains proper stack trace in V8 environments
    const ErrorWithCapture = Error as typeof Error & {
      captureStackTrace?: (obj: object, fn: unknown) => void;
    };
    ErrorWithCapture.captureStackTrace(this, this.constructor);
  }
}
