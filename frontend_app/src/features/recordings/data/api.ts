import { BlockBlobClient } from "@azure/storage-blob";
import type { AudioListValues } from "@/shared/schema/audio-list.schema";
import type { AudioUploadMetadata } from "@/types/audio-upload";
import type {
  AnalysisRefinementRequest,
  AnalysisRefinementResponse,
  AudioRecording,
  DeletedJobsAdminResponse,
  JobDeleteResponse,
  JobShareRequest,
  JobShareResponse,
  JobSharingInfo,
  PaginatedResponse,
  RefinementHistoryEntry,
  RefinementHistoryResponse,
  ReprocessRequest,
  ReprocessResponse,
  SharedJobsResponse,
  UploadResponse,
} from "@/types/api";
import { 
  ADMIN_DELETED_JOBS_API, 
  ADMIN_JOB_REPROCESS_BLOB_API,
  ADMIN_PERMANENT_DELETE_API,
  CHAT_ENDPOINTS,
  JOBS_API,
  JOB_REPROCESS_API,
  JOB_STATUS_STREAM_API,
  JOB_TRANSCRIPTION_SPEAKERS_API,
  SHARED_JOBS_API,
  TRANSCRIPTION_API,
  UPLOAD_COMPLETE_API,
  UPLOAD_REQUEST_TOKEN_API,
} from "@/shared/api/constants";
import { fetchWithAuth, streamWithAuth } from "@/shared/api/client/fetchClient";
import { directBackendClient, httpClient } from "@/shared/api/client/httpClient";
import { getDisplayName } from "@/lib/display-name-utils";
import { isOnline } from "@/lib/online-status";
import { queueRecording } from "@/lib/pwa-queue";

/**
 * Audio Recordings API Module
 *
 * Provides functions for managing audio recording jobs including:
 * - Fetching recordings with filters and pagination
 * - Uploading files (direct-to-blob or multipart backend upload)
 * - Soft delete and restore operations
 * - Sharing recordings with other users
 * - Chat/refinement features for analysis
 *
 * @module api/audio-recordings
 *
 * @example
 * ```tsx
 * import {
 *   getAudioRecordings,
 *   uploadFile,
 *   softDeleteJob,
 * } from '@/features/recordings/data/api';
 *
 * // Fetch recordings
 * const recordings = await getAudioRecordings({ status: 'completed' });
 *
 * // Upload a file
 * const result = await uploadFile(file, categoryId, subcategoryId);
 * ```
 *
 * @see {@link AudioRecording} for recording data structure
 * @see {@link ApiError} for error handling
 */

/**
 * Fetches audio recordings with optional filters and pagination.
 *
 * Supports filtering by status, search text, and date ranges.
 * Search is performed client-side on the full result set.
 *
 * @param {Object} [filters] - Filter and pagination options
 * @param {number} [filters.page] - Page number (1-indexed)
 * @param {number} [filters.per_page] - Items per page
 * @param {string} [filters.search] - Search text for display names
 * @param {string} [filters.status] - Filter by job status
 *
 * @returns {Promise<PaginatedResponse<AudioRecording> | Array<AudioRecording>>} Recordings data
 *
 * @throws {ApiError} When the API request fails
 * @throws {NetworkError} When the network is unavailable
 *
 * @example
 * ```tsx
 * import { getAudioRecordings } from '@/features/recordings/data/api';
 *
 * // Fetch all recordings
 * const all = await getAudioRecordings();
 *
 * // Fetch with pagination and filter
 * const page = await getAudioRecordings({
 *   page: 1,
 *   per_page: 25,
 *   status: 'completed',
 *   search: 'meeting notes',
 * });
 * ```
 *
 * @see {@link AudioRecording} for recording data structure
 */
export async function getAudioRecordings(
  filters: AudioListValues & { page?: number; per_page?: number } = {}
): Promise<PaginatedResponse<AudioRecording> | Array<AudioRecording>> {
  const { page, per_page, search, ...filterParams } = filters;
  
  const params: Record<string, any> = {};
  
  Object.entries(filterParams).forEach(([key, value]) => {
    if (typeof value === "string" && value.trim() === "") return;
    params[key] = value;
  });
  
  if (typeof per_page === "number") {
    params.limit = per_page;
  }
  if (typeof search === "string" && search.length > 0) {
    delete params.limit;
    delete params.offset;
  } else if (typeof page === "number" && typeof per_page === "number") {
    params.offset = (page - 1) * per_page;
  }

  const response = await httpClient.get(JOBS_API, { params });
  const data = response.data as PaginatedResponse<AudioRecording>;

  if (typeof search === "string" && search.length > 0) {
    const searchLower = search.toLowerCase();
    const filteredJobs = data.jobs.filter((job) => {
      const displayName = getDisplayName(job);
      return displayName.toLowerCase().includes(searchLower) || 
             job.id.toLowerCase().includes(searchLower);
    });

    const totalFiltered = filteredJobs.length;
    const startIndex = page && per_page ? (page - 1) * per_page : 0;
    const endIndex = page && per_page ? startIndex + per_page : filteredJobs.length;
    const paginatedJobs = filteredJobs.slice(startIndex, endIndex);

    return {
      jobs: paginatedJobs,
      count: totalFiltered,
      status: data.status
    };
  }

  return data;
}

/**
 * Fetches the transcription text for a recording.
 *
 * @param {string} id - The recording job ID
 *
 * @returns {Promise<string>} The transcription text content
 *
 * @throws {ApiError} When the recording is not found or not transcribed
 * @throws {NetworkError} When the network is unavailable
 *
 * @example
 * ```tsx
 * import { getAudioTranscription } from '@/features/recordings/data/api';
 *
 * const transcription = await getAudioTranscription('job-123');
 * console.log(transcription);
 * ```
 */
export async function getAudioTranscription(id: string) {
  const url = TRANSCRIPTION_API(id);
  const response = await httpClient.get<string>(url, { responseType: 'text' });
  return response.data || '';
}

export async function updateTranscriptionSpeakerNames(
  jobId: string,
  speakerNames: Record<string, string>
): Promise<{ status: number; transcription: string }> {
  const response = await httpClient.patch(JOB_TRANSCRIPTION_SPEAKERS_API(jobId), {
    speaker_names: speakerNames,
  });
  return response.data;
}

/**
 * Requests analysis refinement for a recording.
 *
 * Allows users to request modifications to the AI analysis
 * based on their feedback or additional instructions.
 *
 * @param {string} jobId - The recording job ID
 * @param {AnalysisRefinementRequest} request - Refinement details
 *
 * @returns {Promise<AnalysisRefinementResponse>} Refinement result
 *
 * @throws {ApiError} When the request fails
 *
 * @example
 * ```tsx
 * import { refineAnalysis } from '@/features/recordings/data/api';
 *
 * const result = await refineAnalysis('job-123', {
 *   instruction: 'Focus more on action items',
 * });
 * ```
 */
export async function refineAnalysis(
  jobId: string,
  request: AnalysisRefinementRequest
): Promise<AnalysisRefinementResponse> {
  const response = await httpClient.post(
    `${JOBS_API}/${jobId}/refinements`,
    request
  );
  return response.data;
}

/**
 * Reprocesses a recording job with new parameters.
 *
 * Re-runs transcription and/or analysis with different settings.
 *
 * @param {string} jobId - The recording job ID
 * @param {ReprocessRequest} request - Reprocessing options
 *
 * @returns {Promise<ReprocessResponse>} Reprocessing result
 *
 * @throws {ApiError} When reprocessing fails
 *
 * @example
 * ```tsx
 * import { reprocessJob } from '@/features/recordings/data/api';
 *
 * const result = await reprocessJob('job-123', {
 *   use_gpt4o_audio: true,
 * });
 * ```
 */
export async function reprocessJob(
  jobId: string,
  request: ReprocessRequest
): Promise<ReprocessResponse> {
  const response = await httpClient.post(JOB_REPROCESS_API(jobId), request);
  return response.data;
}

/**
 * Admin endpoint to retry/reprocess a job by resubmitting the blob.
 * 
 * This downloads the original blob, reuploads it, resets the job to 'uploaded' status,
 * clears all analysis data, and lets the Azure Functions blob trigger handle reprocessing.
 * Results in a single attempt from scratch (full retranscription + analysis).
 * 
 * @param {string} jobId - The job ID to retry
 * @returns {Promise<ReprocessResponse>} Reprocessing result
 * 
 * @throws {ApiError} When reprocessing fails
 * 
 * @example
 * ```typescript
 * import { adminReprocessJob } from '@/features/recordings/data/api';
 * 
 * const result = await adminReprocessJob('job-123');
 * ```
 */
export async function adminReprocessJob(jobId: string): Promise<ReprocessResponse> {
  const response = await httpClient.post(ADMIN_JOB_REPROCESS_BLOB_API(jobId), {});
  return response.data;
}

export async function getRefinementHistory(
  jobId: string
): Promise<RefinementHistoryResponse> {
  const response = await httpClient.get(
    `${JOBS_API}/${jobId}/refinements`
  );
  return response.data;
}

export async function getRefinementSuggestions(jobId: string): Promise<{
  status: string;
  job_id: string;
  suggestions: Array<string>;
}> {
  const response = await httpClient.get(
    `${JOBS_API}/${jobId}/refinements/suggestions`
  );
  return response.data;
}

/**
 * Upload a file using direct-to-blob strategy with automatic fallback to the
 * multipart backend upload.
 *
 * Direct-to-blob flow:
 *   1. Request an upload token to get a SAS URL
 *   2. PUT file directly to Azure Blob Storage via SAS URL
 *   3. Complete the upload so the backend verifies the blob and creates the job
 *
 * Benefits: file transferred once (browser→blob), no backend memory pressure,
 * bypasses Static Web App 30 MB limit, works for files up to 5 TB.
 *
 * @param {File} file - The audio file to upload
 * @param {string} prompt_category_id - Category for the prompt template
 * @param {string} prompt_subcategory_id - Subcategory for the prompt template
 * @param {Record<string, any>} [preSessionFormData] - Pre-session form responses
 * @param {Function} [onProgress] - Progress callback with loaded/total/percentage
 * @param {AudioUploadMetadata} [uploadMetadata] - Additional upload metadata
 *
 * @returns {Promise<UploadResponse>} Upload result with job ID
 *
 * @throws {ApiError} When upload fails (auth, server error)
 * @throws {NetworkError} When offline (will queue for later if PWA enabled)
 *
 * @example
 * ```tsx
 * import { uploadFile } from '@/features/recordings/data/api';
 *
 * const result = await uploadFile(
 *   audioFile,
 *   'category-123',
 *   'subcategory-456',
 *   { meetingType: 'standup' },
 *   (progress) => setProgress(progress.percentage)
 * );
 *
 * if (result.queued) {
 *   console.log('Offline - queued for later upload');
 * } else {
 *   console.log(`Job created: ${result.job_id}`);
 * }
 * ```
 *
 * @see {@link UploadResponse} for response structure
 * @see {@link queueRecording} for offline queue handling
 */
export async function uploadFile(
  file: File,
  prompt_category_id: string,
  prompt_subcategory_id: string,
  preSessionFormData?: Record<string, any>,
  onProgress?: (progress: { loaded: number; total: number; percentage: number }) => void,
  uploadMetadata?: AudioUploadMetadata,
): Promise<UploadResponse> {
  try {
    return await uploadFileDirect(
      file,
      prompt_category_id,
      prompt_subcategory_id,
      preSessionFormData,
      onProgress,
      uploadMetadata
    );
  } catch (directError: any) {
    // If the direct upload infrastructure isn't available, use the multipart
    // backend upload path.
    const status = directError?.response?.status;
    if (status === 404 || status === 405) {
      console.warn('[upload] Direct upload not available, using multipart upload');
      return uploadFileMultipart(file, prompt_category_id, prompt_subcategory_id, preSessionFormData, onProgress);
    }

    // Check for Network Error (Offline)
    const isNetworkError =
      (directError.message && directError.message.includes('Network Error')) ||
      (directError.code && (directError.code === 'ERR_NETWORK' || directError.code === 'ECONNABORTED'));

    if (isNetworkError) {
      try {
        const offline = !(await isOnline());

        if (offline) {
          await queueRecording(file, {
            categoryId: prompt_category_id,
            subcategoryId: prompt_subcategory_id,
            preSessionData: preSessionFormData,
            timestamp: Date.now(),
            uploadMetadata,
          });

          return {
            job_id: `queued-${Date.now()}`,
            status: "queued",
            message: "Recording queued for upload",
            queued: true,
          };
        }
      } catch (_queueError) {
        // fall through
      }
    }

    // For other errors (auth, server error, rate-limit) propagate as-is
    throw directError;
  }
}

/**
 * Direct-to-blob upload: request a SAS token, upload straight to Azure Storage,
 * then notify the backend to create the job record.
 */
async function uploadFileDirect(
  file: File,
  prompt_category_id: string,
  prompt_subcategory_id: string,
  preSessionFormData?: Record<string, any>,
  onProgress?: (progress: { loaded: number; total: number; percentage: number }) => void,
  uploadMetadata?: AudioUploadMetadata,
): Promise<UploadResponse> {
  // --- Step 1: Request a write-only SAS URL from the backend -------------
  const tokenResponse = await httpClient.post(UPLOAD_REQUEST_TOKEN_API, {
    filename: file.name,
    content_type: file.type || undefined,
    file_size: file.size,
  });
  const { sas_url, blob_url } = tokenResponse.data as {
    sas_url: string;
    blob_url: string;
    blob_name: string;
    container: string;
    expiry: string;
    filename: string;
  };

  // --- Step 2: Upload directly to Azure Blob Storage ---------------------
  const blockBlobClient = new BlockBlobClient(sas_url);

  await blockBlobClient.uploadData(file, {
    blobHTTPHeaders: {
      blobContentType: file.type || "application/octet-stream",
    },
    blockSize: 4 * 1024 * 1024, // 4 MB blocks
    concurrency: 4,
    onProgress: (ev) => {
      if (onProgress) {
        const percentage = file.size > 0 ? (ev.loadedBytes / file.size) * 100 : 0;
        onProgress({
          loaded: ev.loadedBytes,
          total: file.size,
          percentage,
        });
      }
    },
  });

  // --- Step 3: Notify backend to create the job record -------------------
  const completePayload: Record<string, any> = {
    blob_url,
    filename: file.name,
    prompt_category_id,
    prompt_subcategory_id,
    pre_session_form_data: preSessionFormData && Object.keys(preSessionFormData).length > 0
      ? preSessionFormData
      : undefined,
  };

  if (uploadMetadata?.audio_duration_seconds !== undefined) {
    completePayload.audio_duration_seconds = uploadMetadata.audio_duration_seconds;
  }
  if (uploadMetadata?.audio_duration_minutes !== undefined) {
    completePayload.audio_duration_minutes = uploadMetadata.audio_duration_minutes;
  }
  if (uploadMetadata?.recording_settings) {
    completePayload.recording_settings = uploadMetadata.recording_settings;
  }

  const completeResponse = await httpClient.post(UPLOAD_COMPLETE_API, completePayload);

  const rawData = completeResponse.data;
  if (rawData && !rawData.job_id && rawData.id) {
    rawData.job_id = rawData.id;
  }
  return rawData as UploadResponse;
}

/**
 * Multipart upload: sends the entire file through the backend API.
 */
async function uploadFileMultipart(
  file: File,
  prompt_category_id: string,
  prompt_subcategory_id: string,
  preSessionFormData?: Record<string, any>,
  onProgress?: (progress: { loaded: number; total: number; percentage: number }) => void,
): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("prompt_category_id", prompt_category_id);
  formData.append("prompt_subcategory_id", prompt_subcategory_id);

  if (preSessionFormData && Object.keys(preSessionFormData).length > 0) {
    formData.append("pre_session_form_data", JSON.stringify(preSessionFormData));
  }

  try {
    const response = await directBackendClient.post(JOBS_API, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const percentage = (progressEvent.loaded / progressEvent.total) * 100;
          onProgress({
            loaded: progressEvent.loaded,
            total: progressEvent.total,
            percentage,
          });
        }
      },
    });

    const rawData = response.data;
    if (rawData && !rawData.job_id && rawData.id) {
      rawData.job_id = rawData.id;
    }
    return rawData as UploadResponse;
  } catch (error: any) {
    const isNetworkError =
      (error.message && error.message.includes('Network Error')) ||
      (error.code && (error.code === 'ERR_NETWORK' || error.code === 'ECONNABORTED'));

    if (isNetworkError) {
      try {
        const offline = !(await isOnline());

        if (offline) {
          await queueRecording(file, {
            categoryId: prompt_category_id,
            subcategoryId: prompt_subcategory_id,
            preSessionData: preSessionFormData,
            timestamp: Date.now(),
          });

          return {
            job_id: `queued-${Date.now()}`,
            status: "queued",
            message: "Recording queued for upload",
            queued: true,
          };
        }
      } catch (_queueError) {
        // fall through
      }
    }

    throw error;
  }
}

/**
 * Soft deletes a recording job.
 *
 * Marks the job as deleted but keeps it recoverable for a period.
 * Use `permanentDeleteJob` for permanent deletion.
 *
 * @param {string} jobId - The job ID to delete
 *
 * @returns {Promise<JobDeleteResponse>} Delete confirmation
 *
 * @throws {ApiError} When deletion fails
 *
 * @example
 * ```tsx
 * import { softDeleteJob } from '@/features/recordings/data/api';
 *
 * await softDeleteJob('job-123');
 * ```
 *
 * @see {@link restoreJob} to undo deletion
 * @see {@link permanentDeleteJob} for permanent deletion
 */
export async function softDeleteJob(jobId: string): Promise<JobDeleteResponse> {
  const response = await httpClient.delete(`${JOBS_API}/${jobId}`);
  return response.data;
}

/**
 * Restores a soft-deleted recording job.
 *
 * @param {string} jobId - The job ID to restore
 *
 * @returns {Promise<JobDeleteResponse>} Restore confirmation
 *
 * @throws {ApiError} When restoration fails
 *
 * @example
 * ```tsx
 * import { restoreJob } from '@/features/recordings/data/api';
 *
 * await restoreJob('job-123');
 * ```
 */
export async function restoreJob(jobId: string): Promise<JobDeleteResponse> {
  const response = await httpClient.post(`${JOBS_API}/${jobId}/restore`);
  return response.data;
}

export async function getDeletedJobs(limit: number = 50, offset: number = 0, userId?: string): Promise<DeletedJobsAdminResponse> {
  const params: any = { limit, offset };
  if (userId) {
    params.user_id = userId;
  }
  
  const response = await httpClient.get(ADMIN_DELETED_JOBS_API, { params });
  const data = response.data;

  let jobs: Array<any> = [];
  if (!data) {
    jobs = [];
  } else if (Array.isArray(data)) {
    jobs = data;
  } else if (Array.isArray((data).deleted_jobs)) {
    jobs = (data).deleted_jobs;
  } else if (Array.isArray((data).jobs)) {
    jobs = (data).jobs;
  } else if (Array.isArray((data).items)) {
    jobs = (data).items;
  } else if ((data).data && Array.isArray((data).data.deleted_jobs)) {
    jobs = (data).data.deleted_jobs;
  } else if ((data).data && Array.isArray((data).data.jobs)) {
    jobs = (data).data.jobs;
  } else if ((data).results && Array.isArray((data).results)) {
    jobs = (data).results;
  }

  return {
    status: 'ok',
    message: '',
    count: jobs.length,
    jobs,
    deleted_jobs: jobs,
    total_count: data.total_count || jobs.length,
  };
}

export async function permanentDeleteJob(jobId: string): Promise<JobDeleteResponse> {
  const response = await httpClient.delete(ADMIN_PERMANENT_DELETE_API(jobId));
  return response.data;
}

/**
 * Shares a recording job with another user.
 *
 * @param {string} jobId - The job ID to share
 * @param {JobShareRequest} shareRequest - Share configuration
 *
 * @returns {Promise<JobShareResponse>} Share confirmation
 *
 * @throws {ApiError} When sharing fails (user not found, already shared)
 *
 * @example
 * ```tsx
 * import { shareJob } from '@/features/recordings/data/api';
 *
 * await shareJob('job-123', {
 *   target_user_email: 'colleague@example.com',
 *   permission: 'view',
 * });
 * ```
 *
 * @see {@link unshareJob} to remove sharing
 * @see {@link getJobSharingInfo} to view current shares
 */
export async function shareJob(jobId: string, shareRequest: JobShareRequest): Promise<JobShareResponse> {
  const response = await httpClient.post(`${JOBS_API}/${jobId}/share`, shareRequest);
  return response.data;
}

export async function unshareJob(jobId: string, targetUserEmail: string): Promise<{ status: string; message: string }> {
  const encodedEmail = encodeURIComponent(targetUserEmail);
  const response = await httpClient.delete(`${JOBS_API}/${jobId}/share/${encodedEmail}`);
  return response.data;
}

export async function getSharedJobs(): Promise<SharedJobsResponse> {
  const response = await httpClient.get(SHARED_JOBS_API);
  return response.data;
}

export async function getJobSharingInfo(jobId: string): Promise<JobSharingInfo> {
  const response = await httpClient.get(`${JOBS_API}/${jobId}/sharing`);
  return response.data;
}

export async function fetchAudioBlob(audioURL: string): Promise<Blob> {
  const response = await fetch(audioURL);
  return await response.blob();
}

export async function fetchAudioRecordingsApi() {
  const response = await httpClient.get(JOBS_API);
  return response.data;
}

export async function fetchJobDataApi(filters?: { job_id?: string; status?: string; created_at?: string }) {
  const params: any = {
    job_id: filters?.job_id || "",
    status: filters?.status && filters.status !== "all" ? filters.status : "",
    created_at: filters?.created_at || "",
  };
  const response = await httpClient.get(JOBS_API, { params });
  return response.data.jobs || [];
}

export async function fetchTranscriptionText(url: string): Promise<string> {
  // External blob URLs don't need auth, use httpClient with text response
  const response = await httpClient.get<string>(url, { responseType: 'text' });
  return response.data;
}

export async function fetchRecordingByIdApi(recordingId: string) {
  const response = await httpClient.get(`${JOBS_API}/${recordingId}`);
  return response.data.job || response.data;
}

export async function fetchAllJobsApi(limit: number = 50, offset: number = 0, userId?: string) {
  const params: any = { limit, offset };
  if (userId) {
    params.user_id = userId;
  }
  const response = await httpClient.get(ADMIN_DELETED_JOBS_API.replace('/deleted', ''), { params });
  return response.data;
}

interface AnalysisDocumentUpdateRequest {
  html_content: string;
  format?: string;
}

interface AnalysisDocumentUpdateResponse {
  status: string;
  message: string;
  document_url: string;
  updated_at: string;
}

export async function updateAnalysisDocument(
  jobId: string, 
  textContent: string
): Promise<AnalysisDocumentUpdateResponse> {
  const htmlContent = textContent
    .split('\n\n')
    .map(section => {
      const lines = section.split('\n').filter(line => line.trim());
      if (lines.length === 0) return '';
      const firstLine = lines[0].trim();
      const markdownHeadingMatch = firstLine.match(/^(#+)\s+(.+?)(:?)$/);
      const isMarkdownHeading = !!markdownHeadingMatch;
      const isColonHeading = (
        firstLine.length < 80 &&
        (firstLine.endsWith(':') || firstLine.endsWith('::') || 
         /^[A-Z][A-Z\s]*:*$/.test(firstLine))
      );
      const isHeading = isMarkdownHeading || isColonHeading;
      
      if (isHeading && lines.length > 1) {
        let headingText: string;
        if (markdownHeadingMatch) {
          headingText = markdownHeadingMatch[2].replace(/:+$/, '').trim();
        } else {
          headingText = firstLine.replace(/^#+\s*/, '').replace(/:+$/, '').trim();
        }
        const heading = `<h3>${headingText}</h3>`;
        const contentLines = lines.slice(1);
        const listItems: Array<string> = [];
        const paragraphs: Array<string> = [];
        let currentParagraph = '';
        contentLines.forEach(line => {
          const trimmed = line.trim();
          if (trimmed.startsWith('•') || trimmed.startsWith('-') || /^\d+\./.test(trimmed)) {
            if (currentParagraph) {
              paragraphs.push(`<p>${currentParagraph}</p>`);
              currentParagraph = '';
            }
            const itemText = trimmed.replace(/^([•-]|\d+\.)\s*/, '');
            listItems.push(`<li>${itemText}</li>`);
          } else if (trimmed) {
            if (currentParagraph) {
              currentParagraph += ' ' + trimmed;
            } else {
              currentParagraph = trimmed;
            }
          }
        });
        if (currentParagraph) paragraphs.push(`<p>${currentParagraph}</p>`);
        let html = heading;
        if (paragraphs.length > 0) html += paragraphs.join('');
        if (listItems.length > 0) html += `<ul>${listItems.join('')}</ul>`;
        return html;
      } else {
        const listItems: Array<string> = [];
        const paragraphs: Array<string> = [];
        let currentParagraph = '';
        lines.forEach(line => {
          const trimmed = line.trim();
          if (trimmed.startsWith('•') || trimmed.startsWith('-') || /^\d+\./.test(trimmed)) {
            if (currentParagraph) {
              paragraphs.push(`<p>${currentParagraph}</p>`);
              currentParagraph = '';
            }
            const itemText = trimmed.replace(/^([•-]|\d+\.)\s*/, '');
            listItems.push(`<li>${itemText}</li>`);
          } else if (trimmed) {
            if (currentParagraph) {
              currentParagraph += ' ' + trimmed;
            } else {
              currentParagraph = trimmed;
            }
          }
        });
        if (currentParagraph) paragraphs.push(`<p>${currentParagraph}</p>`);
        let html = '';
        if (paragraphs.length > 0) html += paragraphs.join('');
        if (listItems.length > 0) html += `<ul>${listItems.join('')}</ul>`;
        return html;
      }
    })
    .filter(section => section.trim())
    .join('');

  const requestBody: AnalysisDocumentUpdateRequest = {
    html_content: htmlContent,
    format: "docx"
  };

  const response = await httpClient.put(`${JOBS_API}/${jobId}/analysis-document`, requestBody);
  return response.data;
}

export async function updateJobDisplayName(jobId: string, displayname: string) {
  const response = await httpClient.patch(`${JOBS_API}/${jobId}`, { displayname });
  return response.data;
}

export async function getChatHistory(jobId: string): Promise<any> {
  const response = await fetchWithAuth(CHAT_ENDPOINTS.getHistory(jobId), {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  return response.json();
}

export function getJobStatusStreamURL(jobId: string): string {
  return JOB_STATUS_STREAM_API(jobId);
}

/**
 * Streams a chat response for interactive analysis discussion.
 *
 * Returns a streaming Response that can be read incrementally
 * for real-time chat display.
 *
 * @param {string} jobId - The job ID for context
 * @param {string} message - User's chat message
 * @param {Array<any>} [conversationHistory] - Previous conversation messages
 * @param {number} [maxTokens=2000] - Maximum response tokens
 *
 * @returns {Promise<Response>} Streaming fetch Response
 *
 * @example
 * ```tsx
 * import { streamChatResponse } from '@/features/recordings/data/api';
 *
 * const response = await streamChatResponse(
 *   'job-123',
 *   'What were the main action items?',
 *   previousMessages
 * );
 *
 * const reader = response.body?.getReader();
 * // Read stream chunks...
 * ```
 */
export function streamChatResponse(
  jobId: string,
  message: string,
  conversationHistory: Array<any> = [],
  maxTokens: number = 2000
): Promise<Response> {
  const messages = [
    ...conversationHistory
      .filter((item) => item?.role && item?.content)
      .map((item) => ({ role: item.role, content: item.content })),
    { role: 'user', content: message },
  ];

  return streamWithAuth(CHAT_ENDPOINTS.streamChat(jobId), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      thread_id: jobId,
      messages,
      max_tokens: maxTokens,
    }),
  });
}

export async function saveChatMessage(jobId: string, role: 'user' | 'assistant', content: string): Promise<void> {
  try {
    await fetchWithAuth(CHAT_ENDPOINTS.saveMessage(jobId), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role, content }),
    });
  } catch (error) {
    console.error('Failed to save message:', error);
  }
}

export async function clearChatHistory(jobId: string): Promise<{ status: string; message: string }> {
  const response = await fetchWithAuth(CHAT_ENDPOINTS.clearHistory(jobId), {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  return response.json();
}



