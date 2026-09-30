import type { UserAnalytics } from "@/features/users/data/api";
import type {
  ActiveUsersResponse,
  AdminSessionRecord,
  AdminSessionsResponse,
  AnalyticsEventRequest,
  AnalyticsRecord,
  SessionRecord,
  SystemAnalytics,
  UserMinuteRecord,
  UserMinutesResponse,
  UserSessionDurationResponse,
} from "@/types/api";
import { httpClient } from "@/shared/api/client/httpClient";
import {
  ACTIVE_USERS_API,
  ANALYTICS_API,
  ANALYTICS_DASHBOARD_API,
  EXPORT_SYSTEM_CSV_API,
  EXPORT_SYSTEM_PROMPTS_CSV_API,
  SYSTEM_ANALYTICS_API,
  USER_ANALYTICS_API,
  USER_SESSION_DURATION_API,
} from "@/shared/api/constants";

/**
 * Analytics API Module
 *
 * Provides functions for fetching system and user analytics data including:
 * - User activity metrics and session data
 * - System-wide usage statistics
 * - Real-time active user tracking
 * - Data export capabilities
 *
 * @module api/analytics
 *
 * @example
 * ```tsx
 * import {
 *   getSystemAnalytics,
 *   getUserAnalytics,
 *   getActiveUsers,
 * } from '@/features/analytics/data/api';
 *
 * // Get system-wide analytics
 * const system = await getSystemAnalytics(30);
 *
 * // Get specific user's analytics
 * const user = await getUserAnalytics('user-123', 30);
 *
 * // Get currently active users
 * const active = await getActiveUsers(5);
 * ```
 *
 * @see {@link SystemAnalytics} for analytics data structure
 */

import { downloadArrayBuffer } from "@/shared/api/client/fetchClient";

/**
 * Fetches analytics data for a specific user.
 *
 * @param {string} userId - User to fetch analytics for
 * @param {number} [days=30] - Number of days to include
 *
 * @returns {Promise<UserAnalytics>} User's analytics data
 *
 * @throws {ApiError} When the request fails
 *
 * @example
 * ```tsx
 * import { getUserAnalytics } from '@/features/analytics/data/api';
 *
 * const analytics = await getUserAnalytics('user-123', 30);
 * console.log(`Total jobs: ${analytics.analytics.activity_stats.jobs_created}`);
 * ```
 */
export async function getUserAnalytics(userId: string, days: number = 30): Promise<UserAnalytics> {
  const response = await httpClient.get(`${USER_ANALYTICS_API}/${userId}/analytics`, {
    params: { days },
  });
  return normalizeUserAnalytics(response.data, userId, days);
}

function normalizeUserAnalytics(data: Partial<UserAnalytics> | undefined, userId: string, days: number): UserAnalytics {
  return {
    user_id: data?.user_id ?? userId,
    period_days: data?.period_days ?? days,
    start_date: data?.start_date ?? "",
    end_date: data?.end_date ?? "",
    analytics: {
      transcription_stats: {
        total_minutes: data?.analytics?.transcription_stats.total_minutes ?? 0,
        total_jobs: data?.analytics?.transcription_stats.total_jobs ?? 0,
        average_job_duration: data?.analytics?.transcription_stats.average_job_duration ?? 0,
      },
      activity_stats: {
        jobs_created: data?.analytics?.activity_stats.jobs_created ?? 0,
        last_activity: data?.analytics?.activity_stats.last_activity ?? null,
      },
      usage_patterns: {
        most_active_hours: data?.analytics?.usage_patterns.most_active_hours ?? [],
        most_used_transcription_method: data?.analytics?.usage_patterns.most_used_transcription_method ?? null,
        file_upload_count: data?.analytics?.usage_patterns.file_upload_count ?? 0,
        text_input_count: data?.analytics?.usage_patterns.text_input_count ?? 0,
      },
    },
  };
}

/**
 * Fetches system-wide analytics.
 *
 * Returns aggregated analytics data across all users and jobs.
 * Requires editor or admin permissions.
 *
 * @param {number | 'total'} [period=30] - Days to include, or 'total' for all-time
 * @param {string} [businessUnitId] - Filter by business unit
 *
 * @returns {Promise<SystemAnalytics>} System analytics data
 *
 * @throws {ApiError} When the request fails
 *
 * @example
 * ```tsx
 * import { getSystemAnalytics } from '@/features/analytics/data/api';
 *
 * // Get last 30 days
 * const monthly = await getSystemAnalytics(30);
 *
 * // Get all-time stats
 * const allTime = await getSystemAnalytics('total');
 *
 * // Filter by business unit
 * const unitStats = await getSystemAnalytics(30, 'unit-123');
 * ```
 *
 * @see {@link SystemAnalytics} for response structure
 */
export async function getSystemAnalytics(period: number | 'total' = 30, businessUnitId?: string): Promise<SystemAnalytics> {
  const params: Record<string, any> = period === 'total' ? {} : { days: period };
  if (businessUnitId) params.business_unit_id = businessUnitId;
  const response = await httpClient.get(SYSTEM_ANALYTICS_API, { params });
  return transformSystemAnalytics(response.data);
}

export async function getAnalyticsDashboard(days: number = 30): Promise<{
  system_analytics: SystemAnalytics;
  permission_stats: Record<string, number>;
  period_days: number;
  generated_at: string;
}> {
  const response = await httpClient.get(ANALYTICS_DASHBOARD_API, {
    params: { days },
  });
  return response.data;
}

export async function getUserMinutes(userId: string, days: number = 30): Promise<UserMinutesResponse> {
  const response = await httpClient.get(`${USER_ANALYTICS_API}/${userId}/minutes`, {
    params: { days },
  });
  return response.data;
}

export async function getAdminSessions(params: {
  days?: number;
  status?: string;
  userId?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<AdminSessionsResponse> {
  const response = await httpClient.get(`${ANALYTICS_API}/sessions`, {
    params: {
      days: params.days ?? 30,
      status: params.status || undefined,
      user_id: params.userId || undefined,
      limit: params.limit ?? 100,
      offset: params.offset ?? 0,
    },
  });
  return response.data;
}

/**
 * Fetches currently active users.
 *
 * Returns users who have been active within the specified time window.
 *
 * @param {number} [minutes=5] - Activity window in minutes
 *
 * @returns {Promise<ActiveUsersResponse>} Active users data
 *
 * @throws {ApiError} When the request fails
 *
 * @example
 * ```tsx
 * import { getActiveUsers } from '@/features/analytics/data/api';
 *
 * const active = await getActiveUsers(5);
 * console.log(`${active.active_count} users active in last 5 minutes`);
 * ```
 */
export async function getActiveUsers(minutes: number = 5): Promise<ActiveUsersResponse> {
  const response = await httpClient.get(ACTIVE_USERS_API, {
    params: { minutes },
  });
  return response.data;
}

export async function getUserSessionDuration(userId: string, days: number = 1): Promise<UserSessionDurationResponse> {
  const response = await httpClient.get(`${USER_SESSION_DURATION_API}/${userId}`, {
    params: { days },
  });
  return response.data;
}

export function transformSystemAnalytics(data: SystemAnalytics): SystemAnalytics {
  // Defensive: backend may return no analytics object in some edge cases - return a safe default
  if (!(data as any).analytics) {
    const endDate = data.end_date;
    const startDate = data.start_date;
    const backendActive = (data as any)?.active_users ?? 0;
    const backendPeak = (data as any)?.peak_active_users ?? 0;

    return {
      ...data,
      active_users: backendActive,
      peak_active_users: backendPeak,
      start_date: startDate,
      end_date: endDate,
      analytics: {
        records: [],
        total_minutes: 0,
        total_jobs: 0,
        active_users: backendActive,
        total_users: 0,
        peak_active_users: backendPeak,
        prompts: [],
        unique_prompt_count: 0,
        recent_jobs: [],
        overview: {
          total_users: 0,
          active_users: backendActive,
          total_jobs: 0,
          total_transcription_minutes: 0,
          peak_active_users: backendPeak,
        },
        trends: {
          daily_activity: {},
          daily_transcription_minutes: {},
          daily_active_users: {},
          user_growth: {},
          job_completion_rate: 0
        },
        usage: {
          transcription_methods: {},
          file_vs_text_ratio: { files: 0, text: 0 },
          peak_hours: {}
        },
        _is_mock_data: true,
        _mock_reason: "missing analytics from backend"
      }
    };
  }

  const records = data.analytics.records;
  
  const uniqueUsers = new Set(records.map(r => r.user_id));
  
  const dailyActivity: Record<string, number> = {};
  const dailyMinutes: Record<string, number> = {};
  const dailyActiveUsers: Record<string, number> = {};
  
  const startDate = new Date(data.start_date);
  const endDate = new Date(data.end_date);
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    dailyActivity[dateStr] = 0;
    dailyMinutes[dateStr] = 0;
    dailyActiveUsers[dateStr] = 0;
  }
  
  // Explicit runtime check for presence of record-level analytics data.
  if (records.length > 0) {
    records.forEach(record => {
      const date = record.timestamp.split('T')[0];
      dailyActivity[date] = dailyActivity[date] + 1;
      const minutes = typeof record.audio_duration_minutes === 'number' ? record.audio_duration_minutes : 0;
      dailyMinutes[date] = dailyMinutes[date] + minutes;
    });
  } else {
    const endDateStr = new Date(data.end_date).toISOString().split('T')[0];
    dailyActivity[endDateStr] = data.analytics.total_jobs;
    dailyMinutes[endDateStr] = data.analytics.total_minutes;
  }
  
  const usersByDate: Record<string, Set<string> | undefined> = {};

  if (records.length > 0) {
    records.forEach(record => {
      const date = record.timestamp.split('T')[0];
      if (!usersByDate[date]) usersByDate[date] = new Set();
      usersByDate[date].add(record.user_id);
    });

    Object.entries(usersByDate).forEach(([date, users]) => {
      if (!users) return;
      dailyActiveUsers[date] = users.size;
    });
  } else {
    const endDateStr = new Date(data.end_date).toISOString().split('T')[0];
    dailyActiveUsers[endDateStr] = uniqueUsers.size;
  }
  
  const backendActive = (data as any).active_users ?? (data.analytics as any).active_users;
  const backendPeak = (data as any).peak_active_users ?? (data.analytics as any).peak_active_users;
  const computedPeak = Math.max(...Object.values(dailyActiveUsers), 0);
  const activeUsersFinal = typeof backendActive === 'number' ? backendActive : (data.analytics as any).overview?.active_users ?? uniqueUsers.size;
  const peakActiveFinal = typeof backendPeak === 'number' ? backendPeak : computedPeak;

  const result = {
    ...data,
    active_users: activeUsersFinal,
    peak_active_users: peakActiveFinal,
    analytics: {
      ...data.analytics,
      active_users: activeUsersFinal,
      peak_active_users: peakActiveFinal,
      overview: {
        total_users: uniqueUsers.size,
        active_users: activeUsersFinal,
        total_jobs: data.analytics.total_jobs,
        total_transcription_minutes: data.analytics.total_minutes,
        peak_active_users: peakActiveFinal
      },
      trends: {
        daily_activity: dailyActivity,
        daily_transcription_minutes: dailyMinutes,
        daily_active_users: dailyActiveUsers,
        user_growth: {},
        job_completion_rate: 100
      },
      usage: {
        transcription_methods: { upload: data.analytics.total_jobs },
        file_vs_text_ratio: { files: data.analytics.total_jobs, text: 0 },
        peak_hours: {}
      }
    }
  };

  return result;
}

export async function trackAnalyticsEvent(eventData: AnalyticsEventRequest): Promise<{ status: string; event_id?: string; message: string }> {
  try {
    const response = await httpClient.post(`${ANALYTICS_API}/event`, eventData);
    return response.data;
  } catch (error) {
    console.debug("Analytics tracking error:", error);
    return { status: "error", message: "Analytics tracking failed" };
  }
}

/**
 * Exports system analytics as a CSV file.
 *
 * @param {number} [days=365] - Number of days to include
 * @param {string} [businessUnitId] - Filter by business unit
 *
 * @returns {Promise<Blob>} CSV file as Blob
 *
 * @throws {ApiError} When export fails
 *
 * @example
 * ```tsx
 * import { exportSystemAnalyticsCSV } from '@/features/analytics/data/api';
 *
 * const blob = await exportSystemAnalyticsCSV(365);
 * const url = URL.createObjectURL(blob);
 * // Trigger download...
 * ```
 */
export async function exportSystemAnalyticsCSV(days: number = 365, businessUnitId?: string): Promise<Blob> {
  let url = `${EXPORT_SYSTEM_CSV_API}?days=${days}`;
  if (businessUnitId) {
    url += `&business_unit_id=${businessUnitId}`;
  }

  const buffer = await downloadArrayBuffer(url);
  return new Blob([buffer], { type: 'text/csv' });
}

export async function exportPromptAnalyticsCSV(days: number = 30, businessUnitId?: string): Promise<string> {
  let url = `${EXPORT_SYSTEM_PROMPTS_CSV_API}?days=${days}`;
  if (businessUnitId) {
    url += `&business_unit_id=${businessUnitId}`;
  }

  const response = await httpClient.get<string>(url, {
    responseType: 'text',
  });

  return response.data;
}



