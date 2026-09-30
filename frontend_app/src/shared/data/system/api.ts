import { httpClient } from "@/shared/api/client/httpClient";
import { SYSTEM_HEALTH_API } from "@/shared/api/constants";

/**
 * System health metrics from backend services.
 */
export interface SystemHealthMetrics {
  /** API response time in milliseconds */
  api_response_time_ms: number;
  /** Database query response time in milliseconds */
  database_response_time_ms: number;
  /** Memory usage as percentage (0-100) */
  memory_usage_percentage: number;
  /** Azure Storage response time in milliseconds */
  storage_response_time_ms: number;
  /** System uptime as percentage (0-100) */
  uptime_percentage: number;
  /** Current number of active connections */
  active_connections: number;
  /** Disk usage as percentage (0-100) */
  disk_usage_percentage: number;
}

/**
 * Complete system health response from the API.
 */
export interface SystemHealthResponse {
  /** Overall system status */
  status: string;
  /** Timestamp of the health check */
  timestamp: string;
  /** Detailed performance metrics */
  metrics: SystemHealthMetrics;
  /** Status of individual services */
  services: Record<string, string>;
}

/**
 * Fetches system health status and metrics.
 *
 * Provides real-time health information about the backend services
 * including response times, resource usage, and service statuses.
 *
 * @returns {Promise<SystemHealthResponse>} System health data
 *
 * @throws {ApiError} When the API request fails
 * @throws {NetworkError} When the network is unavailable
 *
 * @example
 * ```tsx
 * import { getSystemHealth } from '@/shared/data/system/api';
 *
 * async function HealthMonitor() {
 *   const health = await getSystemHealth();
 *   console.log(`API latency: ${health.metrics.api_response_time_ms}ms`);
 *   console.log(`Status: ${health.status}`);
 * }
 * ```
 *
 * @see {@link SystemHealthResponse} for response structure
 */
export async function getSystemHealth(): Promise<SystemHealthResponse> {
  const response = await httpClient.get(SYSTEM_HEALTH_API);
  return response.data;
}

