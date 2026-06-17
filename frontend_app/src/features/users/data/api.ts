import type { SessionRecord } from "@/types/api";
import type { PermissionLevel } from "@/types/permissions";
import { httpClient } from "@/shared/api/client/httpClient";
import {
  EXPORT_USERS_API,
  USER_ANALYTICS_API, USER_MANAGEMENT_API 
} from "@/shared/api/constants";

/**
 * Users API Module
 *
 * Provides functions for user management including:
 * - Fetching users with pagination and filters
 * - User CRUD operations
 * - Permission management
 * - User analytics and session data
 * - Export capabilities
 *
 * @module api/users
 *
 * @example
 * ```tsx
 * import {
 *   fetchAllUsersPaginated,
 *   updateUserPermission,
 *   getUserDetails,
 * } from '@/features/users/data/api';
 *
 * const users = await fetchAllUsersPaginated(50, 0);
 * await updateUserPermission('user-123', 'EDITOR');
 * const details = await getUserDetails('user-123');
 * ```
 */

/**
 * User data structure.
 */
export type User = {
  id: string;
  name: string;
  full_name?: string | null;
  email: string;
  permission: PermissionLevel;
  transcription_method?: "AZURE_AI_SPEECH" | "GPT4O_AUDIO";
  date?: string;
  business_unit_ids?: Array<string>;
  business_unit_names?: Array<string>;
};

export interface PaginatedUsersResponse {
  users: Array<User>;
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
  status?: number;
}

export interface UserSearchResult {
  id: string;
  email: string;
  name?: string;
  // API may return either permission or permission_level depending on endpoint
  // Normalize both to the PermissionLevel enum for type safety in the UI
  permission?: PermissionLevel;
  permission_level?: PermissionLevel;
}

export interface UserSearchResponse {
  status: string;
  users: Array<UserSearchResult>;
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

export interface UserAnalytics {
  user_id: string;
  period_days: number;
  start_date: string;
  end_date: string;
  analytics: {
    transcription_stats: {
      total_minutes: number;
      total_jobs: number;
      average_job_duration: number;
    };
    activity_stats: {
      jobs_created: number;
      last_activity: string | null;
    };
    usage_patterns: {
      most_active_hours: Array<number>;
      most_used_transcription_method: string | null;
      file_upload_count: number;
      text_input_count: number;
    };
  };
}

export interface UserDetails {
  id: string;
  email: string;
  full_name: string | null;
  permission: string;
  source: string;
  microsoft_oid: string | null;
  tenant_id: string | null;
  created_at: string;
  last_login: string | null;
  is_active: boolean;
  permission_changed_at: string;
  permission_changed_by: string;
  permission_history: Array<{
    old_permission: string;
    new_permission: string;
    changed_at: string;
    changed_by: string;
  }>;
  updated_at: string;
  analytics?: UserAnalytics["analytics"];
}

/**
 * Fetches all users (non-paginated).
 *
 * @returns {Promise<Array<User>>} All users
 *
 * @throws {ApiError} When the request fails
 * @throws {Error} When response format is invalid
 *
 * @example
 * ```tsx
 * import { fetchAllUsers } from '@/features/users/data/api';
 *
 * const users = await fetchAllUsers();
 * const emails = users.map((u) => u.email);
 * ```
 */
export async function fetchAllUsers(): Promise<Array<User>> {
  const response = await httpClient.get(USER_MANAGEMENT_API);
  const data = response.data;

  if (data.status === 200 && Array.isArray(data.users)) {
    return data.users;
  } else if (Array.isArray(data)) {
    return data;
  } else {
    throw new Error("Invalid response format from server");
  }
}

/**
 * Fetches users with pagination.
 *
 * @param {number} [limit=50] - Maximum items per page
 * @param {number} [offset=0] - Starting offset
 *
 * @returns {Promise<PaginatedUsersResponse>} Paginated users response
 *
 * @throws {ApiError} When the request fails
 *
 * @example
 * ```tsx
 * import { fetchAllUsersPaginated } from '@/features/users/data/api';
 *
 * const page1 = await fetchAllUsersPaginated(25, 0);
 * console.log(`Total users: ${page1.total}`);
 * console.log(`Has more: ${page1.has_more}`);
 * ```
 */
export async function fetchAllUsersPaginated(
  limit: number = 50,
  offset: number = 0
): Promise<PaginatedUsersResponse> {
  const response = await httpClient.get(USER_MANAGEMENT_API, {
    params: { limit, offset },
  });
  const data = response.data;

  if (data.users && typeof data.total === "number") {
    return {
      users: Array.isArray(data.users) ? data.users : [],
      total: data.total,
      limit: data.limit || limit,
      offset: data.offset || offset,
      has_more: data.has_more !== undefined ? data.has_more : false,
      status: data.status,
    };
  }

  throw new Error("Invalid paginated response format from server");
}

export async function fetchUserByEmail(email: string): Promise<User> {
  const response = await httpClient.get(`${USER_MANAGEMENT_API}/by-email`, {
    params: { email },
  });
  const data = response.data;

  if (data.status !== 200) {
    throw new Error(data.message || "Failed to fetch user by email");
  }
  return data.user;
}

export async function fetchUserById(userId: string): Promise<User> {
  const response = await httpClient.get(`${USER_MANAGEMENT_API}/${userId}`);
  const data = response.data;

  if (data.status !== 200) {
    throw new Error(data.message || "Failed to fetch user");
  }
  return data.user;
}

export async function deleteUser(userId: string): Promise<{ status: number; message: string; data?: any }> {
  const response = await httpClient.delete(`${USER_MANAGEMENT_API}/${userId}`);
  return response.data;
}

/**
 * Updates a user's permission level.
 *
 * @param {string} userId - User to update
 * @param {PermissionLevel} permission - New permission level
 *
 * @returns {Promise<User>} Updated user
 *
 * @throws {ApiError} When the update fails
 *
 * @example
 * ```tsx
 * import { updateUserPermission } from '@/features/users/data/api';
 * import { PermissionLevel } from '@/types/permissions';
 *
 * await updateUserPermission('user-123', PermissionLevel.EDITOR);
 * ```
 */
export async function updateUserPermission(userId: string, permission: PermissionLevel): Promise<User> {
  const response = await httpClient.patch(`${USER_MANAGEMENT_API}/${userId}`, {
    permission,
  });
  return response.data;
}

export async function changeUserPassword(userId: string, newPassword: string): Promise<{ status: number; message: string }> {
  const response = await httpClient.patch(`${USER_MANAGEMENT_API}/${userId}/password`, {
    new_password: newPassword,
  });
  return response.data;
}

export async function updateUserTranscriptionMethod(
  userId: string,
  transcriptionMethod: "AZURE_AI_SPEECH" | "GPT4O_AUDIO"
): Promise<{ status: number; message: string; data: { user_id: string; transcription_method: string; updated_at: string } }> {
  const response = await httpClient.patch(`${USER_MANAGEMENT_API}/${userId}/transcription-method`, {
    transcription_method: transcriptionMethod,
  });
  return response.data;
}

export async function searchUsers(query: string = "", limit: number = 20, offset: number = 0): Promise<UserSearchResponse> {
  const response = await httpClient.get(`${USER_MANAGEMENT_API}/search`, {
    params: { query, limit, offset },
  });
  return response.data;
}

/**
 * Fetches detailed user information with optional analytics.
 *
 * @param {string} userId - User to fetch
 * @param {boolean} [includeAnalytics=true] - Include analytics data
 *
 * @returns {Promise<UserDetails>} Detailed user information
 *
 * @throws {ApiError} When the request fails
 *
 * @example
 * ```tsx
 * import { getUserDetails } from '@/features/users/data/api';
 *
 * const details = await getUserDetails('user-123', true);
 * console.log(`Last login: ${details.last_login}`);
 * console.log(`Permission history: ${details.permission_history.length} changes`);
 * ```
 */
export async function getUserDetails(userId: string, includeAnalytics: boolean = true): Promise<UserDetails> {
  const response = await httpClient.get(`${USER_MANAGEMENT_API}/${userId}/details`, {
    params: { include_analytics: includeAnalytics },
  });
  return response.data;
}

/**
 * Exports users to a CSV file.
 *
 * @param {Object} [filters] - Filter options
 * @param {string} [filters.permission] - Filter by permission level
 * @param {boolean} [filters.is_active] - Filter by active status
 * @param {Object} [filters.date_range] - Filter by date range
 *
 * @returns {Promise<Blob>} CSV file as Blob
 *
 * @throws {ApiError} When export fails
 *
 * @example
 * ```tsx
 * import { exportUsersCSV } from '@/features/users/data/api';
 *
 * const blob = await exportUsersCSV({ permission: 'ADMIN' });
 * const url = URL.createObjectURL(blob);
 * // Trigger download...
 * ```
 */
export async function exportUsersCSV(filters?: {
  permission?: string;
  is_active?: boolean;
  date_range?: { start: string; end: string };
}): Promise<Blob> {
  const response = await httpClient.post(`${EXPORT_USERS_API}/csv`, { filters }, {
    responseType: 'blob'
  });
  return response.data;
}

export async function exportUserDetailsPDF(userId: string, includeAnalytics: boolean = true, days: number = 30): Promise<Blob> {
  const response = await httpClient.get(`${EXPORT_USERS_API}/${userId}/pdf`, {
    params: { include_analytics: includeAnalytics, days },
    responseType: 'blob'
  });
  return response.data;
}


export interface UserAuditLogRecord {
  id: string;
  timestamp: string | null;
  event_type: string;
  resource_type?: string;
  resource_id?: string;
  metadata?: Record<string, any>;
}

export interface UserAuditLogsResponse {
  user_id: string;
  period_days: number;
  start_date: string;
  end_date: string;
  records: Array<UserAuditLogRecord>;
}

export async function getUserAuditLogs(userId: string, days: number = 30): Promise<UserAuditLogsResponse> {
  const response = await httpClient.get(`${USER_ANALYTICS_API}/${userId}/detailed-sessions`, {
    params: { days, include_audit: true },
  });
  return response.data;
}

export interface UserSessionSummaryResponse {
  user_id: string;
  period_days: number;
  session_summary: {
    total_sessions: number;
    active_sessions: number;
    total_activity_events: number;
    total_requests: number;
    average_session_duration: number;
  };
  query_timestamp: string;
}

export interface UserSessionsResponse {
  user_id: string;
  period_days: number;
  start_date?: string;
  end_date?: string;
  summary: {
    total_sessions: number;
    active_sessions: number;
    expired_sessions: number;
    closed_sessions: number;
  };
  items: Array<SessionRecord>;
  total: number;
  limit: number;
  offset: number;
}

export interface UserSessionAnalyticsResponse {
  user_id: string;
  period_days: number;
  total_sessions: number;
  fetched_sessions: number;
  session_timeline: Array<{
    session_id: string;
    start_time: string;
    end_time?: string;
    duration_minutes?: number;
    status?: string;
    activity_count?: number;
    client_info?: {
      browser?: string;
      platform?: string;
      ip_address?: string;
    };
  }>;
  performance_metrics?: {
    total_requests?: number;
    total_activity_events?: number;
    average_session_duration?: number;
    longest_session_duration?: number;
    shortest_session_duration?: number;
    sessions_by_status?: Record<string, number>;
  };
  usage_analytics?: {
    browser_distribution?: Record<string, number>;
    platform_distribution?: Record<string, number>;
  };
}

export interface UserActivityPatternsResponse {
  user_id: string;
  period_days: number;
  activity_patterns: {
    peak_hours: Record<string, number>;
    browser_distribution: Record<string, number>;
    platform_distribution: Record<string, number>;
    session_patterns: Record<string, number>;
  };
  query_timestamp: string;
}

export async function getUserSessionSummary(userId: string, days: number = 30): Promise<UserSessionSummaryResponse> {
  const response = await httpClient.get(`${USER_ANALYTICS_API}/${userId}/session-summary`, {
    params: { days },
  });
  const data = response.data;

  return {
    user_id: data.user_id,
    period_days: data.period_days,
    session_summary: {
      total_sessions: data.summary?.total_sessions ?? 0,
      active_sessions: data.summary?.active_sessions ?? 0,
      total_activity_events: data.summary?.total_activity_events ?? 0,
      total_requests: data.summary?.total_requests ?? 0,
      average_session_duration: data.summary?.average_session_duration ?? 0,
    },
    query_timestamp: data.query_timestamp || new Date().toISOString(),
  };
}

export async function getUserSessions(
  userId: string,
  params: { days?: number; status?: string; limit?: number; offset?: number } = {}
): Promise<UserSessionsResponse> {
  const response = await httpClient.get(`${USER_ANALYTICS_API}/${userId}/sessions`, {
    params: {
      days: params.days ?? 30,
      status: params.status || undefined,
      limit: params.limit ?? 50,
      offset: params.offset ?? 0,
    },
  });
  return response.data;
}

export async function getUserSessionAnalytics(
  userId: string,
  params: { days?: number; limit?: number; offset?: number } = {}
): Promise<UserSessionAnalyticsResponse> {
  const response = await httpClient.get(`${USER_ANALYTICS_API}/${userId}/session-analytics`, {
    params: {
      days: params.days ?? 30,
      limit: params.limit ?? 200,
      offset: params.offset ?? 0,
    },
  });
  return response.data;
}

export async function getUserActivityPatterns(userId: string, days: number = 30): Promise<UserActivityPatternsResponse> {
  const response = await httpClient.get(`${USER_ANALYTICS_API}/${userId}/session-analytics`, {
    params: { days },
  });
  const data = response.data;

  return {
    user_id: data.user_id,
    period_days: data.period_days,
    activity_patterns: {
      peak_hours: data.usage_analytics?.hourly_distribution || {},
      browser_distribution: data.usage_analytics?.browser_distribution || {},
      platform_distribution: data.usage_analytics?.platform_distribution || {},
      session_patterns: {
        brief_sessions: data.engagement_metrics?.brief_sessions || 0,
        medium_sessions: data.engagement_metrics?.medium_active_sessions || 0,
        extended_sessions: data.engagement_metrics?.highly_active_sessions || 0
      }
    },
    query_timestamp: new Date().toISOString()
  };
}



