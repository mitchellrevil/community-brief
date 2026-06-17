/**
 * Analytics API type definitions
 * 
 * These types define the shape of analytics data returned by the backend.
 * For backend sources, see: backend_app/app/services/analytics_service.py
 */

/**
 * Individual analytics event record
 */
export interface AnalyticsRecord {
  id: string;
  user_id: string;
  timestamp: string;
  job_id?: string;
  email?: string;
  type?: string;
  event_type?: string;
  audio_duration_minutes?: number;
  audio_duration_seconds?: number;
  file_name?: string;
  file_extension?: string;
  prompt_category_id?: string;
  prompt_subcategory_id?: string;
  partition_key?: string;
  _rid?: string;
  _self?: string;
  _etag?: string;
  _attachments?: string;
  _ts?: number;
}

/**
 * Prompt usage statistics
 */
export interface PromptStats {
  prompt_id: string;
  total_jobs: number;
  total_minutes: number;
}

export interface AnalyticsUserAggregate {
  user_id: string;
  email?: string;
  total_jobs: number;
  total_minutes: number;
}

/**
 * Recent job summary for analytics
 */
export interface RecentJobSummary {
  id: string;
  job_id?: string;
  user_id: string;
  email?: string;
  timestamp: string;
  file_name?: string;
  audio_duration_minutes?: number;
  prompt_id?: string;
}

/**
 * Analytics overview summary
 */
export interface AnalyticsOverview {
  total_users: number;
  active_users: number;
  total_jobs: number;
  total_transcription_minutes: number;
  peak_active_users: number;
}

/**
 * Analytics trends data
 */
export interface AnalyticsTrends {
  daily_activity: Record<string, number>;
  daily_transcription_minutes: Record<string, number>;
  daily_active_users: Record<string, number>;
  user_growth: Record<string, number>;
  job_completion_rate: number;
}

/**
 * Usage statistics breakdown
 */
export interface AnalyticsUsage {
  transcription_methods: Record<string, number>;
  file_vs_text_ratio: { files: number; text: number };
  peak_hours: Record<string, number>;
}

/**
 * Inner analytics data structure
 */
export interface AnalyticsData {
  records: Array<AnalyticsRecord>;
  users?: Array<AnalyticsUserAggregate>;
  total_minutes: number;
  total_jobs: number;
  active_users?: number;
  total_users?: number;
  peak_active_users?: number;
  prompts?: Array<PromptStats>;
  unique_prompt_count?: number;
  recent_jobs?: Array<RecentJobSummary>;
  has_historical_data?: boolean;
  latest_available_timestamp?: string | null;
  overview?: AnalyticsOverview;
  trends?: AnalyticsTrends;
  usage?: AnalyticsUsage;
  _is_mock_data?: boolean;
  _mock_reason?: string;
}

/**
 * System-wide analytics response from the system analytics endpoint.
 */
export interface SystemAnalytics {
  period_days: number;
  start_date: string;
  end_date: string;
  active_users?: number;
  peak_active_users?: number;
  analytics: AnalyticsData;
}

/**
 * User minutes record for individual usage tracking
 */
export type UserMinuteRecord = {
  job_id: string;
  timestamp: string;
  audio_duration_minutes: number;
  event_type?: string;
  file_name?: string;
  prompt_category_id?: string;
  prompt_subcategory_id?: string;
};

/**
 * User minutes response 
 */
export type UserMinutesResponse = {
  user_id: string;
  period_days: number;
  start_date: string;
  end_date: string;
  total_minutes: number;
  total_records: number;
  records: Array<UserMinuteRecord>;
};

/**
 * Admin session record
 */
export type AdminSessionRecord = {
  id: string;
  user_id: string;
  user_email?: string;
  status: string;
  created_at: string;
  last_activity?: string;
  last_heartbeat?: string;
  ended_at?: string;
  end_reason?: string;
  ip_address?: string;
  ip_addresses?: Array<string>;
  activity_count?: number;
  total_requests?: number;
  duration_minutes?: number;
};

export type SessionRecord = AdminSessionRecord;

/**
 * Admin sessions response
 */
export type AdminSessionsResponse = {
  period_days: number;
  start_date?: string;
  end_date?: string;
  summary: {
    total_sessions: number;
    active_sessions: number;
    expired_sessions: number;
    closed_sessions: number;
  };
  items: Array<AdminSessionRecord>;
  total: number;
  limit: number;
  offset: number;
};

/**
 * Active users response
 */
export interface ActiveUsersResponse {
  status: string;
  data: {
    active_users: Array<string>;
    count: number;
    period_minutes: number;
    timestamp: string;
  };
}

/**
 * User session duration response
 */
export interface UserSessionDurationResponse {
  status: string;
  data: {
    user_id: string;
    total_session_duration_minutes: number;
    period_days: number;
    timestamp: string;
  };
}

/**
 * Analytics event tracking request
 */
export interface AnalyticsEventRequest {
  event_type: string;
  metadata?: Record<string, unknown>;
  job_id?: string;
}

/**
 * Analytics event tracking response
 */
export interface AnalyticsEventResponse {
  status: string;
  event_id?: string;
  message: string;
}
