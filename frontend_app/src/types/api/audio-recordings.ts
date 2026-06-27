/**
 * Audio recordings API type definitions
 *
 * These types define the shape of job/recording data from the backend.
 * For backend sources, see: backend_app/app/services/job_service.py
 */

// Re-export PaginatedResponse from common for convenience
export type { PaginatedResponse } from "./common";

/**
 * Analysis attempt record for multi-attempt analysis
 */
export interface AnalysisAttempt {
  attempt?: number;
  analysis_file_path: string;
  created_at?: string;
  analysis_instructions?: string | null;
  prompt_category_id?: string | null;
  prompt_subcategory_id?: string | null;
  created_by?: string | null;
}

/**
 * Job status values
 */
export type JobStatus =
  | "uploaded"
  | "pending"
  | "processing"
  | "transcribing"
  | "transcribed"
  | "analysing"
  | "completed"
  | "error"
  | "failed";

/**
 * Audio recording/job entity
 */
export interface AudioRecording {
  id: string;
  user_id: string;
  file_path: string;
  transcription_file_path: string | null;
  analysis_file_path: string | null;
  analysis_attempts?: Array<AnalysisAttempt>;
  analysis_latest_attempt?: number | null;
  analysis_in_progress?: boolean;
  prompt_category_id: string;
  prompt_subcategory_id: string;
  status: JobStatus;
  transcription_id: string | null;
  created_at: number;
  updated_at: number;
  type: string;
  _rid: string;
  _self: string;
  _etag: string;
  _attachments: string;
  _ts: number;
  // Optional fields that may be present
  displayname?: string;
  display_name?: string;
  audio_duration_seconds?: number;
  audio_duration_minutes?: number;
  pre_session_form_data?: Record<string, unknown>;
  is_deleted?: boolean;
  deleted_at?: number;
  // Share metadata (present for shared job responses)
  shared_by_email?: string;
  shared_at?: number; // epoch ms
  permission_level?: string;
  message?: string;
  shared_by_name?: string;
  shared_with_count?: number;
  shared_with?: Array<SharedUserInfo>;
}

/**
 * Upload response from job creation
 */
export interface UploadResponse {
  job_id?: string;
  status: number | string;
  message: string;
  queued?: boolean;
}

/**
 * Job delete response
 */
export interface JobDeleteResponse {
  status: string;
  message: string;
}

/**
 * Admin response for deleted jobs list
 */
export interface DeletedJobsAdminResponse {
  status: string;
  message?: string;
  deleted_jobs: Array<AudioRecording>;
  jobs?: Array<AudioRecording>;
  total_count: number;
  limit?: number;
  offset?: number;
  // For normalized response from getDeletedJobs function
  count?: number;
}

/**
 * Job share request
 */
export interface JobShareRequest {
  shared_user_email: string;
  permission_level: "view" | "edit" | "admin";
  message?: string;
}

/**
 * Job share response
 */
export interface JobShareResponse {
  status: string;
  message: string;
  shared_job_id: string;
  target_user_id: string;
  permission_level: string;
}

/**
 * Shared user info for job sharing
 */
export interface SharedUserInfo {
  user_id: string;
  user_email: string;
  permission_level: string;
  shared_at: number;
  shared_by: string;
  shared_by_email?: string;
  shared_by_name?: string;
  message?: string;
}

/**
 * Shared jobs response
 */
export interface SharedJobsResponse {
  status: string;
  message: string;
  shared_jobs: Array<AudioRecording>;
  owned_jobs_shared_with_others: Array<AudioRecording>;
}

/**
 * Job sharing info
 */
export interface JobSharingInfo {
  status: string;
  job_id: string;
  is_owner: boolean;
  user_permission: string;
  shared_with: Array<SharedUserInfo>;
  total_shares: number;
}

/**
 * Analysis refinement request
 */
export interface AnalysisRefinementRequest {
  user_request: string;
}

/**
 * Analysis refinement response
 */
export interface AnalysisRefinementResponse {
  status: string;
  message: string;
  response: string;
  refinement_id: string;
  timestamp: number;
}

/**
 * Refinement history entry
 */
export interface RefinementHistoryEntry {
  id: string;
  user_message: string;
  ai_response: string;
  timestamp: number;
  user_id: string;
}

/**
 * Refinement history response
 */
export interface RefinementHistoryResponse {
  status: string;
  job_id: string;
  history: Array<RefinementHistoryEntry>;
  count: number;
}

/**
 * Reprocess job request
 */
export interface ReprocessRequest {
  instructions?: string;
  prompt_category_id?: string;
  prompt_subcategory_id?: string;
  create_new_job?: boolean;
}

/**
 * Reprocess job response
 */
export interface ReprocessResponse {
  status: string;
  message?: string;
  job_id: string;
  new_job_created?: boolean;
  analysis_file_path?: string;
}
