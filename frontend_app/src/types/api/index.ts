/**
 * API Type Definitions
 * 
 * Central export for all API-related TypeScript types.
 * Import from '@/types/api' for shared types across the frontend.
 */

// Common types
export type { PaginatedResponse } from './common';

// Analytics types
export type {
  AnalyticsRecord,
  AnalyticsUserAggregate,
  PromptStats,
  RecentJobSummary,
  AnalyticsOverview,
  AnalyticsTrends,
  AnalyticsUsage,
  AnalyticsData,
  SystemAnalytics,
  UserMinuteRecord,
  UserMinutesResponse,
  AdminSessionRecord,
  SessionRecord,
  AdminSessionsResponse,
  ActiveUsersResponse,
  UserSessionDurationResponse,
  AnalyticsEventRequest,
  AnalyticsEventResponse,
} from './analytics';

// Audio recordings types
export type {
  AnalysisAttempt,
  JobStatus,
  AudioRecording,
  UploadResponse,
  JobDeleteResponse,
  DeletedJobsAdminResponse,
  JobShareRequest,
  JobShareResponse,
  SharedUserInfo,
  SharedJobsResponse,
  JobSharingInfo,
  AnalysisRefinementRequest,
  AnalysisRefinementResponse,
  RefinementHistoryEntry,
  RefinementHistoryResponse,
  ReprocessRequest,
  ReprocessResponse,
} from './audio-recordings';
