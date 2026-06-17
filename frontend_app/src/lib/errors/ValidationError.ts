import { AppError  } from './AppError';
import type {AppErrorOptions} from './AppError';

export interface ValidationErrorOptions extends AppErrorOptions {
  fieldErrors?: Record<string, string>;
}

/**
 * Error class for form/input validation errors.
 * Includes field-level error messages.
 */
export class ValidationError extends AppError {
  readonly fieldErrors: Record<string, string>;

  constructor(message: string, options: ValidationErrorOptions = {}) {
    super(message, options);
    this.name = 'ValidationError';
    this.fieldErrors = options.fieldErrors ?? {};
  }
}
