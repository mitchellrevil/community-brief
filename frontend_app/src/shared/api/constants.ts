const normalizeApiBaseUrl = (value?: string): string => {
	const trimmed = value?.trim() || '';
	if (!trimmed) {
		return '';
	}

	return trimmed.replace(/\/+(api(?:\/v1)?)\/?$/i, '');
};

const BASE_URL = normalizeApiBaseUrl(import.meta.env.VITE_API_URL);
export const API_V1_BASE = `${BASE_URL}/api/v1`;

export const ROOT_API = `${BASE_URL}/`;
export const ECHO_API = `${BASE_URL}/echo`;

export const AUTH_API = `${API_V1_BASE}/auth`;
export const LOGIN_API = `${AUTH_API}/login`;
export const REGISTER_API = `${AUTH_API}/users/register`;
export const AUTH_ME_API = `${AUTH_API}/me`;
export const AUTH_LOGOUT_API = `${AUTH_API}/logout`;
export const USER_MANAGEMENT_API = `${AUTH_API}/users`;
export const MY_PERMISSIONS_API = `${USER_MANAGEMENT_API}/me/permissions`;
export const USER_PERMISSIONS_API = (userId: string) => `${USER_MANAGEMENT_API}/${userId}/permission`;
export const USER_DETAILS_API = (userId: string) => `${USER_MANAGEMENT_API}/${userId}`;
export const USER_SEARCH_API = `${USER_MANAGEMENT_API}/search`;
export const PERMISSION_STATS_API = `${AUTH_API}/users/permission-stats`;
export const USERS_BY_PERMISSION_API = (permissionLevel: string) => `${AUTH_API}/users/by-permission/${permissionLevel}`;

export const PROMPTS_BASE = `${API_V1_BASE}/prompts`;
export const CATEGORIES_API = `${PROMPTS_BASE}/categories`;
export const CATEGORY_BY_ID = (categoryId: string) => `${CATEGORIES_API}/${categoryId}`;
export const SUBCATEGORIES_API = `${PROMPTS_BASE}/subcategories`;
export const SUBCATEGORY_BY_ID = (subcategoryId: string) => `${SUBCATEGORIES_API}/${subcategoryId}`;
export const SUBCATEGORY_VERSIONS_API = (subcategoryId: string) => `${SUBCATEGORY_BY_ID(subcategoryId)}/versions`;
export const SUBCATEGORY_VERSION_BY_ID_API = (subcategoryId: string, versionId: string) => `${SUBCATEGORY_VERSIONS_API(subcategoryId)}/${versionId}`;
export const SUBCATEGORY_VERSION_DIFF_API = (subcategoryId: string) => `${SUBCATEGORY_VERSIONS_API(subcategoryId)}/diff`;
export const SUBCATEGORY_VERSION_ROLLBACK_API = (subcategoryId: string, versionId: string) => `${SUBCATEGORY_VERSION_BY_ID_API(subcategoryId, versionId)}/rollback`;
export const PROMPTS_RETRIEVE_API = `${PROMPTS_BASE}/retrieve_prompts`;
export const PROMPTS_API = PROMPTS_RETRIEVE_API;

export const BUSINESS_UNITS_API = `${API_V1_BASE}/business-units`;
export const BUSINESS_UNIT_BY_ID = (unitId: string) => `${BUSINESS_UNITS_API}/${unitId}`;
export const BUSINESS_UNIT_STATS_API = (unitId: string) => `${BUSINESS_UNITS_API}/${unitId}/stats`;
export const BUSINESS_UNIT_ASSIGN_USER_API = `${BUSINESS_UNITS_API}/assign-user`;
export const BUSINESS_UNIT_BULK_UPDATE_USERS_API = `${BUSINESS_UNITS_API}/bulk-update-users`;

export const USERS_API = `${API_V1_BASE}/users`;
export const ADD_USER_TO_BUSINESS_UNIT_API = `${USERS_API}/add-to-business-unit`;
export const SELF_ASSIGN_BUSINESS_UNIT_API = `${USERS_API}/me/business-units`;

export const JOBS_API = `${API_V1_BASE}/jobs`;
export const JOB_BY_ID = (jobId: string) => `${JOBS_API}/${jobId}`;
export const JOB_TRANSCRIPTION_API = (jobId: string) => `${JOBS_API}/${jobId}/transcription`;
export const JOB_ANALYSIS_DOCUMENT_API = (jobId: string) => `${JOBS_API}/${jobId}/analysis-document`;
export const JOB_REPROCESS_API = (jobId: string) => `${JOBS_API}/${jobId}/reprocess`;
export const JOB_STATUS_STREAM_API = (jobId: string) => `${API_V1_BASE}/stream/jobs/${jobId}/status`;
export const JOB_SHARE_API = (jobId: string) => `${JOBS_API}/${jobId}/share`;
export const JOB_SHARING_INFO_API = (jobId: string) => `${JOBS_API}/${jobId}/sharing`;
export const SHARED_JOBS_API = `${JOBS_API}/shared`;
export const JOB_RESTORE_API = (jobId: string) => `${JOBS_API}/${jobId}/restore`;

export const ADMIN_JOBS_API = `${API_V1_BASE}/admin/jobs`;
export const ADMIN_DELETED_JOBS_API = `${ADMIN_JOBS_API}/deleted`;
export const ADMIN_JOB_RESTORE_API = (jobId: string) => `${ADMIN_JOBS_API}/${jobId}/restore`;
export const ADMIN_JOB_PERMANENT_DELETE_API = (jobId: string) => `${ADMIN_JOBS_API}/${jobId}/permanent`;
export const ADMIN_JOB_REPROCESS_BLOB_API = (jobId: string) => `${ADMIN_JOBS_API}/${jobId}/reprocess-blob`;
export const ADMIN_USER_JOBS_API = (userId: string) => `${ADMIN_JOBS_API}/user/${userId}`;
export const ADMIN_JOBS_STATS_API = `${ADMIN_JOBS_API}/stats`;

export const ANALYTICS_API = `${API_V1_BASE}/analytics`;
export const SYSTEM_ANALYTICS_API = `${ANALYTICS_API}/system`;
export const ANALYTICS_DASHBOARD_API = `${ANALYTICS_API}/dashboard`;
export const USER_ANALYTICS_API = `${ANALYTICS_API}/users`;
export const USER_MINUTES_API = (userId: string) => `${USER_ANALYTICS_API}/${userId}/minutes`;
export const ACTIVE_USERS_API = `${ANALYTICS_API}/active-users`;
export const USER_SESSION_DURATION_API = `${ANALYTICS_API}/user-session-duration`;

export const SYSTEM_HEALTH_API = `${BASE_URL}/health/ready`;
export const HEALTH_ROOT = `${BASE_URL}/health/`;
export const HEALTH_READY = `${BASE_URL}/health/ready`;

export const EXPORT_BASE_API = `${ANALYTICS_API}/export`;
export const EXPORT_SYSTEM_CSV_API = `${EXPORT_BASE_API}/system/csv`;
export const EXPORT_SYSTEM_PROMPTS_CSV_API = `${SYSTEM_ANALYTICS_API}/export/prompts`;
export const EXPORT_USERS_API = `${EXPORT_BASE_API}/users`;
export const EXPORT_USERS_FORMAT_API = (format: string) => `${EXPORT_USERS_API}/${format}`;
export const EXPORT_USER_PDF_API = (userId: string) => `${EXPORT_USERS_API}/${userId}/pdf`;

export const UPLOAD_API = `${API_V1_BASE}/upload`;
export const UPLOAD_REQUEST_TOKEN_API = `${UPLOAD_API}/request-token`;
export const UPLOAD_COMPLETE_API = `${UPLOAD_API}/complete`;
export const TRANSCRIPTION_API = (jobId: string) => `${JOBS_API}/${jobId}/transcription`;

export const ADMIN_JOBS_LISTING = ADMIN_JOBS_API;
export const ADMIN_PERMANENT_DELETE_API = ADMIN_JOB_PERMANENT_DELETE_API;

export const CHAT_ENDPOINTS = {
	streamChat: (jobId: string) => `${JOBS_API}/${jobId}/chat/stream`,
	saveMessage: (jobId: string) => `${JOBS_API}/${jobId}/chat/save`,
	getHistory: (jobId: string) => `${JOBS_API}/${jobId}/chat/history`,
	clearHistory: (jobId: string) => `${JOBS_API}/${jobId}/chat/history`,
} as const;

export const REFINEMENT_ENDPOINTS = {
	create: (jobId: string) => `${JOBS_API}/${jobId}/refinements`,
	getHistory: (jobId: string) => `${JOBS_API}/${jobId}/refinements`,
	getSuggestions: (jobId: string) => `${JOBS_API}/${jobId}/refinements/suggestions`,
} as const;

export const ANALYSIS_ENDPOINTS = {
	updateDocument: (jobId: string) => `${JOBS_API}/${jobId}/analysis`,
	updateFromUI: (jobId: string) => `${JOBS_API}/${jobId}/analysis-document`,
} as const;

// Announcements
export const ANNOUNCEMENTS_API = `${API_V1_BASE}/announcements`;
export const ANNOUNCEMENT_BY_ID = (announcementId: string) => `${ANNOUNCEMENTS_API}/${announcementId}`;
export const ANNOUNCEMENT_DISMISS_API = (announcementId: string) => `${ANNOUNCEMENTS_API}/${announcementId}/dismiss`;
export const ANNOUNCEMENT_READ_API = (announcementId: string) => `${ANNOUNCEMENTS_API}/${announcementId}/read`;

export const ADMIN_ANNOUNCEMENTS_API = `${API_V1_BASE}/admin/announcements`;
export const ADMIN_ANNOUNCEMENT_BY_ID = (announcementId: string) => `${ADMIN_ANNOUNCEMENTS_API}/${announcementId}`;
