/**
 * Common API types shared across modules
 */

/**
 * Generic paginated response wrapper for list endpoints
 */
export interface PaginatedResponse<T> {
  jobs: Array<T>;
  count: number;
  status: number;
}
